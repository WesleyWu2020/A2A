"""
商品数据模型
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Any
from pydantic import BaseModel, Field


class ProductStyle(BaseModel):
    """商品风格"""
    name: str
    confidence: Optional[float] = 1.0


class ProductMaterial(BaseModel):
    """商品材质"""
    name: str
    confidence: Optional[float] = 1.0


class ProductColor(BaseModel):
    """商品颜色"""
    name: str
    hex: Optional[str] = None


class ProductSize(BaseModel):
    """商品尺寸"""
    name: str
    value: Optional[str] = None
    unit: Optional[str] = None


class ProductImage(BaseModel):
    """商品图片"""
    url: str
    alt: Optional[str] = None
    is_primary: bool = False


class ProductBase(BaseModel):
    """商品基础模型"""
    spu_id: str = Field(..., description="商品 SPU ID")
    title: str = Field(..., description="商品标题")
    category_l1: Optional[str] = Field(None, description="一级类目")
    category_l2: Optional[str] = Field(None, description="二级类目")
    category_l3: Optional[str] = Field(None, description="三级类目")
    price_current: Optional[Decimal] = Field(None, description="当前价格")
    price_original: Optional[Decimal] = Field(None, description="原价")
    currency: str = Field(default="USD", description="货币")
    styles: List[str] = Field(default=[], description="风格标签")
    materials: List[str] = Field(default=[], description="材质标签")
    colors: List[str] = Field(default=[], description="颜色标签")
    sizes: List[str] = Field(default=[], description="尺寸规格")
    scenes: List[str] = Field(default=[], description="适用场景")
    inventory: int = Field(default=0, description="库存数量")
    images: List[str] = Field(default=[], description="图片 URL 列表")
    description: Optional[str] = Field(None, description="商品描述")
    rating: Optional[Decimal] = Field(None, description="评分")
    review_count: int = Field(default=0, description="评价数量")
    source_url: Optional[str] = Field(None, description="来源链接")


class ProductCreate(ProductBase):
    """创建商品请求模型"""
    pass


class ProductUpdate(BaseModel):
    """更新商品请求模型"""
    title: Optional[str] = None
    price_current: Optional[Decimal] = None
    price_original: Optional[Decimal] = None
    styles: Optional[List[str]] = None
    materials: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    scenes: Optional[List[str]] = None
    inventory: Optional[int] = None
    images: Optional[List[str]] = None
    description: Optional[str] = None


class ProductInDB(ProductBase):
    """数据库中的商品模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProductResponse(ProductBase):
    """商品响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProductSearchParams(BaseModel):
    """商品搜索参数"""
    keyword: Optional[str] = Field(None, description="搜索关键词")
    category_l1: Optional[str] = Field(None, description="一级类目")
    category_l2: Optional[str] = Field(None, description="二级类目")
    category_l3: Optional[str] = Field(None, description="三级类目")
    styles: Optional[List[str]] = Field(None, description="风格筛选")
    materials: Optional[List[str]] = Field(None, description="材质筛选")
    colors: Optional[List[str]] = Field(None, description="颜色筛选")
    scenes: Optional[List[str]] = Field(None, description="场景筛选")
    min_price: Optional[Decimal] = Field(None, description="最低价格")
    max_price: Optional[Decimal] = Field(None, description="最高价格")
    sort_by: Optional[str] = Field("relevance", description="排序方式: relevance/price_asc/price_desc/rating")
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=20, ge=1, le=100, description="每页数量")


class ProductSearchResult(BaseModel):
    """商品搜索结果"""
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")
    products: List[ProductResponse] = Field(..., description="商品列表")


class ProductFilterOptions(BaseModel):
    """商品筛选选项"""
    categories: List[dict] = Field(default=[], description="类目列表")
    styles: List[str] = Field(default=[], description="风格列表")
    materials: List[str] = Field(default=[], description="材质列表")
    colors: List[str] = Field(default=[], description="颜色列表")
    scenes: List[str] = Field(default=[], description="场景列表")
    price_range: dict = Field(default={}, description="价格范围")

# 简化导出
Product = ProductInDB
ProductCategory = ProductBase
ProductPrice = ProductBase
ProductFilter = ProductBase
