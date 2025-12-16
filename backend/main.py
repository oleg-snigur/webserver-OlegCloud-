from fastapi import FastAPI
import database, models
from auth import router as auth_router
from files import router as files_router
from s3 import init_bucket

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    await init_bucket()

@app.get("/")
def root():
    return {"message": "Backend працює!"}

app.include_router(auth_router, prefix="/api")   # Тепер ловить /api/login
app.include_router(files_router, prefix="/api")
