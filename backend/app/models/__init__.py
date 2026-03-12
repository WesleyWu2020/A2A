# -*- coding: utf-8 -*-
"""
数据模型模块
包含所有 Pydantic 模型定义
"""

from .product import ProductBase, ProductCreate, ProductUpdate, ProductInDB, ProductResponse
from .user import UserPreference, SessionContext, SessionBase, SessionCreate, SessionUpdate, SessionInDB
from .scheme import Scheme, SchemeItem, SchemeType, SchemeComparison, SchemeStyle, SchemeSet
from .order import Order, OrderItem, OrderStatus, PaymentInfo
from .timeline import TimelineEvent, EventType, AgentAction
from .recommendation import (
    DesignScheme, SchemeItem as RecSchemeItem,
    RecommendRequest, RecommendResponse,
    NegotiationRequest, NegotiationResponse
)

# 别名导出
Product = ProductInDB

__all__ = [
    # Product models
    "Product",
    "ProductBase",
    "ProductCreate",
    "ProductUpdate",
    "ProductInDB",
    "ProductResponse",
    # User models
    "UserPreference",
    "SessionContext",
    "SessionBase",
    "SessionCreate",
    "SessionUpdate",
    "SessionInDB",
    # Scheme models
    "Scheme",
    "SchemeItem",
    "SchemeType",
    "SchemeComparison",
    "SchemeStyle",
    "SchemeSet",
    # Order models
    "Order",
    "OrderItem",
    "OrderStatus",
    "PaymentInfo",
    # Timeline models
    "TimelineEvent",
    "EventType",
    "AgentAction",
    # Recommendation models
    "DesignScheme",
    "RecSchemeItem",
    "RecommendRequest",
    "RecommendResponse",
    "NegotiationRequest",
    "NegotiationResponse",
]
