from fastapi.responses import FileResponse
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import shutil
import os
import uuid
from typing import List

import models, database, auth

router = APIRouter()

# Налаштування
UPLOAD_DIR = "uploads"
MAX_USER_QUOTA_MB = 100

os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
def upload_file(
    file: UploadFile = File(...), 
    current_user: models.User = Depends(auth.get_current_user), 
    db: Session = Depends(database.get_db)
):
    # 1. Рахуємо розмір файлу
    file.file.seek(0, 2)
    file_size_bytes = file.file.tell()
    file.file.seek(0)
    file_size_mb = file_size_bytes / (1024 * 1024)

    # 2. Перевіряємо квоту
    used_space = db.query(func.sum(models.File.size)).filter(models.File.owner_id == current_user.id).scalar() or 0
    
    if used_space + file_size_mb > MAX_USER_QUOTA_MB:
        raise HTTPException(status_code=400, detail=f"Перевищено ліміт сховища ({MAX_USER_QUOTA_MB} MB)")

    # --- ЗМІНИ ТУТ (Створення особистої папки) ---
    
    # Створюємо шлях: uploads / {id_користувача}
    user_folder_path = os.path.join(UPLOAD_DIR, str(current_user.id))
    
    # Створюємо цю папку фізично, якщо її ще немає
    os.makedirs(user_folder_path, exist_ok=True)

    # Генеруємо унікальне ім'я
    file_ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4()}{file_ext}"
    
    # Повний шлях тепер веде в папку користувача
    file_path = os.path.join(user_folder_path, unique_name)

    # ---------------------------------------------

    # 4. Зберігаємо фізично
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception:
        raise HTTPException(status_code=500, detail="Помилка збереження файлу")

    # 5. Записуємо в базу
    new_file = models.File(
        filename=file.filename,
        path=file_path,
        size=file_size_mb,
        content_type=file.content_type,
        owner_id=current_user.id
    )
    db.add(new_file)
    db.commit()
    
    return {"message": "OK", "filename": file.filename}

@router.get("/my-files")
def get_my_files(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    return db.query(models.File).filter(models.File.owner_id == current_user.id).order_by(models.File.created_at.desc()).all()

# Додайте імпорт FileResponse на самому початку файлу:
from fastapi.responses import FileResponse

# ... (інший код) ...

# Новий ендпоінт для отримання файлу
@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 1. Шукаємо файл в базі
    file_record = db.query(models.File).filter(models.File.id == file_id).first()
    
    # 2. Перевірка: чи файл існує і чи він належить користувачу
    if not file_record:
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    
    if file_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ заборонено")

    # 3. Перевірка фізичної наявності
    if not os.path.exists(file_record.path):
        raise HTTPException(status_code=404, detail="Файл фізично відсутній на диску")

    # 4. Віддаємо файл
    # media_type допомагає браузеру зрозуміти, як відкрити файл (як картинку чи як текст)
    return FileResponse(
        path=file_record.path, 
        filename=file_record.filename,
        media_type=file_record.content_type
    )


@router.delete("/delete/{file_id}")
def delete_file(
    file_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 1. Шукаємо файл
    file_record = db.query(models.File).filter(models.File.id == file_id).first()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    
    # 2. Перевіряємо власника
    if file_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Це не ваш файл")

    # 3. Видаляємо фізично з диска
    if os.path.exists(file_record.path):
        try:
            os.remove(file_record.path)
        except Exception as e:
            print(f"Error deleting file: {e}")
            # Продовжуємо, щоб видалити хоча б з бази
            
    # 4. Видаляємо запис з бази
    db.delete(file_record)
    db.commit()
    
    return {"message": "Файл видалено"}


@router.get("/storage-info")
def get_storage_info(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    files = db.query(models.File).filter(models.File.owner_id == current_user.id).all()
    
    total_used_mb = 0
    usage_by_type = {
        "Зображення": 0,
        "Документи": 0,
        "Відео": 0,
        "Інше": 0
    }

    for file in files:
        total_used_mb += file.size
        
        # Групуємо за MIME-типом
        if file.content_type.startswith("image/"):
            usage_by_type["Зображення"] += file.size
        elif file.content_type.startswith("video/"):
            usage_by_type["Відео"] += file.size
        elif file.content_type in ["application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
            usage_by_type["Документи"] += file.size
        else:
            usage_by_type["Інше"] += file.size

    return {
        "total_used_mb": round(total_used_mb, 2),
        "total_limit_mb": MAX_USER_QUOTA_MB,
        "percent_used": round((total_used_mb / MAX_USER_QUOTA_MB) * 100, 1),
        "usage_by_type": {k: round(v, 2) for k, v in usage_by_type.items() if v > 0} # Віддаємо тільки те, що > 0
    }
