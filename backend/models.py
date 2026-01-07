# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Зв'язки
    files = relationship("File", back_populates="owner")
    folders = relationship("Folder", back_populates="owner")

class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Власник папки
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="folders")

    # Батьківська папка (Self-referencing relationship)
    # Якщо NULL - це коренева папка
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    children = relationship("Folder", backref="parent", remote_side=[id])

    # Файли всередині цієї папки
    files = relationship("File", back_populates="folder")

class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)      # S3 ключ
    size = Column(Float, default=0.0)          # MB
    content_type = Column(String, default="file")
    created_at = Column(DateTime, default=datetime.utcnow)

    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="files")

    # Зв'язок з папкою (якщо NULL - файл в корені)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    folder = relationship("Folder", back_populates="files")
