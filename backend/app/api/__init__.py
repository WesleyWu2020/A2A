# -*- coding: utf-8 -*-
"""API 路由模块"""

from fastapi import APIRouter

from .chat import router as chat_router
from .recommend import router as recommend_router
from .negotiation import router as negotiation_router
from .order import router as order_router
from .products import router as products_router

# 主路由
api_router = APIRouter()

# 注册子路由
api_router.include_router(chat_router, prefix="/chat", tags=["Chat"])
api_router.include_router(recommend_router, prefix="/recommend", tags=["Recommend"])
api_router.include_router(negotiation_router, prefix="/negotiation", tags=["Negotiation"])
api_router.include_router(order_router, prefix="/order", tags=["Order"])
api_router.include_router(products_router, prefix="/products", tags=["Products"])

__all__ = ["api_router"]
