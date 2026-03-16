"""
API 依赖和工具函数
"""
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Header, HTTPException


def get_standard_response(
    code: int = 200,
    message: str = "success",
    data: Optional[Any] = None
) -> dict:
    """
    生成标准响应格式
    
    Args:
        code: 状态码
        message: 消息
        data: 数据
    
    Returns:
        标准响应字典
    """
    return {
        "code": code,
        "message": message,
        "data": data
    }


def get_error_response(
    code: int = 500,
    message: str = "error",
    error_detail: Optional[str] = None
) -> dict:
    """
    生成错误响应格式
    
    Args:
        code: 错误码
        message: 错误消息
        error_detail: 错误详情
    
    Returns:
        错误响应字典
    """
    return {
        "code": code,
        "message": message,
        "data": None,
        "error": error_detail
    }


@dataclass
class AuthenticatedUser:
    """Authenticated request user identity."""

    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None


def _extract_user_id_from_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """
    Fallback parser for bearer token that carries an inline uid marker.
    Expected format: "Bearer uid:<user_id>".
    """
    if not authorization:
        return None

    if not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("uid:") and len(token) > 4:
        return token[4:]
    return None


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    x_user_name: Optional[str] = Header(default=None),
) -> AuthenticatedUser:
    """
    Resolve current authenticated user from request headers.

    Frontend is expected to send X-User-Id from Google-authenticated session.
    """
    user_id = x_user_id or _extract_user_id_from_bearer_token(authorization)

    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    return AuthenticatedUser(
        user_id=user_id,
        email=x_user_email,
        name=x_user_name,
    )


class PaginationParams:
    """分页参数"""
    
    def __init__(self, page: int = 1, page_size: int = 20):
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), 100)
        self.offset = (self.page - 1) * self.page_size


def paginate_data(
    items: list,
    total: int,
    page: int,
    page_size: int
) -> dict:
    """
    分页数据包装
    
    Args:
        items: 当前页数据
        total: 总数
        page: 当前页码
        page_size: 每页数量
    
    Returns:
        分页结果
    """
    total_pages = (total + page_size - 1) // page_size
    
    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }
