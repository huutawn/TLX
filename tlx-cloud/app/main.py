import json
import logging
import uvicorn
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware


from . import routers
from .helpers.bases import Base
from app.db.base import engine
from app.core.config import settings
from app.helpers.exception_handler import CustomException, http_exception_handler

logging.basicConfig(level=logging.INFO)





# ✅ Bỏ comment hàm này
# async def create_db_and_tables():
#     async with engine.begin() as conn:
#         await conn.run_sync(Base.metadata.create_all)
#         logging.info("Các bảng trong database đã được tạo (nếu chưa tồn tại).")

def get_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME, docs_url="/docs", redoc_url='/re-docs',
        openapi_url=f"{settings.API_PREFIX}/openapi.json",
        description='''...'''
    )


    application.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(routers.router, prefix=settings.API_PREFIX)
    application.add_exception_handler(CustomException, http_exception_handler)

    return application


app = get_application()

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000)