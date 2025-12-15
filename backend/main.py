from fastapi import FastAPI
import database, models
from auth import router as auth_router
from files import router as files_router

app = FastAPI()

models.Base.metadata.create_all(bind=database.engine)

# Налаштування статичних файлів
from fastapi.staticfiles import StaticFiles
import os
os.makedirs("uploads", exist_ok=True) 

@app.get("/")
def root():
    return {"message": "Backend працює!"}

app.include_router(auth_router, prefix="/api")   # Тепер ловить /api/login
app.include_router(files_router, prefix="/api")
