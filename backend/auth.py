from fastapi.security import OAuth2PasswordBearer
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_
import models, database
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import time

router = APIRouter()
SECRET_KEY = "POSTGRES_PASSWORD"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Схема для РЕЄСТРАЦІЇ
class UserRegister(BaseModel):
    username: str
    email: str
    password: str

# Схема для ВХОДУ
class UserLogin(BaseModel):
    identifier: str  # Тут може бути або email, або username
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    # Перевіряємо, чи зайнятий email АБО username
    existing_user = db.query(models.User).filter(
        or_(models.User.email == user.email, models.User.username == user.username)
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Користувач з таким email або логіном вже існує")
    
    hashed = get_password_hash(user.password)
    # Зберігаємо і username, і email
    new_user = models.User(username=user.username, email=user.email, password=hashed)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Користувача створено"}



@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(
        or_(
            models.User.email == user.identifier, 
            models.User.username == user.identifier
        )
    ).first()
    
    # Перевірка пароля
    if not db_user or not verify_password(user.password, db_user.password):
        # ЗАХИСТ: Сповільнюємо відповідь на 1 секунду
        time.sleep(1) 
        raise HTTPException(status_code=401, detail="Невірний логін/email або пароль")
    
    token = create_access_token({"sub": db_user.email})
    return {"access_token": token, "token_type": "bearer"}


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Шукаємо користувача по email
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user
