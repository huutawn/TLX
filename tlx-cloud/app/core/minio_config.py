from minio import Minio
from app.core.config import settings  

minio_client = Minio(
    settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=False
)


def get_minio_client() -> Minio:
    
    return minio_client