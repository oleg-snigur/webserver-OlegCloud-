import uuid
import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import database, models, auth
from s3 import get_s3_client, BUCKET_NAME
from urllib.parse import quote

router = APIRouter()
MAX_USER_QUOTA_MB = 100

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...), 
    current_user: models.User = Depends(auth.get_current_user), 
    db: Session = Depends(database.get_db),
    s3 = Depends(get_s3_client) # <--- Ін'єкція S3 клієнта
):
    # 1. Перевірка квоти (без змін)
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_mb = file_size_bytes / (1024 * 1024)

    used_space = db.query(func.sum(models.File.size)).filter(models.File.owner_id == current_user.id).scalar() or 0
    if used_space + file_size_mb > MAX_USER_QUOTA_MB:
        raise HTTPException(status_code=400, detail="Перевищено ліміт сховища")

    # 2. Генеруємо ключ для S3 (шлях у хмарі)
    file_ext = os.path.splitext(file.filename)[1]
    # Структура: user_id/uuid.ext
    s3_key = f"{current_user.id}/{uuid.uuid4()}{file_ext}"

    # 3. Завантажуємо в MinIO
    try:
        await s3.upload_fileobj(file.file, BUCKET_NAME, s3_key)
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        raise HTTPException(status_code=500, detail="Помилка завантаження в хмару")

    # 4. Записуємо в БД (зверни увагу: path тепер це s3_key)
    new_file = models.File(
        filename=file.filename,
        path=s3_key,  # <--- Зберігаємо ключ, а не локальний шлях
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

    # Стрімінг файлу з S3 користувачеві
    try:
        # Отримуємо об'єкт з S3
        s3_response = await s3.get_object(Bucket=BUCKET_NAME, Key=file_record.path)
   
        # Кодуємо назву файлу для заголовка (щоб працювала кирилиця)
        encoded_filename = quote(file_record.filename)
        
        return StreamingResponse(
            s3_response['Body'].iter_chunks(),
            media_type=file_record.content_type,
            # Використовуємо filename*=UTF-8'' для підтримки Unicode
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

    # Видаляємо з S3
    try:
        await s3.delete_object(Bucket=BUCKET_NAME, Key=file_record.path)
    except Exception as e:
        print(f"S3 Delete Warning: {e}")

    # Видаляємо з БД
    db.delete(file_record)
    db.commit()
    
    return {"message": "Файл видалено"}

# Інші роути (get_my_files, storage-info) залишаються без змін, 
# бо вони працюють тільки з БД.
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
    # Копіюємо логіку з старого файлу, вона не змінюється, бо читає з БД
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