from app.helpers.bases import BareBaseModel
from sqlalchemy import String, Column, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
class InvalidateToken(BareBaseModel):
    jti: Mapped[str] = mapped_column(unique=True, nullable=False,index=True)
    exp: Mapped[Optional[datetime]]