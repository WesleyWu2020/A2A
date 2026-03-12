"""
用户长期记忆数据模型
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SpaceProfile(BaseModel):
    """单个空间档案（客厅、卧室等）"""
    space_id: str = Field(..., description="空间唯一ID")
    name: str = Field(..., description="空间名称，如 '主卧', '客厅', 'Living Room'")
    area_sqft: Optional[float] = Field(None, description="面积（平方英尺）")
    area_sqm: Optional[float] = Field(None, description="面积（平方米）")
    style: Optional[str] = Field(None, description="空间风格偏好")
    notes: Optional[str] = Field(None, description="附加备注")


class MemoryTag(BaseModel):
    """记忆标签——记录用户行为/偏好/限制"""
    key: str = Field(..., description="标签键，如 'has_cats', 'prefers_wood', 'formaldehyde_sensitive'")
    label: str = Field(..., description="可读标签，如 '养宠家庭 🐱', '偏好木质'")
    value: Optional[str] = Field(None, description="标签值（可选）")
    category: str = Field(default="preference", description="分类: preference/constraint/lifestyle/budget")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="置信度")
    source: str = Field(default="explicit", description="来源: explicit(用户主动告知)/implicit(行为推断)")
    created_at: datetime = Field(default_factory=datetime.now)


class UserLongTermMemory(BaseModel):
    """用户长期记忆档案"""
    user_id: str = Field(..., description="用户ID（可为匿名设备ID）")
    nickname: Optional[str] = Field(None, description="用户昵称")
    
    # 空间档案（支持多空间）
    spaces: List[SpaceProfile] = Field(default=[], description="用户的空间/项目列表")
    active_space_id: Optional[str] = Field(None, description="当前活跃空间ID")
    
    # 记忆标签
    tags: List[MemoryTag] = Field(default=[], description="用户偏好/限制标签")
    
    # 购买历史摘要
    purchase_history_summary: List[str] = Field(default=[], description="历史购买品类摘要")
    avg_order_value: Optional[float] = Field(None, description="历史平均客单价（USD）")
    
    # 元数据
    visit_count: int = Field(default=1, description="访问次数")
    last_seen: datetime = Field(default_factory=datetime.now)
    created_at: datetime = Field(default_factory=datetime.now)


class SessionContextPin(BaseModel):
    """会话上下文标签（短期 Context Pin）"""
    key: str = Field(..., description="标签键")
    label: str = Field(..., description="可读标签，如 'Budget: $3,000'")
    value: Optional[str] = Field(None, description="标签原始值")
    removable: bool = Field(default=True, description="用户是否可以手动删除")


class SessionMemoryState(BaseModel):
    """会话短期记忆状态"""
    session_id: str
    context_pins: List[SessionContextPin] = Field(default=[], description="当前需求标签组")
    checkpoints: List[Dict[str, Any]] = Field(default=[], description="历史状态快照（时光机）")
    active_threads: Dict[str, Any] = Field(default={}, description="多线程议题tracker")


# ─── Request / Response Schemas ───────────────────────────────────────────────

class MemoryUpsertRequest(BaseModel):
    """创建或更新长期记忆请求"""
    user_id: str
    nickname: Optional[str] = None
    tags: Optional[List[MemoryTag]] = None
    spaces: Optional[List[SpaceProfile]] = None
    active_space_id: Optional[str] = None

class TagAddRequest(BaseModel):
    """添加单个记忆标签"""
    user_id: str
    tag: MemoryTag

class TagRemoveRequest(BaseModel):
    """删除记忆标签"""
    user_id: str
    tag_key: str

class SpaceUpsertRequest(BaseModel):
    """添加/更新空间档案"""
    user_id: str
    space: SpaceProfile

class ImplicitPreferenceDetected(BaseModel):
    """Agent检测到隐性偏好，推送给前端供用户确认"""
    session_id: str
    detected_key: str
    detected_label: str
    detected_value: Optional[str] = None
    category: str = "preference"
    confirmation_prompt: str = Field(..., description="向用户展示的确认文案")
