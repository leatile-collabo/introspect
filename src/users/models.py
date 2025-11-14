from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    first_name: str
    last_name: str
    clinic_id: Optional[UUID] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
    new_password_confirm: str
