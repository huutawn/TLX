from .schemas import UserResponse
from .model import User


class UserMapper:
    @staticmethod
    def to_user_response(user: User) -> UserResponse:
        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            last_login=user.last_login,
            is_active=user.is_active,
            logo=user.logo,
            role=user.role
        )