from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import database, models
from auth import router as auth_router
from files import router as files_router
from s3 import init_bucket

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    await init_bucket()

app.include_router(auth_router, prefix="/api")
app.include_router(files_router, prefix="/api")

app.mount("/", StaticFiles(directory="static", html=True), name="static")