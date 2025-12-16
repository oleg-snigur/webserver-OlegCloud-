FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir fastapi uvicorn psycopg2-binary sqlalchemy passlib[bcrypt] python-jose[cryptography] python-multipart python-dotenv alembic aiofiles "bcrypt==4.0.1"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
