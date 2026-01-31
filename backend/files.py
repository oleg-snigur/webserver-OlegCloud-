import uuid
import os
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import database, models, auth
from s3 import get_s3_client, BUCKET_NAME
from urllib.parse import quote

router = APIRouter()
MAX_USER_QUOTA_MB = 100

# --- Pydantic моделі ---
class FileUpdate(BaseModel):
    filename: str

class FolderUpdate(BaseModel):
    name: str

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class MoveRequest(BaseModel):
    file_ids: List[int] = []
    folder_ids: List[int] = []
    target_folder_id: Optional[int] = None

# --- Допоміжні функції ---
def get_or_create_folder_path(db: Session, user_id: int, root_folder_id: Optional[int], path_str: str) -> Optional[int]:
    if not path_str or path_str == ".":
        return root_folder_id
    
    parts = path_str.strip("/").split("/")
    current_parent_id = root_folder_id
    
    for part in parts:
        if not part: continue
        folder = db.query(models.Folder).filter(
            models.Folder.owner_id == user_id,
            models.Folder.parent_id == current_parent_id,
            models.Folder.name == part
        ).first()
        
        if not folder:
            folder = models.Folder(name=part, parent_id=current_parent_id, owner_id=user_id)
            db.add(folder)
            db.commit()
            db.refresh(folder)
        
        current_parent_id = folder.id
    return current_parent_id

def delete_folder_recursive(folder_id: int, db: Session, s3, bucket_name: str, user_id: int):
    subfolders = db.query(models.Folder).filter(models.Folder.parent_id == folder_id).all()
    for sub in subfolders:
        delete_folder_recursive(sub.id, db, s3, bucket_name, user_id)
    
    files = db.query(models.File).filter(models.File.folder_id == folder_id).all()
    for f in files:
        try:
            s3.delete_object(Bucket=bucket_name, Key=f.path)
        except Exception as e:
            print(f"S3 Delete Error: {e}")
        db.delete(f)
    
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if folder:
        db.delete(folder)

# --- API Endpoints ---

@router.post("/folders")
def create_folder(
    folder: FolderCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    if folder.parent_id:
        parent = db.query(models.Folder).filter(models.Folder.id == folder.parent_id).first()
        if not parent or parent.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Батьківську папку не знайдено")

    new_folder = models.Folder(
        name=folder.name,
        parent_id=folder.parent_id,
        owner_id=current_user.id
    )
    db.add(new_folder)
    db.commit()
    return {"message": "Папку створено", "folder": new_folder}

@router.patch("/folders/{folder_id}")
def rename_folder(
    folder_id: int,
    folder_update: FolderUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder or folder.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Папку не знайдено")
    
    new_name = folder_update.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Назва не може бути порожньою")

    folder.name = new_name
    db.commit()
    db.refresh(folder)
    return {"message": "Папку перейменовано", "filename": folder.name}

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    relative_path: Optional[str] = Form(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    target_folder_id = folder_id
    if relative_path:
        folder_structure = os.path.dirname(relative_path)
        if folder_structure:
            target_folder_id = get_or_create_folder_path(db, current_user.id, folder_id, folder_structure)

    if target_folder_id:
        folder = db.query(models.Folder).filter(models.Folder.id == target_folder_id).first()
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Цільову папку не знайдено")

    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_mb = file_size_bytes / (1024 * 1024)

    used_space = db.query(func.sum(models.File.size)).filter(models.File.owner_id == current_user.id).scalar() or 0
    if used_space + file_size_mb > MAX_USER_QUOTA_MB:
        raise HTTPException(status_code=400, detail="Перевищено ліміт сховища")

    file_ext = os.path.splitext(file.filename)[1]
    s3_key = f"{current_user.id}/{uuid.uuid4()}{file_ext}"

    try:
        await s3.upload_fileobj(file.file, BUCKET_NAME, s3_key)
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        raise HTTPException(status_code=500, detail="Помилка завантаження в хмару")

    new_file = models.File(
        filename=file.filename,
        path=s3_key,
        size=file_size_mb,
        content_type=file.content_type,
        owner_id=current_user.id,
        folder_id=target_folder_id 
    )
    db.add(new_file)
    db.commit()
    return {"message": "OK", "filename": file.filename}

@router.get("/download/{file_id}")
async def download_file(
    file_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    file_record = db.query(models.File).filter(models.File.id == file_id).first()
    if not file_record or file_record.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Файл не знайдено")

    try:
        s3_response = await s3.get_object(Bucket=BUCKET_NAME, Key=file_record.path)
        encoded_filename = quote(file_record.filename)
        return StreamingResponse(
            s3_response['Body'].iter_chunks(),
            media_type=file_record.content_type,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
        )
    except Exception as e:
        print(f"S3 Download Error: {e}")
        raise HTTPException(status_code=404, detail="Файл не знайдено в сховищі")

# backend/files.py

# --- Допоміжна функція (тільки збирає ID та шляхи) ---
def collect_deletion_data(folder_id: int, db: Session, user_id: int):
    """
    Рекурсивно збирає всі ID папок, ID файлів та S3-ключі для видалення.
    Не робить змін у БД чи S3. Тільки Read.
    """
    folder_ids = [folder_id]
    file_ids = []
    s3_keys = []

    # Знаходимо підпапки
    subfolders = db.query(models.Folder).filter(models.Folder.parent_id == folder_id).all()
    for sub in subfolders:
        sub_data = collect_deletion_data(sub.id, db, user_id)
        folder_ids.extend(sub_data['folder_ids'])
        file_ids.extend(sub_data['file_ids'])
        s3_keys.extend(sub_data['s3_keys'])

    # Знаходимо файли в поточній папці
    files = db.query(models.File).filter(models.File.folder_id == folder_id).all()
    for f in files:
        file_ids.append(f.id)
        s3_keys.append(f.path)

    return {"folder_ids": folder_ids, "file_ids": file_ids, "s3_keys": s3_keys}


# --- Оновлений Endpoint ---
@router.delete("/delete/{item_id}")
async def delete_item(
    item_id: int,
    type: str = "file",
    force: bool = Query(False),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    # 1. Логіка для ФАЙЛУ
    if type == 'file':
        file_record = db.query(models.File).filter(models.File.id == item_id).first()
        if not file_record or file_record.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Файл не знайдено")
        
        # Спочатку видаляємо з S3 (використовуємо await!)
        try:
            await s3.delete_object(Bucket=BUCKET_NAME, Key=file_record.path)
        except Exception as e:
            print(f"S3 Delete Warning: {e}") # Логуємо, але дозволяємо видалити з БД
            
        db.delete(file_record)
        db.commit()

    # 2. Логіка для ПАПКИ
    elif type == 'folder':
        folder = db.query(models.Folder).filter(models.Folder.id == item_id).first()
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Папку не знайдено")
        
        # Перевірка на порожнечу (якщо не force)
        sub_files = db.query(models.File).filter(models.File.folder_id == item_id).count()
        sub_folders = db.query(models.Folder).filter(models.Folder.parent_id == item_id).count()
        
        if (sub_files > 0 or sub_folders > 0) and not force:
             raise HTTPException(status_code=409, detail="Папка містить файли")

        # КРОК 1: Збираємо дані (Read)
        data_to_delete = collect_deletion_data(item_id, db, current_user.id)
        
        # КРОК 2: Видаляємо з S3 (Batch Delete з валідацією)
        # Фільтруємо сміття: ключ має бути рядком і не порожнім
        valid_s3_keys = [k for k in data_to_delete['s3_keys'] if k and isinstance(k, str) and len(k.strip()) > 0]
        
        if valid_s3_keys:
            # Формуємо правильну структуру для boto3
            objects_to_delete = [{'Key': key} for key in valid_s3_keys]
            
            try:
                # Видаляємо пачками по 1000 (обмеження S3 API)
                for i in range(0, len(objects_to_delete), 1000):
                    batch = objects_to_delete[i:i + 1000]
                    await s3.delete_objects(
                        Bucket=BUCKET_NAME,
                        Delete={'Objects': batch, 'Quiet': True}
                    )
            except Exception as e:
                print(f"Bulk Delete Critical Error: {e}")

        # КРОК 3: Видаляємо з БД (CPU/DB Bound)
        if data_to_delete['file_ids']:
            db.query(models.File).filter(models.File.id.in_(data_to_delete['file_ids'])).delete(synchronize_session=False)
      
        for fid in reversed(data_to_delete['folder_ids']):
             db.query(models.Folder).filter(models.Folder.id == fid).delete(synchronize_session=False)

        db.commit()

    return {"message": "Видалено"}

@router.post("/move")
def move_items(
    move_req: MoveRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    if move_req.target_folder_id:
        target = db.query(models.Folder).filter(models.Folder.id == move_req.target_folder_id).first()
        if not target or target.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Цільову папку не знайдено")
        if move_req.folder_ids and move_req.target_folder_id in move_req.folder_ids:
            raise HTTPException(status_code=400, detail="Не можна перемістити папку в саму себе")

    if move_req.file_ids:
        db.query(models.File).filter(
            models.File.id.in_(move_req.file_ids),
            models.File.owner_id == current_user.id
        ).update({models.File.folder_id: move_req.target_folder_id}, synchronize_session=False)

    if move_req.folder_ids:
        db.query(models.Folder).filter(
            models.Folder.id.in_(move_req.folder_ids),
            models.Folder.owner_id == current_user.id
        ).update({models.Folder.parent_id: move_req.target_folder_id}, synchronize_session=False)

    db.commit()
    return {"message": "Успішно переміщено"}

@router.patch("/files/{file_id}")
async def rename_file(
    file_id: int,
    file_update: FileUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    file_record = db.query(models.File).filter(models.File.id == file_id).first()
    if not file_record or file_record.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Файл не знайдено")

    _, original_ext = os.path.splitext(file_record.filename)
    new_name_input = file_update.filename.strip()
    new_root, _ = os.path.splitext(new_name_input)

    if not new_root:
        raise HTTPException(status_code=400, detail="Файл повинен мати ім'я")

    file_record.filename = new_root + original_ext
    db.commit()
    db.refresh(file_record)
    return {"message": "Файл перейменовано", "filename": file_record.filename}

@router.get("/my-files")
def get_my_files(
    folder_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    folders_query = db.query(models.Folder).filter(
        models.Folder.owner_id == current_user.id,
        models.Folder.parent_id == folder_id
    ).order_by(models.Folder.name.asc()).all()

    files_query = db.query(models.File).filter(
        models.File.owner_id == current_user.id,
        models.File.folder_id == folder_id
    ).order_by(models.File.created_at.desc()).all()

    current_folder = None
    if folder_id:
        current_folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    path = []
    temp_curr = current_folder
    while temp_curr:
        path.insert(0, {"id": temp_curr.id, "name": temp_curr.name})
        if temp_curr.parent_id:
            temp_curr = db.query(models.Folder).filter(models.Folder.id == temp_curr.parent_id).first()
        else:
            temp_curr = None
    path.insert(0, {"id": None, "name": "Головна"})

    response = {
        "current_folder": {
            "id": current_folder.id if current_folder else None,
            "name": current_folder.name if current_folder else "Головна",
            "parent_id": current_folder.parent_id if current_folder else None
        },
        "path": path,
        "items": []
    }

    for f in folders_query:
        response["items"].append({
            "id": f.id,
            "filename": f.name,
            "type": "folder",
            "created_at": f.created_at,
            "size": 0,
            "content_type": "folder"
        })

    for f in files_query:
        response["items"].append({
            "id": f.id,
            "filename": f.filename,
            "type": "file",
            "created_at": f.created_at,
            "size": f.size,
            "content_type": f.content_type
        })
    return response

@router.get("/storage-info")
def get_storage_info(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    files = db.query(models.File).filter(models.File.owner_id == current_user.id).all()
    total_used_mb = sum(f.size for f in files)
    usage_by_type = {"Зображення": 0, "Документи": 0, "Відео": 0, "Інше": 0}

    for file in files:
        if file.content_type.startswith("image/"): usage_by_type["Зображення"] += file.size
        elif file.content_type.startswith("video/"): usage_by_type["Відео"] += file.size
        elif file.content_type in ["application/pdf", "text/plain"]: usage_by_type["Документи"] += file.size
        else: usage_by_type["Інше"] += file.size

    return {
        "total_used_mb": round(total_used_mb, 2),
        "total_limit_mb": MAX_USER_QUOTA_MB,
        "percent_used": round((total_used_mb / MAX_USER_QUOTA_MB) * 100, 1),
        "usage_by_type": {k: round(v, 2) for k, v in usage_by_type.items() if v > 0}
    }
