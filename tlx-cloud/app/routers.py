from fastapi import APIRouter

from .domains.users import router as user_router
from .domains.auth import router as auth_router

router = APIRouter()

router.include_router(user_router.router, tags=["users"], prefix="/users")
router.include_router(auth_router.router, tags=['AUTH'], prefix="/auth")
