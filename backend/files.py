import uuid
import os
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import database, models, auth
from s3 import get_s3_client, BUCKET_NAME
from urllib.parse import quote
from typing import List
from fastapi import Query

router = APIRouter()
MAX_USER_QUOTA_MB = 100

# --- Pydantic моделі ---
class FileUpdate(BaseModel):
    filename: str

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderUpdate(BaseModel):
    name: str

# --- API Endpoints ---

@router.post("/folders")
def create_folder(
    folder: FolderCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Перевірка батьківської папки
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

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None), # <--- Приймаємо ID папки
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    # Перевірка папки
    if folder_id:
        folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Папку не знайдено")

    # 1. Перевірка квоти
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_mb = file_size_bytes / (1024 * 1024)

    used_space = db.query(func.sum(models.File.size)).filter(models.File.owner_id == current_user.id).scalar() or 0
    if used_space + file_size_mb > MAX_USER_QUOTA_MB:
        raise HTTPException(status_code=400, detail="Перевищено ліміт сховища")

    # 2. Генеруємо ключ S3
    file_ext = os.path.splitext(file.filename)[1]
    s3_key = f"{current_user.id}/{uuid.uuid4()}{file_ext}"

    # 3. Завантаження в хмару
    try:
        await s3.upload_fileobj(file.file, BUCKET_NAME, s3_key)
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        raise HTTPException(status_code=500, detail="Помилка завантаження в хмару")

    # 4. Запис в БД
    new_file = models.File(
        filename=file.filename,
        path=s3_key,
        size=file_size_mb,
        content_type=file.content_type,
        owner_id=current_user.id,
        folder_id=folder_id 
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

    if not file_record:
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    if file_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    try:
        s3_response = await s3.get_object(Bucket=BUCKET_NAME, Key=file_record.path)
        encoded_filename = quote(file_record.filename)

        return StreamingResponse(
            s3_response['Body'].iter_chunks(),
            media_type=file_record.content_type,
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            }
        )
    except Exception as e:
        print(f"S3 Download Error: {e}")
        raise HTTPException(status_code=404, detail="Файл не знайдено в сховищі")

@router.delete("/delete/{item_id}")
async def delete_item(
    item_id: int,
    type: str = "file", 
    force: bool = Query(False), # <-- Новий параметр: force=True для видалення непорожньої папки
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    if type == 'file':
        file_record = db.query(models.File).filter(models.File.id == item_id).first()
        if not file_record or file_record.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Файл не знайдено")
        
        try:
            await s3.delete_object(Bucket=BUCKET_NAME, Key=file_record.path)
        except Exception as e:
            print(f"S3 Delete Warning: {e}")
        
        db.delete(file_record)
        db.commit()

    elif type == 'folder':
        folder = db.query(models.Folder).filter(models.Folder.id == item_id).first()
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Папку не знайдено")
        
        # Перевіряємо, чи є щось всередині
        sub_files = db.query(models.File).filter(models.File.folder_id == item_id).count()
        sub_folders = db.query(models.Folder).filter(models.Folder.parent_id == item_id).count()
        
        if (sub_files > 0 or sub_folders > 0) and not force:
            # Якщо папка не пуста і немає прапорця force - повертаємо помилку 409
            raise HTTPException(status_code=409, detail="Папка містить файли")

        # Якщо force=True або папка пуста - видаляємо рекурсивно
        delete_folder_recursive(item_id, db, s3, BUCKET_NAME, current_user.id)
        db.commit()

    return {"message": "Видалено"}

@router.patch("/files/{file_id}")
async def rename_file(
    file_id: int,
    file_update: FileUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    file_record = db.query(models.File).filter(models.File.id == file_id).first()

    if not file_record:
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    if file_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    # Зберігаємо розширення
    _, original_ext = os.path.splitext(file_record.filename)
    new_name_input = file_update.filename.strip()
    new_root, _ = os.path.splitext(new_name_input)

    if not new_root:
        raise HTTPException(status_code=400, detail="Файл повинен мати ім'я")

    final_filename = new_root + original_ext
    file_record.filename = final_filename
    db.commit()
    db.refresh(file_record)

    return {"message": "Файл перейменовано", "filename": file_record.filename}

@router.patch("/folders/{folder_id}")
def rename_folder(
    folder_id: int,
    folder_update: FolderUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Папку не знайдено")
    if folder.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ заборонено")
    
    new_name = folder_update.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Назва папки не може бути порожньою")

    folder.name = new_name
    db.commit()
    db.refresh(folder)

    return {"message": "Папку перейменовано", "filename": folder.name} # Повертаємо як filename для сумісності з JS


@router.get("/my-files")
def get_my_files(
    folder_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 1. Отримуємо вміст (папки і файли) - ЦЕ БЕЗ ЗМІН
    folders_query = db.query(models.Folder).filter(
        models.Folder.owner_id == current_user.id,
        models.Folder.parent_id == folder_id
    ).order_by(models.Folder.name.asc()).all()

    files_query = db.query(models.File).filter(
        models.File.owner_id == current_user.id,
        models.File.folder_id == folder_id
    ).order_by(models.File.created_at.desc()).all()

    # 2. Отримуємо поточну папку
    current_folder = None
    if folder_id:
        current_folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    # --- НОВЕ: Генеруємо повний шлях (Breadcrumbs) ---
    path = []
    temp_curr = current_folder
    
    # Піднімаємось від поточної папки до кореня
    while temp_curr:
        path.insert(0, {"id": temp_curr.id, "name": temp_curr.name}) # Додаємо в початок списку
        if temp_curr.parent_id:
            temp_curr = db.query(models.Folder).filter(models.Folder.id == temp_curr.parent_id).first()
        else:
            temp_curr = None
            
    # Додаємо "Головну" на початок
    path.insert(0, {"id": None, "name": "Головна"})
    # -----------------------------------------------

    response = {
        "current_folder": {
            "id": current_folder.id if current_folder else None,
            "name": current_folder.name if current_folder else "Головна",
            "parent_id": current_folder.parent_id if current_folder else None
        },
        "path": path, # <--- Віддаємо шлях на фронтенд
        "items": []
    }

    # Формування списку items (БЕЗ ЗМІН)
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


class MoveRequest(BaseModel):
    file_ids: List[int] = []
    folder_ids: List[int] = []
    target_folder_id: Optional[int] = None # Якщо None - то це корінь

@router.post("/move")
def move_items(
    move_req: MoveRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 1. Перевірка цільової папки (якщо це не корінь)
    if move_req.target_folder_id:
        target = db.query(models.Folder).filter(models.Folder.id == move_req.target_folder_id).first()
        if not target or target.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Цільову папку не знайдено")
        
        # Базовий захист від циклів: не можна перемістити папку саму в себе
        if move_req.folder_ids and move_req.target_folder_id in move_req.folder_ids:
            raise HTTPException(status_code=400, detail="Не можна перемістити папку в саму себе")

    # 2. Переміщення Файлів
    if move_req.file_ids:
        db.query(models.File).filter(
            models.File.id.in_(move_req.file_ids),
            models.File.owner_id == current_user.id
        ).update({models.File.folder_id: move_req.target_folder_id}, synchronize_session=False)

    # 3. Переміщення Папок
    if move_req.folder_ids:
        db.query(models.Folder).filter(
            models.Folder.id.in_(move_req.folder_ids),
            models.Folder.owner_id == current_user.id
        ).update({models.Folder.parent_id: move_req.target_folder_id}, synchronize_session=False)

    db.commit()
    return {"message": "Успішно переміщено"}

def delete_folder_recursive(folder_id: int, db: Session, s3, bucket_name: str, user_id: int):
    # 1. Знаходимо і видаляємо всі підпапки
    subfolders = db.query(models.Folder).filter(models.Folder.parent_id == folder_id).all()
    for sub in subfolders:
        delete_folder_recursive(sub.id, db, s3, bucket_name, user_id)
    
    # 2. Знаходимо всі файли в цій папці
    files = db.query(models.File).filter(models.File.folder_id == folder_id).all()
    for f in files:
        # Видаляємо з S3
        try:
            s3.delete_object(Bucket=bucket_name, Key=f.path)
        except Exception as e:
            print(f"S3 Delete Error: {e}")
        # Видаляємо з БД
        db.delete(f)
    
    # 3. Видаляємо саму папку
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if folder:
        db.delete(folder)
