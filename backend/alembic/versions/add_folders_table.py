"""add folders table

Revision ID: any_random_string_here
Revises: 5a0716841ee6
Create Date: 2025-12-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Вставте сюди ID попередньої міграції (з вашого файлу 5a0716841ee6...)
revision: str = 'add_folders_table' 
down_revision: Union[str, None] = '5a0716841ee6' 
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Створюємо таблицю folders
    op.create_table(
        'folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['parent_id'], ['folders.id'], )
    )
    op.create_index(op.f('ix_folders_id'), 'folders', ['id'], unique=False)

    # 2. Додаємо колонку folder_id до таблиці files
    op.add_column('files', sa.Column('folder_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'files', 'folders', ['folder_id'], ['id'])


def downgrade() -> None:
    # Відкат змін
    op.drop_constraint(None, 'files', type_='foreignkey')
    op.drop_column('files', 'folder_id')
    op.drop_index(op.f('ix_folders_id'), table_name='folders')
    op.drop_table('folders')
