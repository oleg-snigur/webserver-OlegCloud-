import uuid
import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
import database, models, auth
from s3 import get_s3_client, BUCKET_NAME
from urllib.parse import quote

router = APIRouter()
MAX_USER_QUOTA_MB = 100

# --- Pydantic модель для перейменування ---
class FileUpdate(BaseModel):
    filename: str

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    # 1. Перевірка квоти
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_mb = file_size_bytes / (1024 * 1024)

    used_space = db.query(func.sum(models.File.size)).filter(models.File.owner_id == current_user.id).scalar() or 0
    if used_space + file_size_mb > MAX_USER_QUOTA_MB:
        raise HTTPException(status_code=400, detail="Перевищено ліміт сховища")

    # 2. Генеруємо ключ для S3
    file_ext = os.path.splitext(file.filename)[1]
    s3_key = f"{current_user.id}/{uuid.uuid4()}{file_ext}"

    # 3. Завантажуємо в MinIO
    try:
        await s3.upload_fileobj(file.file, BUCKET_NAME, s3_key)
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        # !!! ВИПРАВЛЕНО: raise тепер всередині except
        raise HTTPException(status_code=500, detail="Помилка завантаження в хмару")

    # 4. Записуємо в БД
    new_file = models.File(
        filename=file.filename,
        path=s3_key,
        size=file_size_mb,
        content_type=file.content_type,
        owner_id=current_user.id
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

        # Важливо: Якщо s3 клієнт асинхронний (aioboto3), iter_chunks може працювати інакше.
        # Але зазвичай StreamingResponse приймає генератор.
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

@router.delete("/delete/{file_id}")
async def delete_file(
    file_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client)
):
    file_record = db.query(models.File).filter(models.File.id == file_id).first()

    if not file_record or file_record.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Файл не знайдено")

    try:
        await s3.delete_object(Bucket=BUCKET_NAME, Key=file_record.path)
    except Exception as e:
        print(f"S3 Delete Warning: {e}")

    db.delete(file_record)
    db.commit()

    return {"message": "Файл видалено"}

@router.patch("/files/{file_id}")
async def rename_file(
    file_id: int,
    file_update: FileUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 1. Шукаємо файл
    file_record = db.query(models.File).filter(models.File.id == file_id).first()

    if not file_record:
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    if file_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ заборонено")
    
    # 2. Отримуємо оригінальне розширення
    _, original_ext = os.path.splitext(file_record.filename)

    # 3. Розбираємо те, що ввів користувач
    new_name_input = file_update.filename.strip()
    
    # Розділяємо введене ім'я на корінь і розширення
    new_root, _ = os.path.splitext(new_name_input)

    # ВАЖЛИВО: Якщо корінь порожній (користувач ввів ".png" або просто пробіли)
    if not new_root:
        raise HTTPException(status_code=400, detail="Файл повинен мати ім'я")

    # 4. Формуємо фінальне ім'я: (Те, що ввів юзер до крапки) + (Оригінальне розширення)
    final_filename = new_root + original_ext

    # 5. Оновлюємо та зберігаємо
    file_record.filename = final_filename
    db.commit()
    db.refresh(file_record)

    return {"message": "Файл перейменовано", "filename": file_record.filename}

@router.get("/my-files")
def get_my_files(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    return db.query(models.File).filter(models.File.owner_id == current_user.id).order_by(models.File.created_at.desc()).all()

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
