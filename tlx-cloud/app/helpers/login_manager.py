from fastapi import Depends, HTTPException, status
from app.domains.users.model import User
from .deps import get_current_user


def permission_required(*required_roles: str):
    async def check_permissions(current_user: User = Depends(get_current_user)) -> User:
        user_role = getattr(current_user, 'role', None)

        if required_roles and user_role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập tài nguyên này."
            )

        return current_user

    return check_permissions