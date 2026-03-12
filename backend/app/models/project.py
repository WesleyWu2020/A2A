"""
项目制上下文隔离 — 数据模型
每个"项目"对应一个空间改造（如客厅改造、主卧翻新），
拥有独立的偏好上下文、会话历史和收藏列表。
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ProjectContext(BaseModel):
    """单个项目的上下文快照"""
    budget_total: Optional[float] = Field(None, description="项目总预算 (USD)")
    budget_spent: float = Field(default=0.0, description="已分配/花费金额")
    style: Optional[str] = Field(None, description="项目主风格")
    room_type: Optional[str] = Field(None, description="房间类型")
    room_dimensions: Optional[Dict[str, float]] = Field(None, description="房间尺寸 {length, width, height} 单位 m")
    constraints: List[str] = Field(default=[], description="硬性约束，如 'pet-friendly', 'low-VOC'")
    notes: Optional[str] = Field(None, description="用户自由备注")


class FavoriteItem(BaseModel):
    """收藏/点赞的商品"""
    product_id: str
    product_name: str
    price: Optional[float] = None
    image_url: Optional[str] = None
    reason: Optional[str] = Field(None, description="收藏原因 / AI推荐理由")
    added_at: datetime = Field(default_factory=datetime.now)


class ProjectDesign(BaseModel):
    """一个独立的空间改造项目"""
    project_id: str = Field(..., description="项目唯一ID")
    user_id: str = Field(..., description="所属用户")
    name: str = Field(..., description="项目名称，如 'Living Room Makeover'")
    icon: str = Field(default="🏠", description="项目图标 emoji")
    status: str = Field(default="active", description="active / archived / completed")

    # 项目级上下文
    context: ProjectContext = Field(default_factory=ProjectContext)

    # 收藏列表（RAG 用）
    favorites: List[FavoriteItem] = Field(default=[], description="收藏/喜欢的商品")

    # 会话历史 IDs（关联到 agent_state:{session_id}）
    session_ids: List[str] = Field(default=[], description="属于本项目的会话 ID 列表")

    # 生成的方案 snapshot IDs
    scheme_snapshots: List[str] = Field(default=[], description="历史方案快照 ID")

    # 元数据
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# ─── Request / Response ──────────────────────────────────────────────────────

class ProjectCreateRequest(BaseModel):
    user_id: str
    name: str
    icon: str = "🏠"
    context: Optional[ProjectContext] = None


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    status: Optional[str] = None
    context: Optional[ProjectContext] = None


class FavoriteAddRequest(BaseModel):
    user_id: str
    project_id: str
    product_id: str
    product_name: str
    price: Optional[float] = None
    image_url: Optional[str] = None
    reason: Optional[str] = None


class FavoriteRemoveRequest(BaseModel):
    user_id: str
    project_id: str
    product_id: str
