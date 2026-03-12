"""
用户/会话数据模型
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class UserPreference(BaseModel):
    """用户偏好设置"""
    style_preference: Optional[List[str]] = Field(default=[], description="风格偏好")
    color_preference: Optional[List[str]] = Field(default=[], description="颜色偏好")
    material_preference: Optional[List[str]] = Field(default=[], description="材质偏好")
    budget_min: Optional[float] = Field(None, description="预算下限")
    budget_max: Optional[float] = Field(None, description="预算上限")
    room_type: Optional[str] = Field(None, description="房间类型")
    room_size: Optional[str] = Field(None, description="房间大小")
    other_requirements: Optional[str] = Field(None, description="其他需求")


class SessionContext(BaseModel):
    """会话上下文"""
    current_intent: Optional[str] = Field(None, description="当前意图")
    collected_info: Dict[str, Any] = Field(default={}, description="已收集信息")
    mentioned_products: List[str] = Field(default=[], description="提及的商品")
    chat_history: List[Dict[str, Any]] = Field(default=[], description="聊天历史")
    negotiation_round: int = Field(default=0, description="议价轮数")
    last_recommendation_id: Optional[str] = Field(None, description="最后推荐 ID")


class SessionBase(BaseModel):
    """会话基础模型"""
    session_id: str = Field(..., description="会话 ID")
    user_id: Optional[str] = Field(None, description="用户 ID")
    preferences: UserPreference = Field(default=UserPreference(), description="用户偏好")
    context: SessionContext = Field(default=SessionContext(), description="会话上下文")
    expires_at: Optional[datetime] = Field(None, description="过期时间")


class SessionCreate(BaseModel):
    """创建会话请求"""
    user_id: Optional[str] = Field(None, description="用户 ID")


class SessionUpdate(BaseModel):
    """更新会话请求"""
    preferences: Optional[UserPreference] = None
    context: Optional[SessionContext] = None


class SessionInDB(SessionBase):
    """数据库中的会话模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class SessionResponse(SessionBase):
    """会话响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ChatMessage(BaseModel):
    """聊天消息"""
    role: str = Field(..., description="角色: user/assistant")
    content: str = Field(..., description="消息内容")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")
    metadata: Optional[Dict[str, Any]] = Field(None, description="元数据")


class ChatRequest(BaseModel):
    """聊天请求"""
    session_id: Optional[str] = Field(default=None, description="会话 ID (auto-generated if omitted)")
    message: str = Field(..., description="用户消息")
    stream: bool = Field(default=False, description="是否流式响应")


class ChatResponse(BaseModel):
    """聊天响应"""
    session_id: str = Field(..., description="会话 ID")
    message: str = Field(..., description="AI 回复")
    intent: Optional[str] = Field(None, description="识别到的意图")
    extracted_info: Optional[Dict[str, Any]] = Field(None, description="提取的信息")
    suggested_products: Optional[List[str]] = Field(None, description="推荐的商品")
    timestamp: datetime = Field(default_factory=datetime.now, description="时间戳")


class IntentType:
    """意图类型常量"""
    GREETING = "greeting"
    QUERY_PRODUCT = "query_product"
    QUERY_PRICE = "query_price"
    NEED_RECOMMENDATION = "need_recommendation"
    PROVIDE_PREFERENCE = "provide_preference"
    NEGOTIATE_PRICE = "negotiate_price"
    CONFIRM_ORDER = "confirm_order"
    REJECT = "reject"
    CLARIFY = "clarify"
    OTHER = "other"
