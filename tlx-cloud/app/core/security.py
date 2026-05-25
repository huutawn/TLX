import jwt

from typing import Any, Union
from app.core.config import settings
from datetime import datetime, timedelta
from passlib.context import CryptContext
from app.domains.users.models import User
import uuid

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(user: User) -> str:
    expire = datetime.utcnow() + timedelta(
        seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS
    )
    to_encode = {
        "exp": expire, "sub": str(user.id), 'type': 'access', 'role': user.role, 'jti': str(uuid.uuid4())
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.SECURITY_ALGORITHM)
    return encoded_jwt


def create_refresh_token(subject: Union[int, Any]) -> str:
    expire = datetime.utcnow() + timedelta(
        seconds=settings.REFRESH_TOKEN_EXPIRE_MINUTES
    )
    to_encode = {"exp": expire, "sub": str(subject), 'type': 'refresh'}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.SECURITY_ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)