# app/core/config.py
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, '.env'),
        env_file_encoding='utf-8'
    )

    PROJECT_NAME: str = 'FASTAPI BASE'
    API_PREFIX: str = '/api'
    BACKEND_CORS_ORIGINS: list[str] = ['*']
    SECURITY_ALGORITHM: str = 'HS256'
    MINIO_ENDPOINT: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 60 * 60 * 24  # 7 ngày
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 60 * 24 * 7 * 4
    SECRET_KEY: str
    DATABASE_URL: str



settings = Settings()