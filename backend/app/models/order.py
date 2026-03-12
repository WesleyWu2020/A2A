"""
订单数据模型
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class OrderStatus(str, Enum):
    """订单状态"""
    PENDING = "pending"           # 待支付
    PAID = "paid"                 # 已支付
    PROCESSING = "processing"     # 处理中
    SHIPPED = "shipped"           # 已发货
    DELIVERED = "delivered"       # 已送达
    COMPLETED = "completed"       # 已完成
    CANCELLED = "cancelled"       # 已取消
    REFUNDED = "refunded"         # 已退款


class OrderItem(BaseModel):
    """订单商品项"""
    product_id: str = Field(..., description="商品 ID")
    product_name: str = Field(..., description="商品名称")
    product_image: Optional[str] = Field(None, description="商品图片")
    quantity: int = Field(default=1, ge=1, description="数量")
    unit_price: Decimal = Field(..., description="单价")
    total_price: Decimal = Field(..., description="总价")


class ShippingAddress(BaseModel):
    """收货地址"""
    name: str = Field(..., description="收件人姓名")
    phone: str = Field(..., description="收件人电话")
    country: str = Field(..., description="国家")
    province: str = Field(..., description="省/州")
    city: str = Field(..., description="城市")
    district: Optional[str] = Field(None, description="区/县")
    address: str = Field(..., description="详细地址")
    zip_code: Optional[str] = Field(None, description="邮编")


class ContactInfo(BaseModel):
    """联系信息"""
    name: str = Field(..., description="联系人")
    email: Optional[str] = Field(None, description="邮箱")
    phone: str = Field(..., description="电话")


class NegotiationRecord(BaseModel):
    """议价记录"""
    round: int = Field(..., description="议价轮次")
    agent_role: str = Field(..., description="Agent 角色: buyer/seller")
    message: str = Field(..., description="议价消息")
    proposed_discount: Optional[float] = Field(None, description="提议的折扣")
    is_final: bool = Field(default=False, description="是否为最终报价")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")


class OrderBase(BaseModel):
    """订单基础模型"""
    order_id: str = Field(..., description="订单号")
    recommendation_id: str = Field(..., description="关联的推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    items: List[OrderItem] = Field(..., description="订单商品")
    total_amount: Decimal = Field(..., description="订单总额")
    original_amount: Optional[Decimal] = Field(None, description="原始金额")
    discount_amount: Decimal = Field(default=Decimal("0"), description="折扣金额")
    discount_percent: float = Field(default=0.0, description="折扣比例")
    negotiation_history: List[NegotiationRecord] = Field(default=[], description="议价历史")
    status: OrderStatus = Field(default=OrderStatus.PENDING, description="订单状态")
    shipping_address: Optional[ShippingAddress] = Field(None, description="收货地址")
    contact_info: Optional[ContactInfo] = Field(None, description="联系信息")


class OrderCreate(BaseModel):
    """创建订单请求"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    shipping_address: Optional[ShippingAddress] = None
    contact_info: Optional[ContactInfo] = None


class OrderUpdate(BaseModel):
    """更新订单请求"""
    status: Optional[OrderStatus] = None
    shipping_address: Optional[ShippingAddress] = None
    contact_info: Optional[ContactInfo] = None


class OrderInDB(OrderBase):
    """数据库中的订单模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    paid_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class OrderResponse(OrderBase):
    """订单响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    paid_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class OrderListResult(BaseModel):
    """订单列表结果"""
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")
    orders: List[OrderResponse] = Field(..., description="订单列表")


class NegotiationRequest(BaseModel):
    """议价请求"""
    order_id: str = Field(..., description="订单 ID")
    message: str = Field(..., description="议价消息")
    target_discount: Optional[float] = Field(None, description="期望折扣")


class NegotiationResponse(BaseModel):
    """议价响应"""
    order_id: str = Field(..., description="订单 ID")
    current_round: int = Field(..., description="当前轮次")
    max_rounds: int = Field(..., description="最大轮次")
    seller_response: str = Field(..., description="卖家回复")
    offered_discount: float = Field(..., description="提供的折扣")
    final_price: Decimal = Field(..., description="最终价格")
    is_acceptable: bool = Field(..., description="是否可接受")
    can_continue: bool = Field(..., description="是否可继续议价")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")


class PaymentRequest(BaseModel):
    """支付请求"""
    order_id: str = Field(..., description="订单 ID")
    payment_method: str = Field(..., description="支付方式")


class PaymentResponse(BaseModel):
    """支付响应"""
    order_id: str = Field(..., description="订单 ID")
    payment_url: Optional[str] = Field(None, description="支付链接")
    status: str = Field(..., description="支付状态")
    message: str = Field(..., description="状态消息")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")


# 导出别名
Order = OrderInDB
PaymentInfo = PaymentResponse
