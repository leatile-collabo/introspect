"""add confirmation fields to test_results

Revision ID: add_confirmation_001
Revises: 
Create Date: 2025-01-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_confirmation_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add confirmation fields to test_results table
    op.add_column('test_results', sa.Column('is_confirmed', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('test_results', sa.Column('confirmed_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('test_results', sa.Column('confirmed_at', sa.DateTime(), nullable=True))
    op.add_column('test_results', sa.Column('confirmation_notes', sa.Text(), nullable=True))
    
    # Add foreign key constraint for confirmed_by
    op.create_foreign_key(
        'fk_test_results_confirmed_by_users',
        'test_results', 'users',
        ['confirmed_by'], ['id']
    )


def downgrade() -> None:
    # Drop foreign key constraint
    op.drop_constraint('fk_test_results_confirmed_by_users', 'test_results', type_='foreignkey')
    
    # Drop confirmation fields
    op.drop_column('test_results', 'confirmation_notes')
    op.drop_column('test_results', 'confirmed_at')
    op.drop_column('test_results', 'confirmed_by')
    op.drop_column('test_results', 'is_confirmed')

