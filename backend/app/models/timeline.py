# -*- coding: utf-8 -*-
"""
Timeline 模型 - Agent 活动日志和实时事件
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    """事件类型枚举"""
    # 系统事件
    SESSION_START = "session_start"           # 会话开始
    SESSION_END = "session_end"               # 会话结束
    
    # Agent 事件
    AGENT_START = "agent_start"               # Agent 启动
    AGENT_COMPLETE = "agent_complete"         # Agent 完成
    AGENT_ERROR = "agent_error"               # Agent 错误
    
    # 用户事件
    USER_MESSAGE = "user_message"             # 用户消息
    USER_ACTION = "user_action"               # 用户操作
    
    # 买家 Agent 事件
    REQUIREMENT_PARSE = "requirement_parse"   # 需求解析
    PRODUCT_SEARCH = "product_search"         # 商品搜索
    PRODUCT_FILTER = "product_filter"         # 商品筛选
    SCHEME_GENERATE = "scheme_generate"       # 方案生成
    SCHEME_COMPARE = "scheme_compare"         # 方案对比
    
    # 卖家 Agent 事件
    PRICE_CHECK = "price_check"               # 价格检查
    DISCOUNT_CALCULATE = "discount_calculate" # 折扣计算
    NEGOTIATION_OFFER = "negotiation_offer"   # 议价提议
    NEGOTIATION_ACCEPT = "negotiation_accept" # 议价接受
    
    # 订单事件
    ORDER_CREATE = "order_create"             # 订单创建
    ORDER_UPDATE = "order_update"             # 订单更新
    
    # 其他
    THINKING = "thinking"                     # 思考过程
    DECISION = "decision"                     # 决策
    EXTERNAL_CALL = "external_call"           # 外部调用


class AgentType(str, Enum):
    """Agent 类型"""
    BUYER = "buyer_agent"                     # 买家 Agent
    SELLER = "seller_agent"                   # 卖家 Agent
    ORCHESTRATOR = "orchestrator"             # 编排器
    SYSTEM = "system"                         # 系统


class AgentAction(BaseModel):
    """Agent 具体动作"""
    action_type: str = Field(description="动作类型")
    target: Optional[str] = Field(default=None, description="操作目标")
    input_data: Optional[Dict[str, Any]] = Field(default=None, description="输入数据")
    output_data: Optional[Dict[str, Any]] = Field(default=None, description="输出数据")
    duration_ms: Optional[int] = Field(default=None, description="耗时(毫秒)")


class TimelineEvent(BaseModel):
    """
    Timeline 事件 - 记录 Agent 的每个活动
    """
    event_id: str = Field(description="事件唯一ID")
    session_id: str = Field(description="所属会话ID")
    
    # 事件信息
    event_type: EventType = Field(description="事件类型")
    agent_type: AgentType = Field(description="Agent 类型")
    
    # 内容
    title: str = Field(description="事件标题")
    description: Optional[str] = Field(default=None, description="事件描述")
    content: Optional[Dict[str, Any]] = Field(default=None, description="事件内容")
    
    # 动作详情
    action: Optional[AgentAction] = Field(default=None, description="具体动作")
    
    # 状态
    status: str = Field(default="success", description="状态: success/warning/error")
    progress: Optional[float] = Field(default=None, description="进度 0-100")
    
    # 关联
    parent_event_id: Optional[str] = Field(default=None, description="父事件ID")
    related_ids: List[str] = Field(default_factory=list, description="关联事件ID")
    
    # 时间戳
    timestamp: datetime = Field(default_factory=datetime.now, description="发生时间")
    
    # 元数据
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="额外元数据")
    
    class Config:
        json_schema_extra = {
            "example": {
                "event_id": "evt_001",
                "session_id": "sess_001",
                "event_type": "product_search",
                "agent_type": "buyer_agent",
                "title": "搜索商品",
                "description": "根据关键词 'modern faucet' 找到 12 个商品",
                "timestamp": "2024-03-09T10:00:00Z"
            }
        }


class Timeline(BaseModel):
    """完整 Timeline - 一个会话的所有事件"""
    session_id: str = Field(description="会话ID")
    user_id: Optional[str] = Field(default=None, description="用户ID")
    events: List[TimelineEvent] = Field(default_factory=list, description="事件列表")
    
    # 统计
    total_events: int = Field(default=0, description="事件总数")
    start_time: Optional[datetime] = Field(default=None, description="开始时间")
    end_time: Optional[datetime] = Field(default=None, description="结束时间")
    
    def add_event(self, event: TimelineEvent) -> None:
        """添加事件"""
        self.events.append(event)
        self.total_events = len(self.events)
        if self.start_time is None:
            self.start_time = event.timestamp
        self.end_time = event.timestamp
    
    def get_events_by_type(self, event_type: EventType) -> List[TimelineEvent]:
        """按类型获取事件"""
        return [e for e in self.events if e.event_type == event_type]
    
    def get_events_by_agent(self, agent_type: AgentType) -> List[TimelineEvent]:
        """按 Agent 获取事件"""
        return [e for e in self.events if e.agent_type == agent_type]
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """获取总耗时"""
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return None


class TimelineUpdate(BaseModel):
    """Timeline 更新消息（用于 WebSocket 推送）"""
    type: str = Field(default="event", description="更新类型: event/complete/error")
    session_id: str = Field(description="会话ID")
    event: Optional[TimelineEvent] = Field(default=None, description="事件数据")
    message: Optional[str] = Field(default=None, description="消息")
    progress: Optional[float] = Field(default=None, description="整体进度")
