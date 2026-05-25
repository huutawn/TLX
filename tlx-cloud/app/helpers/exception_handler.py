import enum

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from ..helpers.bases import ResponseSchemaBase


class ExceptionType(enum.Enum):
    MS_UNAVAILABLE = 500, '990', 'Hệ thống đang bảo trì, quý khách vui lòng thử lại sau'
    MS_INVALID_API_PATH = 500, '991', 'Hệ thống đang bảo trì, quý khách vui lòng thử lại sau'
    DATA_RESPONSE_MALFORMED = 500, '992', 'Có lỗi xảy ra, vui lòng liên hệ admin!'
    EMAIL_IS_TAKEN = 409, '1001', 'Email này đã được sử dụng'
    USER_NOT_EXITS = 404, '1002', 'Không tìm thấy người dùng'
    WRONG_PASSWORD = 400, '1003', 'Sai mật khẩu'
    INVALIDATE_TOKEN = 401, '1004', 'Invalidate token'
    FAIL_TO_GET = 400, '1005', 'Lấy dữ liệu thất bại'
    USER_BANNED = 400, '1006', 'người dùng đã bị đình chỉ'
    CAMPAIGN_NOT_FOUND = 404, '1007', 'không tìm chiến dịch'

    def __new__(cls, *args, **kwds):
        value = len(cls.__members__) + 1
        obj = object.__new__(cls)
        obj._value_ = value
        return obj

    def __init__(self, http_code, code, message):
        self.http_code = http_code
        self.code = code
        self.message = message


class CustomException(Exception):
    http_code: int
    code: str
    message: str

    def __init__(self, error_type: ExceptionType, custom_message: str = None):
        self.http_code = error_type.http_code
        self.code = error_type.code
        self.message = custom_message if custom_message else error_type.message


async def http_exception_handler(request: Request, exc: CustomException):
    response_content = ResponseSchemaBase(code=exc.code, message=exc.message)

    return JSONResponse(
        status_code=exc.http_code,
        content=jsonable_encoder(response_content)
    )


async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content=jsonable_encoder(ResponseSchemaBase().custom_response('400', get_message_validation(exc)))
    )


async def fastapi_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content=jsonable_encoder(ResponseSchemaBase().custom_response('500', "Có lỗi xảy ra, vui lòng liên hệ admin!"))
    )


def get_message_validation(exc):
    message = ""
    for error in exc.errors():
        message += "/'" + str(error.get("loc")[1]) + "'/" + ': ' + error.get("msg") + ", "

    message = message[:-2]

    return message