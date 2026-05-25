from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
import jwt
from pydantic import ValidationError
from app.core.config import settings
from app.db.base import get_db
from sqlalchemy import select
from ..domains.users.model import User
from ..domains.auth.model import InvalidateToken
from ..domains.users.schemas import TokenPayload
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from ..helpers.exception_handler import CustomException, ExceptionType
import logging

reusable_oauth2 = HTTPBearer(scheme_name='Authorization')


async def get_current_user_id(db: AsyncSession = Depends(get_db),
                           http_authorization_credentials=Depends(reusable_oauth2)) -> User:
    
    logging.warning('token')
    try:
        payload = jwt.decode(
            http_authorization_credentials.credentials, settings.SECRET_KEY,
            algorithms=[settings.SECURITY_ALGORITHM]
        )
        token_data = TokenPayload(sub=payload.get('sub'), jti=payload.get('jti'), type=payload.get('type'))
        if token_data.type == 'refresh':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='user is not authenticated'

            )
        token_jti = token_data.jti
        logging.info(token_jti)
        if not token_jti:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='could not get jti'
            )
        query_is_valid = select(InvalidateToken).filter(InvalidateToken.jti == token_data.jti)
        result = await db.execute(query_is_valid)
        is_valid = result.scalars().first()
        logging.info(is_valid)
        if is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='user is not authenticated'
            )
        int_token = int(token_data.sub)
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials",
        )
    return int_token

async def get_current_user(db: AsyncSession = Depends(get_db),
                           http_authorization_credentials=Depends(reusable_oauth2)) -> User:
    """
    Decode JWT token to get user_id => return User info from DB query
    """
    logging.warning('token')
    try:
        payload = jwt.decode(
            http_authorization_credentials.credentials, settings.SECRET_KEY,
            algorithms=[settings.SECURITY_ALGORITHM]
        )
        token_data = TokenPayload(sub=payload.get('sub'), jti=payload.get('jti'), type=payload.get('type'))
        if token_data.type == 'refresh':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='user is not authenticated'

            )
        token_jti = token_data.jti
        logging.info(token_jti)
        if not token_jti:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='could not get jti'
            )
        query_is_valid = select(InvalidateToken).filter(InvalidateToken.jti == token_data.jti)
        result = await db.execute(query_is_valid)
        is_valid = result.scalars().first()
        logging.info(is_valid)
        if is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='user is not authenticated'
            )
        int_token = int(token_data.sub)
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials",
        )
    user = await db.get(User, int(token_data.sub))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user