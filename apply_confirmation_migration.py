#!/usr/bin/env python3
"""
Apply database migration for confirmation fields.
This script adds the confirmation workflow fields to the test_results table.
"""

from sqlalchemy import create_engine, text
from src.database.core import DATABASE_URL
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def apply_migration():
    """Apply the confirmation fields migration."""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        try:
            # Check if columns already exist (SQLite compatible)
            if DATABASE_URL.startswith("sqlite"):
                result = conn.execute(text("PRAGMA table_info(test_results)"))
                columns = [row[1] for row in result.fetchall()]

                if 'is_confirmed' in columns:
                    logger.info("Confirmation fields already exist. Skipping migration.")
                    return
            else:
                result = conn.execute(text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name='test_results' AND column_name='is_confirmed'
                """))

                if result.fetchone():
                    logger.info("Confirmation fields already exist. Skipping migration.")
                    return

            logger.info("Adding confirmation fields to test_results table...")

            # Add columns
            conn.execute(text("""
                ALTER TABLE test_results
                ADD COLUMN is_confirmed BOOLEAN NOT NULL DEFAULT 0
            """))

            conn.execute(text("""
                ALTER TABLE test_results
                ADD COLUMN confirmed_by TEXT
            """))

            conn.execute(text("""
                ALTER TABLE test_results
                ADD COLUMN confirmed_at TIMESTAMP
            """))

            conn.execute(text("""
                ALTER TABLE test_results
                ADD COLUMN confirmation_notes TEXT
            """))

            # Add foreign key constraint (if using PostgreSQL)
            if not DATABASE_URL.startswith("sqlite"):
                conn.execute(text("""
                    ALTER TABLE test_results
                    ADD CONSTRAINT fk_test_results_confirmed_by_users
                    FOREIGN KEY (confirmed_by) REFERENCES users(id)
                """))

            conn.commit()
            logger.info("✅ Migration applied successfully!")

        except Exception as e:
            logger.error(f"❌ Error applying migration: {str(e)}")
            conn.rollback()
            raise

if __name__ == "__main__":
    apply_migration()

