"""
Agent 活动日志生成模块
用于记录和推送 Agent 活动
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from app.core.redis import cache, get_redis
from app.core.database import execute_query

logger = logging.getLogger(__name__)


async def log_agent_activity(
    session_id: str,
    agent_type: str,
    activity_type: str,
    content: Dict[str, Any],
    timeline_order: int = 0
) -> str:
    """
    记录 Agent 活动
    
    Args:
        session_id: 会话 ID
        agent_type: Agent 类型 (buyer/seller)
        activity_type: 活动类型
        content: 活动内容
        timeline_order: 时间线顺序
    
    Returns:
        activity_id: 活动记录 ID
    """
    activity_id = f"act_{uuid.uuid4().hex[:16]}"
    
    try:
        # 保存到数据库
        query = """
            INSERT INTO agent_activities 
            (activity_id, session_id, agent_type, activity_type, content, timeline_order, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """
        await execute_query(
            query,
            activity_id,
            session_id,
            agent_type,
            activity_type,
            json.dumps(content, default=str),
            timeline_order,
            datetime.now(),
            fetch=False
        )
        
        # 同时推送到 Redis 用于 WebSocket 实时推送
        activity_data = {
            "id": activity_id,
            "session_id": session_id,
            "agent_type": agent_type,
            "activity_type": activity_type,
            "content": content,
            "timeline_order": timeline_order,
            "timestamp": datetime.now().isoformat()
        }
        
        # 推送到频道
        channel = f"session:{session_id}:activities"
        await cache.publish(channel, activity_data)
        
        # 同时保存到列表供后续查询
        list_key = f"activities:{session_id}"
        await cache.lpush(list_key, json.dumps(activity_data, default=str))
        # 保留最近 100 条
        redis = await get_redis()
        await redis.ltrim(list_key, 0, 99)
        
        logger.debug(f"Logged activity {activity_id} for session {session_id}")
        return activity_id
        
    except Exception as e:
        logger.error(f"Failed to log agent activity: {e}")
        # 不抛出异常，避免影响主流程
        return ""


async def get_session_activities(
    session_id: str,
    limit: int = 50,
    offset: int = 0
) -> list:
    """
    获取会话的 Agent 活动日志
    
    Args:
        session_id: 会话 ID
        limit: 返回数量限制
        offset: 偏移量
    
    Returns:
        活动日志列表
    """
    try:
        # 先从 Redis 获取最近的
        list_key = f"activities:{session_id}"
        activities_json = await cache.lrange(list_key, offset, offset + limit - 1)
        
        activities = []
        for activity_json in activities_json:
            try:
                if isinstance(activity_json, str):
                    activity = json.loads(activity_json)
                else:
                    activity = activity_json
                activities.append(activity)
            except json.JSONDecodeError:
                continue
        
        # 如果 Redis 中没有足够数据，从数据库补充
        if len(activities) < limit:
            query = """
                SELECT activity_id, agent_type, activity_type, content, timeline_order, created_at
                FROM agent_activities
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            """
            db_activities = await execute_query(query, session_id, limit, offset)
            
            for row in db_activities:
                activity = {
                    "id": row["activity_id"],
                    "session_id": session_id,
                    "agent_type": row["agent_type"],
                    "activity_type": row["activity_type"],
                    "content": json.loads(row["content"]) if isinstance(row["content"], str) else row["content"],
                    "timeline_order": row["timeline_order"],
                    "timestamp": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])
                }
                if activity["id"] not in [a.get("id") for a in activities]:
                    activities.append(activity)
        
        return activities
        
    except Exception as e:
        logger.error(f"Failed to get session activities: {e}")
        return []


async def get_activity_summary(session_id: str) -> Dict[str, Any]:
    """
    获取活动摘要
    
    Args:
        session_id: 会话 ID
    
    Returns:
        活动摘要
    """
    try:
        query = """
            SELECT 
                COUNT(*) as total_activities,
                COUNT(DISTINCT agent_type) as agent_types,
                MAX(created_at) as last_activity
            FROM agent_activities
            WHERE session_id = $1
        """
        result = await execute_query(query, session_id, fetch_one=True)
        
        if result:
            return {
                "session_id": session_id,
                "total_activities": result["total_activities"],
                "agent_types": result["agent_types"],
                "last_activity": result["last_activity"].isoformat() if hasattr(result["last_activity"], "isoformat") else str(result["last_activity"])
            }
        
        return {
            "session_id": session_id,
            "total_activities": 0,
            "agent_types": 0,
            "last_activity": None
        }
        
    except Exception as e:
        logger.error(f"Failed to get activity summary: {e}")
        return {
            "session_id": session_id,
            "error": str(e)
        }


class ActivityType:
    """活动类型常量"""
    # Buyer Agent 活动
    UNDERSTAND_NEEDS = "understand_needs"
    SEARCH_PRODUCTS = "search_products"
    GENERATE_SCHEMES = "generate_schemes"
    PRESENT_SCHEMES = "present_schemes"
    COLLECT_FEEDBACK = "collect_feedback"
    
    # Seller Agent 活动
    NEGOTIATE_PRICE = "negotiate_price"
    CONFIRM_ORDER = "confirm_order"
    
    # 通用活动
    HANDOFF = "handoff"
    ERROR = "error"
    SYSTEM = "system"


class AgentTimeline:
    """Agent 时间线管理器"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.activities: list = []
        self._counter = 0
    
    async def add(
        self,
        agent_type: str,
        activity_type: str,
        content: Dict[str, Any]
    ) -> str:
        """添加活动记录"""
        self._counter += 1
        activity_id = await log_agent_activity(
            session_id=self.session_id,
            agent_type=agent_type,
            activity_type=activity_type,
            content=content,
            timeline_order=self._counter
        )
        
        # 同时添加到内存列表
        self.activities.append({
            "id": activity_id,
            "agent_type": agent_type,
            "activity_type": activity_type,
            "content": content,
            "timeline_order": self._counter,
            "timestamp": datetime.now().isoformat()
        })
        
        return activity_id
    
    def get_activities(
        self,
        agent_type: Optional[str] = None,
        activity_type: Optional[str] = None
    ) -> list:
        """获取活动列表（带筛选）"""
        result = self.activities
        
        if agent_type:
            result = [a for a in result if a["agent_type"] == agent_type]
        
        if activity_type:
            result = [a for a in result if a["activity_type"] == activity_type]
        
        return result
    
    def get_last_activity(self, agent_type: Optional[str] = None) -> Optional[Dict]:
        """获取最后一条活动记录"""
        activities = self.get_activities(agent_type=agent_type)
        return activities[-1] if activities else None
    
    def clear(self):
        """清空活动记录"""
        self.activities = []
        self._counter = 0
