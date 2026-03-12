# -*- coding: utf-8 -*-
"""
Timeline 实时事件推送 - WebSocket 事件发射器
"""

import logging
import asyncio
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime
from dataclasses import dataclass, field

from ..models.timeline import TimelineEvent, TimelineUpdate, EventType, AgentType

logger = logging.getLogger(__name__)


@dataclass
class WebSocketConnection:
    """WebSocket 连接包装器"""
    session_id: str
    socket: Any  # WebSocket 对象
    connected_at: datetime = field(default_factory=datetime.now)
    
    async def send(self, message: Dict[str, Any]):
        """发送消息"""
        try:
            import json
            if hasattr(self.socket, 'send_json'):
                await self.socket.send_json(message)
            elif hasattr(self.socket, 'send_text'):
                await self.socket.send_text(json.dumps(message))
        except Exception as e:
            logger.warning(f"发送消息失败: {e}")


class TimelineEmitter:
    """
    Timeline 事件发射器 - 管理 WebSocket 连接和事件推送
    
    单例模式，全局管理所有 Timeline 的 WebSocket 连接
    """
    
    _instance: Optional['TimelineEmitter'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        self.connections: Dict[str, List[WebSocketConnection]] = {}
        self.event_history: Dict[str, List[TimelineEvent]] = {}
        self._initialized = True
        
        logger.info("TimelineEmitter 初始化完成")
    
    async def connect(self, session_id: str, websocket: Any) -> WebSocketConnection:
        """
        建立 WebSocket 连接
        
        Args:
            session_id: 会话ID
            websocket: WebSocket 对象
            
        Returns:
            连接对象
        """
        conn = WebSocketConnection(session_id=session_id, socket=websocket)
        
        if session_id not in self.connections:
            self.connections[session_id] = []
        
        self.connections[session_id].append(conn)
        
        # 发送历史事件
        if session_id in self.event_history:
            for event in self.event_history[session_id][-20:]:  # 最近20条
                await conn.send(self._event_to_message(event))
        
        logger.info(f"WebSocket 连接建立: session={session_id}, connections={len(self.connections[session_id])}")
        return conn
    
    async def disconnect(self, session_id: str, websocket: Any):
        """断开 WebSocket 连接"""
        if session_id not in self.connections:
            return
        
        self.connections[session_id] = [
            conn for conn in self.connections[session_id] 
            if conn.socket != websocket
        ]
        
        if not self.connections[session_id]:
            del self.connections[session_id]
        
        logger.info(f"WebSocket 连接断开: session={session_id}")
    
    async def emit_event(self, event: TimelineEvent):
        """
        发射 Timeline 事件
        
        Args:
            event: Timeline 事件
        """
        session_id = event.session_id
        
        # 保存到历史
        if session_id not in self.event_history:
            self.event_history[session_id] = []
        self.event_history[session_id].append(event)
        
        # 限制历史记录数量
        if len(self.event_history[session_id]) > 1000:
            self.event_history[session_id] = self.event_history[session_id][-500:]
        
        # 推送到所有连接
        if session_id in self.connections:
            message = self._event_to_message(event)
            dead_connections = []
            
            for conn in self.connections[session_id]:
                try:
                    await conn.send(message)
                except Exception as e:
                    logger.warning(f"发送事件失败: {e}")
                    dead_connections.append(conn)
            
            # 清理失效连接
            for conn in dead_connections:
                self.connections[session_id].remove(conn)
    
    def _event_to_message(self, event: TimelineEvent) -> Dict[str, Any]:
        """将事件转换为消息格式"""
        return {
            'type': 'event',
            'session_id': event.session_id,
            'event': event.model_dump()
        }
    
    async def emit_progress(
        self, 
        session_id: str, 
        agent_type: AgentType,
        progress: float,
        message: str
    ):
        """发射进度更新"""
        update = TimelineUpdate(
            type='progress',
            session_id=session_id,
            progress=progress,
            message=message
        )
        
        if session_id in self.connections:
            for conn in self.connections[session_id]:
                try:
                    await conn.send(update.model_dump())
                except Exception as e:
                    logger.warning(f"发送进度失败: {e}")
    
    async def emit_complete(self, session_id: str, result: Dict[str, Any]):
        """发射完成消息"""
        update = TimelineUpdate(
            type='complete',
            session_id=session_id,
            message='Task completed',
            progress=100
        )
        
        if session_id in self.connections:
            for conn in self.connections[session_id]:
                try:
                    await conn.send({
                        **update.model_dump(),
                        'result': result
                    })
                except Exception as e:
                    logger.warning(f"发送完成消息失败: {e}")
    
    async def emit_error(self, session_id: str, error: str):
        """发射错误消息"""
        update = TimelineUpdate(
            type='error',
            session_id=session_id,
            message=error
        )
        
        if session_id in self.connections:
            for conn in self.connections[session_id]:
                try:
                    await conn.send(update.model_dump())
                except Exception as e:
                    logger.warning(f"发送错误消息失败: {e}")
    
    def get_event_history(self, session_id: str, limit: int = 100) -> List[TimelineEvent]:
        """获取事件历史"""
        events = self.event_history.get(session_id, [])
        return events[-limit:]
    
    def clear_history(self, session_id: str):
        """清理历史记录"""
        if session_id in self.event_history:
            del self.event_history[session_id]


# 全局实例
timeline_emitter = TimelineEmitter()


def get_timeline_emitter() -> TimelineEmitter:
    """获取 TimelineEmitter 实例"""
    return timeline_emitter
