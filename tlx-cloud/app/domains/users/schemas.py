from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    id: int
    role: str
    full_name: Optional[str]
    phone: Optional[str]
    logo: Optional[str]
    last_login: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)


class UserCreateReq(UserBase):
    email: EmailStr
    password: str
    role: str = 'user'


class Token(BaseModel):
    access_token: str
    refresh_token: str


class TokenPayload(BaseModel):
    sub: Optional[int] = None
    type: Optional[str] = None
    jti: Optional[str] = None


class UpdateUserReq(UserBase):
    logo: Optional[str] = None
    is_active: Optional[bool] = True



    