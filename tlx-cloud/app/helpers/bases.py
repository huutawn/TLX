from datetime import datetime
from typing import Optional, TypeVar, Generic, List, Annotated
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, DateTime
from sqlalchemy.orm import as_declarative, declared_attr, Mapped, mapped_column
import re
T = TypeVar('T')


@as_declarative()
class Base:

    __abstract__ = True

    # Tự động tạo tên bảng dựa trên tên class
    @declared_attr  
    def __tablename__(cls) -> str:
        # Chèn dấu gạch dưới trước mỗi chữ cái viết hoa (trừ chữ cái đầu tiên)
        # sau đó chuyển tất cả thành chữ thường.
        return re.sub(r'(?<!^)(?=[A-Z])', '_', cls.__name__).lower()


intpk = Annotated[int, mapped_column(primary_key=True,index=True)]


class BareBaseModel(Base):
    __abstract__ = True
    id: Mapped[intpk]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
class BaseWithId(Base):
    __abstract__ = True
    id: Mapped[intpk]

class ResponseSchemaBase(BaseModel):
    code: str = '000'
    message: str = 'Thành công'


# Lớp chứa dữ liệu linh hoạt (kế thừa từ Base)
class DataResponse(ResponseSchemaBase, Generic[T]):
    data: Optional[T] = None

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True
    )


class MetadataSchema(BaseModel):
    current_page: int
    page_size: int
    total_items: int