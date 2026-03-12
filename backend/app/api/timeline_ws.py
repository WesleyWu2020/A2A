# -*- coding: utf-8 -*-
"""
Timeline WebSocket - Agent 活动日志实时推送
"""

import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from ..agents.timeline_emitter import get_timeline_emitter, TimelineEmitter
from ..models.timeline import TimelineEvent, EventType, AgentType

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/timeline/{session_id}")
async def timeline_websocket(websocket: WebSocket, session_id: str):
    """
    Timeline WebSocket 连接
    
    实时推送 Agent 活动日志。
    
    连接成功后，会立即收到该会话的历史事件（最近20条），
    之后每当有新的 Agent 活动时，会实时推送事件数据。
    
    消息格式：
    ```json
    {
        "type": "event",
        "session_id": "sess_xxx",
        "event": {
            "event_id": "evt_xxx",
            "event_type": "product_search",
            "agent_type": "buyer_agent",
            "title": "搜索商品",
            "timestamp": "2024-03-09T10:00:00Z"
        }
    }
    ```
    """
    emitter = get_timeline_emitter()
    
    await websocket.accept()
    logger.info(f"Timeline WebSocket 连接: session={session_id}")
    
    try:
        # 建立连接
        conn = await emitter.connect(session_id, websocket)
        
        # 保持连接，等待消息
        while True:
            try:
                # 接收客户端消息（可用于心跳检测或命令）
                data = await websocket.receive_json()
                
                # 处理客户端命令
                if data.get('action') == 'ping':
                    await websocket.send_json({'type': 'pong'})
                
                elif data.get('action') == 'get_history':
                    # 客户端请求历史记录
                    limit = data.get('limit', 50)
                    events = emitter.get_event_history(session_id, limit)
                    await websocket.send_json({
                        'type': 'history',
                        'events': [e.model_dump() for e in events]
                    })
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning(f"WebSocket 消息处理错误: {e}")
                
    except WebSocketDisconnect:
        logger.info(f"Timeline WebSocket 断开: session={session_id}")
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}", exc_info=True)
    finally:
        # 断开连接
        await emitter.disconnect(session_id, websocket)


@router.get("/timeline/{session_id}")
async def get_timeline_history(
    session_id: str,
    limit: int = 100,
    event_type: Optional[str] = None
):
    """
    获取 Timeline 历史事件（HTTP API）
    
    用于不需要实时推送的场景，或作为 WebSocket 的备用。
    """
    emitter = get_timeline_emitter()
    events = emitter.get_event_history(session_id, limit)
    
    # 按类型过滤
    if event_type:
        try:
            filter_type = EventType(event_type)
            events = [e for e in events if e.event_type == filter_type]
        except ValueError:
            pass
    
    return {
        'success': True,
        'session_id': session_id,
        'count': len(events),
        'events': [e.model_dump() for e in events]
    }


@router.get("/agent/timeline/{session_id}")
async def get_agent_timeline(
    session_id: str,
    agent_type: Optional[str] = None,
    limit: int = 100
):
    """
    获取 Agent Timeline
    
    可按 Agent 类型筛选事件。
    """
    emitter = get_timeline_emitter()
    events = emitter.get_event_history(session_id, limit)
    
    # 按 Agent 类型过滤
    if agent_type:
        try:
            filter_agent = AgentType(agent_type)
            events = [e for e in events if e.agent_type == filter_agent]
        except ValueError:
            pass
    
    return {
        'success': True,
        'session_id': session_id,
        'agent_type': agent_type,
        'count': len(events),
        'events': [e.model_dump() for e in events]
    }


# 用于测试的辅助端点
@router.post("/timeline/test/{session_id}")
async def emit_test_event(session_id: str):
    """
    发送测试事件（仅用于开发和测试）
    """
    emitter = get_timeline_emitter()
    
    test_event = TimelineEvent(
        event_id=f"test_{id(session_id)}",
        session_id=session_id,
        event_type=EventType.THINKING,
        agent_type=AgentType.BUYER,
        title="测试事件",
        description="这是一个测试事件",
        content={"test": True}
    )
    
    await emitter.emit_event(test_event)
    
    return {
        'success': True,
        'message': '测试事件已发送'
    }
