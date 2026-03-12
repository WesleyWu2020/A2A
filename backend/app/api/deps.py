"""
API 依赖和工具函数
"""
from typing import Any, Optional


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
