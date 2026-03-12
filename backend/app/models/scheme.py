# -*- coding: utf-8 -*-
"""
方案模型 - 3套差异化方案的数据结构
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class SchemeType(str, Enum):
    """方案类型枚举"""
    ECONOMY = "economy"           # 经济型（性价比优先）
    BALANCED = "balanced"         # 均衡型（风格统一）
    PREMIUM = "premium"           # 品质型（品质优先）


class SchemeItem(BaseModel):
    """方案中的单个商品项"""
    product_id: str = Field(description="商品ID")
    product_name: str = Field(description="商品名称")
    product_image: Optional[str] = Field(default=None, description="商品图片")
    category: str = Field(description="商品类目")
    quantity: int = Field(default=1, ge=1, description="数量")
    unit_price: float = Field(description="单价")
    total_price: float = Field(description="小计")
    
    # 推荐理由
    recommendation_reason: str = Field(default="", description="推荐理由")
    is_alternative: bool = Field(default=False, description="是否为替代选项")
    alternative_for: Optional[str] = Field(default=None, description="替代的原商品ID")


class SchemeStyle(BaseModel):
    """方案风格信息"""
    primary_style: str = Field(description="主风格")
    secondary_styles: List[str] = Field(default_factory=list, description="辅助风格")
    color_scheme: List[str] = Field(default_factory=list, description="配色方案")
    mood_description: str = Field(default="", description="氛围描述")


class Scheme(BaseModel):
    """
    设计方案 - 包含完整商品组合和设计理念
    """
    scheme_id: str = Field(description="方案唯一ID")
    session_id: str = Field(description="所属会话ID")
    
    # 方案类型
    scheme_type: SchemeType = Field(description="方案类型")
    
    # 基本信息
    name: str = Field(description="方案名称")
    description: str = Field(description="方案描述")
    design_concept: str = Field(default="", description="设计理念")
    target_user: str = Field(default="", description="适合人群")
    
    # 风格
    style: SchemeStyle = Field(default_factory=SchemeStyle, description="风格信息")
    
    # 商品列表
    items: List[SchemeItem] = Field(default_factory=list, description="商品列表")
    
    # 价格统计
    subtotal: float = Field(default=0, description="商品总价")
    discount: float = Field(default=0, description="优惠金额")
    delivery_fee: float = Field(default=0, description="运费")
    total_price: float = Field(default=0, description="最终总价")
    
    # 议价相关
    original_total: float = Field(default=0, description="原始总价")
    negotiated_discount: float = Field(default=0, description="议价折扣")
    negotiated_price: float = Field(default=0, description="议价后价格")
    
    # 元数据
    is_favorite: bool = Field(default=False, description="是否收藏")
    is_selected: bool = Field(default=False, description="是否被选中")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    
    class Config:
        json_schema_extra = {
            "example": {
                "scheme_id": "scheme_001",
                "session_id": "sess_001",
                "scheme_type": "economy",
                "name": "经济实用方案",
                "description": "高性价比选择",
                "total_price": 2999.99,
                "items_count": 8
            }
        }


class SchemeComparison(BaseModel):
    """方案对比"""
    schemes: List[Scheme] = Field(description="要对比的方案列表")
    
    # 对比维度
    price_comparison: Dict[str, Any] = Field(default_factory=dict, description="价格对比")
    style_comparison: Dict[str, Any] = Field(default_factory=dict, description="风格对比")
    quality_comparison: Dict[str, Any] = Field(default_factory=dict, description="品质对比")
    
    # AI建议
    ai_recommendation: str = Field(default="", description="AI推荐建议")
    best_for_budget: Optional[str] = Field(default=None, description="最适合预算的方案")
    best_for_style: Optional[str] = Field(default=None, description="最适合风格的方案")
    best_for_quality: Optional[str] = Field(default=None, description="最适合品质的方案")


class SchemeSet(BaseModel):
    """方案集合 - 一次生成的3套方案"""
    set_id: str = Field(description="方案集ID")
    session_id: str = Field(description="会话ID")
    user_id: str = Field(description="用户ID")
    
    # 三套方案
    economy_scheme: Optional[Scheme] = Field(default=None, description="经济型方案")
    balanced_scheme: Optional[Scheme] = Field(default=None, description="均衡型方案")
    premium_scheme: Optional[Scheme] = Field(default=None, description="品质型方案")
    
    # 生成信息
    generated_at: datetime = Field(default_factory=datetime.now, description="生成时间")
    generation_duration: float = Field(default=0, description="生成耗时(秒)")
    
    @property
    def all_schemes(self) -> List[Scheme]:
        """获取所有非空方案"""
        schemes = []
        if self.economy_scheme:
            schemes.append(self.economy_scheme)
        if self.balanced_scheme:
            schemes.append(self.balanced_scheme)
        if self.premium_scheme:
            schemes.append(self.premium_scheme)
        return schemes
