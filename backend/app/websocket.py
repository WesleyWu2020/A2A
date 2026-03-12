"""
WebSocket 连接管理模块
用于实时推送 Agent 活动日志
"""
import json
import logging
from datetime import datetime
from typing import Dict, Set, Optional

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from redis.exceptions import TimeoutError as RedisTimeoutError

from app.core.redis import get_redis, cache

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    WebSocket 连接管理器
    
    管理会话与 WebSocket 连接的映射关系
    """
    
    def __init__(self):
        # session_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # WebSocket -> session_id
        self.connection_sessions: Dict[WebSocket, str] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """
        建立 WebSocket 连接
        
        Args:
            websocket: WebSocket 对象
            session_id: 会话 ID
        """
        await websocket.accept()
        
        # 添加到连接映射
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        
        self.active_connections[session_id].add(websocket)
        self.connection_sessions[websocket] = session_id
        
        logger.info(f"WebSocket connected: session={session_id}, total_connections={len(self.active_connections[session_id])}")
        
        # 发送连接成功消息
        await self.send_personal_message({
            "type": "connected",
            "payload": {
                "session_id": session_id,
                "timestamp": datetime.now().isoformat()
            }
        }, websocket)
    
    def disconnect(self, websocket: WebSocket):
        """
        断开 WebSocket 连接
        """
        session_id = self.connection_sessions.get(websocket)
        
        if session_id and session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            
            # 清理空集合
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        
        if websocket in self.connection_sessions:
            del self.connection_sessions[websocket]
        
        if session_id:
            logger.info(f"WebSocket disconnected: session={session_id}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """
        向单个连接发送消息
        
        Args:
            message: 消息字典
            websocket: WebSocket 对象
        """
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")
    
    async def broadcast_to_session(self, session_id: str, message: dict):
        """
        向会话的所有连接广播消息
        
        Args:
            session_id: 会话 ID
            message: 消息字典
        """
        if session_id not in self.active_connections:
            return
        
        disconnected = []
        
        for websocket in self.active_connections[session_id]:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast message: {e}")
                disconnected.append(websocket)
        
        # 清理断开的连接
        for websocket in disconnected:
            self.disconnect(websocket)
    
    async def broadcast_to_all(self, message: dict):
        """
        向所有连接广播消息
        
        Args:
            message: 消息字典
        """
        all_websockets = list(self.connection_sessions.keys())
        disconnected = []
        
        for websocket in all_websockets:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to all: {e}")
                disconnected.append(websocket)
        
        # 清理断开的连接
        for websocket in disconnected:
            self.disconnect(websocket)
    
    def get_session_connections(self, session_id: str) -> int:
        """
        获取会话的连接数
        
        Args:
            session_id: 会话 ID
        
        Returns:
            连接数
        """
        return len(self.active_connections.get(session_id, set()))
    
    def get_total_connections(self) -> int:
        """
        获取总连接数
        
        Returns:
            总连接数
        """
        return len(self.connection_sessions)


# 全局连接管理器
manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket 端点处理函数
    
    路径: /ws/{session_id}
    
    消息格式:
    - 客户端 -> 服务器: {"type": "ping"} 或 {"type": "subscribe", "channel": "activities"}
    - 服务器 -> 客户端: {"type": "activity", "payload": {...}, "timestamp": "..."}
    """
    await manager.connect(websocket, session_id)
    
    try:
        # 启动 Redis 订阅任务
        import asyncio
        redis_task = asyncio.create_task(
            redis_subscriber(session_id, websocket)
        )
        
        while True:
            # 接收客户端消息
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                message_type = message.get("type", "unknown")
                
                if message_type == "ping":
                    # 心跳响应
                    await manager.send_personal_message({
                        "type": "pong",
                        "payload": {"timestamp": datetime.now().isoformat()}
                    }, websocket)
                
                elif message_type == "subscribe":
                    # 订阅频道
                    channel = message.get("channel", "activities")
                    await manager.send_personal_message({
                        "type": "subscribed",
                        "payload": {"channel": channel, "session_id": session_id}
                    }, websocket)
                
                elif message_type == "get_history":
                    # 获取历史活动
                    limit = message.get("limit", 50)
                    from app.agents.timeline import get_session_activities
                    activities = await get_session_activities(session_id, limit=limit)
                    
                    await manager.send_personal_message({
                        "type": "history",
                        "payload": {"activities": activities}
                    }, websocket)
                
                else:
                    # 未知消息类型
                    await manager.send_personal_message({
                        "type": "error",
                        "payload": {"message": f"Unknown message type: {message_type}"}
                    }, websocket)
                    
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "payload": {"message": "Invalid JSON format"}
                }, websocket)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        redis_task.cancel()
        
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        manager.disconnect(websocket)
        try:
            redis_task.cancel()
        except:
            pass


async def redis_subscriber(session_id: str, websocket: WebSocket):
    """
    Redis 订阅者
    
    订阅 Redis 频道，将消息推送到 WebSocket
    """
    channel = f"session:{session_id}:activities"
    
    pubsub = None
    try:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)

        logger.info(f"Redis subscriber started for session: {session_id}")

        while True:
            try:
                message = await pubsub.get_message(timeout=1.0)
            except (TimeoutError, RedisTimeoutError):
                # Expected on idle channels with socket timeouts; keep subscriber alive.
                continue

            if not message or message.get("type") != "message":
                continue

            try:
                data = json.loads(message["data"])

                # 包装消息格式
                ws_message = {
                    "type": "activity",
                    "payload": data,
                    "timestamp": datetime.now().isoformat()
                }

                await manager.send_personal_message(ws_message, websocket)

            except json.JSONDecodeError:
                # 非 JSON 消息，直接转发
                ws_message = {
                    "type": "message",
                    "payload": {"data": message["data"]},
                    "timestamp": datetime.now().isoformat()
                }
                await manager.send_personal_message(ws_message, websocket)

    except Exception as e:
        logger.error(f"Redis subscriber error for session {session_id}: {e}")
    finally:
        if pubsub is not None:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except Exception:
                pass


# 辅助函数：广播 Agent 活动
async def broadcast_activity(session_id: str, activity: dict):
    """
    广播 Agent 活动到会话的所有连接
    
    Args:
        session_id: 会话 ID
        activity: 活动数据
    """
    message = {
        "type": "activity",
        "payload": activity,
        "timestamp": datetime.now().isoformat()
    }
    
    await manager.broadcast_to_session(session_id, message)


# 辅助函数：广播系统消息
async def broadcast_system_message(session_id: str, message: str, level: str = "info"):
    """
    广播系统消息
    
    Args:
        session_id: 会话 ID
        message: 消息内容
        level: 消息级别 (info/warning/error)
    """
    ws_message = {
        "type": "system",
        "payload": {
            "message": message,
            "level": level
        },
        "timestamp": datetime.now().isoformat()
    }
    
    await manager.broadcast_to_session(session_id, ws_message)


# WebSocket 状态监控
async def get_websocket_stats() -> dict:
    """
    获取 WebSocket 连接统计
    
    Returns:
        统计信息
    """
    return {
        "total_connections": manager.get_total_connections(),
        "active_sessions": len(manager.active_connections),
        "session_details": {
            session_id: len(connections)
            for session_id, connections in manager.active_connections.items()
        }
    }
