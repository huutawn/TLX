from sqlalchemy import String, DateTime, ForeignKey, CheckConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.helpers.bases import BaseWithId
from datetime import datetime
from typing import Optional, List


class User(BaseWithId):
    email: Mapped[str] = mapped_column(unique=True, index=True)
    hash_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    role: Mapped[str] = mapped_column(default='user')
    status: Mapped[Optional[str]] = mapped_column(default='active', nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(100))
    phone: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    logo: Mapped[Optional[str]] = mapped_column(nullable=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
   
    