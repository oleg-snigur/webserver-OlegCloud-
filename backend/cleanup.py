# backend/cleanup.py
import os
import boto3
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import models  # Твої моделі

# Завантаження змінних оточення
load_dotenv()

# Налаштування БД
USER = os.getenv("POSTGRES_USER", "user")
PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")
DB_NAME = os.getenv("POSTGRES_DB", "mydb")
HOST = os.getenv("POSTGRES_HOST", "db") # Якщо запускаєш ззовні контейнера, зміни на localhost
PORT = os.getenv("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Налаштування S3 (використовуємо синхронний boto3 для скрипта)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
ACCESS_KEY = os.getenv("MINIO_ROOT_USER", "admin")
SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD", "password")
BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "userfiles")

def get_db_files(db):
    """Отримує список всіх шляхів (paths) з бази даних"""
    files = db.query(models.File).all()
    # Повертаємо множину (set) для швидкого пошуку
    return {f.path for f in files if f.path}

def clean_orphans():
    print("--- 🧹 Start Garbage Collection ---")
    
    db = SessionLocal()
    try:
        # 1. Отримуємо список "легальних" файлів
        db_paths = get_db_files(db)
        print(f"📂 Files in DB: {len(db_paths)}")

        # 2. Підключаємось до S3
        s3 = boto3.client('s3',
            endpoint_url=MINIO_ENDPOINT,
            aws_access_key_id=ACCESS_KEY,
            aws_secret_access_key=SECRET_KEY
        )

        # 3. Скануємо бакет (pagination, якщо файлів багато)
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=BUCKET_NAME)

        orphans = []
        total_s3_files = 0

        print("🔍 Scanning S3 bucket...")
        for page in pages:
            if 'Contents' not in page:
                continue
            
            for obj in page['Contents']:
                key = obj['Key']
                total_s3_files += 1
                
                # Якщо файлу немає в базі - це сирота
                if key not in db_paths:
                    orphans.append({'Key': key})

        print(f"☁️  Files in S3: {total_s3_files}")
        print(f"🗑  Orphans found: {len(orphans)}")

        # 4. Видалення
        if orphans:
            print("🚀 Deleting orphans...")
            # Видаляємо пачками по 1000
            for i in range(0, len(orphans), 1000):
                batch = orphans[i:i+1000]
                response = s3.delete_objects(
                    Bucket=BUCKET_NAME,
                    Delete={'Objects': batch, 'Quiet': True}
                )
                # Перевірка на помилки
                if 'Errors' in response:
                    print(f"⚠️ Errors deleting batch: {response['Errors']}")
                else:
                    print(f"✅ Batch {i // 1000 + 1} deleted.")
        else:
            print("✨ System is clean.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_orphans()