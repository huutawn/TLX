import logging
from pydantic import BaseModel, conint, ConfigDict
from abc import ABC, abstractmethod
from typing import Optional, Generic, Sequence, Type, TypeVar, Callable

from fastapi import HTTPException
from contextvars import ContextVar
from sqlalchemy import asc, desc, func, select
from sqlalchemy.sql.selectable import Select
from sqlalchemy.ext.asyncio import AsyncSession
from .bases import ResponseSchemaBase, MetadataSchema
from app.helpers.exception_handler import CustomException,ExceptionType

T = TypeVar("T")
C = TypeVar("C")

logger = logging.getLogger()


class PaginationParams(BaseModel):
    page_size: Optional[conint(gt=0, lt=1001)] = 10
    page: Optional[conint(gt=0)] = 1
    sort_by: Optional[str] = 'id'
    order: Optional[str] = 'desc'


class BasePage(ResponseSchemaBase, Generic[T], ABC):
    data: Sequence[T]

    # 👇 Dùng model_config thay cho class Config
    model_config = ConfigDict(
        arbitrary_types_allowed=True
    )

    @classmethod
    @abstractmethod
    def create(cls: Type[C], code: str, message: str, data: Sequence[T], metadata: MetadataSchema) -> C:
        pass  # pragma: no cover


class Page(BasePage[T], Generic[T]):
    metadata: MetadataSchema

    @classmethod
    def create(cls, code: str, message: str, data: Sequence[T], metadata: MetadataSchema) -> "Page[T]":
        return cls(
            code=code,
            message=message,
            data=data,
            metadata=metadata
        )


PageType: ContextVar[Type[BasePage]] = ContextVar("PageType", default=Page)


async def paginate(db: AsyncSession,
                   model,
                   query: Select, # ✅ Nhận đối tượng Select
                   params: Optional[PaginationParams],
                   mapper: Optional[Callable] = None) -> BasePage:
    code = '200'
    message = 'Success'

    try:
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        if params.order:
            direction = desc if params.order == 'desc' else asc
            query = query.order_by(direction(getattr(model, params.sort_by)))

        query = query.limit(params.page_size).offset(params.page_size * (params.page - 1))
        data_result = await db.execute(query)
        data = data_result.scalars().all()

        if mapper:
            mapped_data = [mapper(item) for item in data]
        else:
            mapped_data = data

        metadata = MetadataSchema(
            current_page=params.page,
            page_size=params.page_size,
            total_items=total
        )

    except Exception as e:
        logger.error(f"Pagination error: {e}") # Nên log lỗi ra
        raise e

    return PageType.get().create(code, message, mapped_data, metadata)