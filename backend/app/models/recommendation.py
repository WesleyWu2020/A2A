"""
推荐/方案数据模型
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class RecommendationStatus(str, Enum):
    """推荐状态"""
    ACTIVE = "active"           # 有效
    EXPIRED = "expired"         # 已过期
    CONVERTED = "converted"     # 已转化
    REJECTED = "rejected"       # 已拒绝


class SchemeItem(BaseModel):
    """方案商品项"""
    product_id: str = Field(..., description="商品 ID")
    product_name: str = Field(..., description="商品名称")
    product_image: Optional[str] = Field(None, description="商品图片")
    category: Optional[str] = Field(None, description="类目")
    price: Decimal = Field(..., description="价格")
    quantity: int = Field(default=1, description="数量")
    reason: Optional[str] = Field(None, description="推荐理由")


class DesignScheme(BaseModel):
    """设计方案"""
    scheme_index: int = Field(..., description="方案索引")
    scheme_name: str = Field(..., description="方案名称")
    theme: Optional[str] = Field(None, description="主题")
    items: List[SchemeItem] = Field(..., description="商品列表")
    total_price: Decimal = Field(..., description="总价")
    original_price: Optional[Decimal] = Field(None, description="原价")
    style_tags: List[str] = Field(default=[], description="风格标签")
    color_palette: List[str] = Field(default=[], description="配色方案")
    description: Optional[str] = Field(None, description="方案描述")
    match_reason: Optional[str] = Field(None, description="匹配原因")


class BuyerFeedback(BaseModel):
    """买家反馈"""
    liked_schemes: List[int] = Field(default=[], description="喜欢的方案索引")
    disliked_schemes: List[int] = Field(default=[], description="不喜欢的方案索引")
    feedback_text: Optional[str] = Field(None, description="反馈文本")
    preference_adjustments: Dict[str, Any] = Field(default={}, description="偏好调整")
    created_at: datetime = Field(default_factory=datetime.now, description="反馈时间")


class RecommendationBase(BaseModel):
    """推荐基础模型"""
    recommendation_id: str = Field(..., description="推荐 ID")
    session_id: str = Field(..., description="会话 ID")
    schemes: List[DesignScheme] = Field(default=[], description="设计方案列表")
    total_schemes: int = Field(default=0, description="方案总数")
    status: RecommendationStatus = Field(default=RecommendationStatus.ACTIVE, description="状态")
    buyer_feedback: Optional[BuyerFeedback] = Field(None, description="买家反馈")


class RecommendationCreate(BaseModel):
    """创建推荐请求"""
    session_id: str = Field(..., description="会话 ID")
    preferences: Optional[Dict[str, Any]] = Field(None, description="用户偏好")
    constraints: Optional[Dict[str, Any]] = Field(None, description="约束条件")


class RecommendationUpdate(BaseModel):
    """更新推荐请求"""
    status: Optional[RecommendationStatus] = None
    buyer_feedback: Optional[BuyerFeedback] = None


class RecommendationInDB(RecommendationBase):
    """数据库中的推荐模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class RecommendationResponse(RecommendationBase):
    """推荐响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class RecommendRequest(BaseModel):
    """生成推荐请求"""
    session_id: str = Field(..., description="会话 ID")
    num_schemes: int = Field(default=3, ge=1, le=5, description="方案数量")
    budget_min: Optional[float] = Field(None, description="预算下限")
    budget_max: Optional[float] = Field(None, description="预算上限")
    style_preference: Optional[List[str]] = Field(None, description="风格偏好")
    room_type: Optional[str] = Field(None, description="房间类型")
    additional_requirements: Optional[str] = Field(None, description="额外需求")


class RecommendResponse(BaseModel):
    """生成推荐响应"""
    recommendation_id: str = Field(..., description="推荐 ID")
    session_id: str = Field(..., description="会话 ID")
    schemes: List[DesignScheme] = Field(..., description="设计方案列表")
    generated_at: datetime = Field(default_factory=datetime.now, description="生成时间")


class SchemeFeedbackRequest(BaseModel):
    """方案反馈请求"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    is_liked: bool = Field(..., description="是否喜欢")
    feedback_text: Optional[str] = Field(None, description="反馈文本")


class SchemeSelectRequest(BaseModel):
    """选择方案请求"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")


class SchemeSelectResponse(BaseModel):
    """选择方案响应"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    scheme: DesignScheme = Field(..., description="选中的方案")
    can_negotiate: bool = Field(default=True, description="是否可以议价")
    suggested_price_range: Dict[str, float] = Field(default={}, description="建议价格范围")


class NegotiationRequest(BaseModel):
    """议价请求"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    target_discount: float = Field(..., description="期望折扣")
    message: str = Field(default="", description="议价消息")


class NegotiationResponse(BaseModel):
    """议价响应"""
    recommendation_id: str = Field(..., description="推荐 ID")
    scheme_index: int = Field(..., description="方案索引")
    success: bool = Field(..., description="是否成功")
    final_discount: float = Field(..., description="最终折扣")
    final_price: Decimal = Field(..., description="最终价格")
    message: str = Field(..., description="卖家消息")
