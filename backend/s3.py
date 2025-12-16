# backend/s3.py
import os
import aioboto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
ACCESS_KEY = os.getenv("MINIO_ROOT_USER")
SECRET_KEY = os.getenv("MINIO_ROOT_PASSWORD")
BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "userfiles")

# Створюємо сесію
session = aioboto3.Session()

async def get_s3_client():
    # Context manager для клієнта
    async with session.client("s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        use_ssl=False  # Для локального MinIO SSL вимкнено
    ) as client:
        yield client

async def init_bucket():
    """Створює бакет при старті, якщо його немає"""
    async with session.client("s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        use_ssl=False
    ) as client:
        try:
            await client.head_bucket(Bucket=BUCKET_NAME)
        except ClientError:
            # Бакет не існує, створюємо
            await client.create_bucket(Bucket=BUCKET_NAME)
            print(f"Bucket {BUCKET_NAME} created")