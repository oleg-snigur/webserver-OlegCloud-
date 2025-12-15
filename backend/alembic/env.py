import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# ------------------------------------------------------------------------
# 1. Додаємо шлях до кореневої папки, щоб Alembic бачив 'database.py' і 'models.py'
sys.path.append(os.getcwd())

# 2. Імпортуємо Base (метадані) та URL бази даних з твого коду
from database import Base, SQLALCHEMY_DATABASE_URL
# 3. ОБОВ'ЯЗКОВО імпортуємо моделі, щоб вони зареєструвалися в Base
import models  
# ------------------------------------------------------------------------

# це об'єкт конфігурації Alembic, який дає доступ до .ini файлу
config = context.config

# 4. Переписуємо URL підключення з того, що в alembic.ini, на реальний з Python-коду
# Це дозволяє використовувати змінні оточення (Docker host, password тощо)
config.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)

# Налаштування логування
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 5. Вказуємо метадані для автогенерації (найважливіше для detect changes)
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # Створюємо engine, використовуючи наш URL з database.py
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=SQLALCHEMY_DATABASE_URL  # Явно передаємо URL сюди
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()