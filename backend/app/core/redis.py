"""
Redis 客户端配置模块
使用 aioredis 进行 Redis 操作
"""
import json
import logging
import pickle
from typing import Any, Optional, Union
from datetime import timedelta

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# 全局 Redis 客户端
_redis_client: Optional[Redis] = None


async def init_redis() -> Redis:
    """初始化 Redis 客户端"""
    global _redis_client
    
    if _redis_client is not None:
        return _redis_client
    
    try:
        _redis_client = await aioredis.from_url(
            settings.REDIS_URL,
            password=settings.REDIS_PASSWORD,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=settings.REDIS_TIMEOUT,
            socket_timeout=settings.REDIS_TIMEOUT,
            health_check_interval=30
        )
        
        # 测试连接
        await _redis_client.ping()
        logger.info("Redis client initialized successfully")
        return _redis_client
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        raise


async def close_redis() -> None:
    """关闭 Redis 客户端"""
    global _redis_client
    
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis client closed")


async def get_redis() -> Redis:
    """获取 Redis 客户端"""
    if _redis_client is None:
        return await init_redis()
    return _redis_client


class RedisCache:
    """Redis 缓存工具类"""
    
    @staticmethod
    async def get(key: str) -> Optional[str]:
        """获取字符串值"""
        redis = await get_redis()
        return await redis.get(key)
    
    @staticmethod
    async def get_json(key: str) -> Optional[Any]:
        """获取 JSON 对象"""
        value = await RedisCache.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                logger.warning(f"Failed to decode JSON for key: {key}")
        return None
    
    @staticmethod
    async def set(
        key: str,
        value: Union[str, bytes, int, float],
        expire: Optional[Union[int, timedelta]] = None
    ) -> bool:
        """设置值"""
        redis = await get_redis()
        result = await redis.set(key, value, ex=expire)
        return result
    
    @staticmethod
    async def set_json(
        key: str,
        value: Any,
        expire: Optional[Union[int, timedelta]] = None
    ) -> bool:
        """设置 JSON 对象"""
        json_str = json.dumps(value, ensure_ascii=False, default=str)
        return await RedisCache.set(key, json_str, expire)
    
    @staticmethod
    async def delete(key: str) -> int:
        """删除键"""
        redis = await get_redis()
        return await redis.delete(key)
    
    @staticmethod
    async def delete_pattern(pattern: str) -> int:
        """按模式删除键"""
        redis = await get_redis()
        keys = await redis.keys(pattern)
        if keys:
            return await redis.delete(*keys)
        return 0
    
    @staticmethod
    async def exists(key: str) -> bool:
        """检查键是否存在"""
        redis = await get_redis()
        return await redis.exists(key) > 0
    
    @staticmethod
    async def expire(key: str, seconds: int) -> bool:
        """设置过期时间"""
        redis = await get_redis()
        return await redis.expire(key, seconds)
    
    @staticmethod
    async def ttl(key: str) -> int:
        """获取剩余过期时间"""
        redis = await get_redis()
        return await redis.ttl(key)
    
    # Hash 操作
    @staticmethod
    async def hget(key: str, field: str) -> Optional[str]:
        """获取 Hash 字段值"""
        redis = await get_redis()
        return await redis.hget(key, field)
    
    @staticmethod
    async def hgetall(key: str) -> dict:
        """获取所有 Hash 字段"""
        redis = await get_redis()
        return await redis.hgetall(key)
    
    @staticmethod
    async def hset(key: str, field: str, value: Union[str, int, float]) -> int:
        """设置 Hash 字段"""
        redis = await get_redis()
        return await redis.hset(key, field, value)
    
    @staticmethod
    async def hdel(key: str, *fields: str) -> int:
        """删除 Hash 字段"""
        redis = await get_redis()
        return await redis.hdel(key, *fields)
    
    # List 操作
    @staticmethod
    async def lpush(key: str, *values: Any) -> int:
        """从左侧推入列表"""
        redis = await get_redis()
        return await redis.lpush(key, *values)
    
    @staticmethod
    async def rpush(key: str, *values: Any) -> int:
        """从右侧推入列表"""
        redis = await get_redis()
        return await redis.rpush(key, *values)
    
    @staticmethod
    async def lrange(key: str, start: int, end: int) -> list:
        """获取列表范围"""
        redis = await get_redis()
        return await redis.lrange(key, start, end)
    
    @staticmethod
    async def lpop(key: str) -> Optional[str]:
        """从左侧弹出"""
        redis = await get_redis()
        return await redis.lpop(key)
    
    @staticmethod
    async def rpop(key: str) -> Optional[str]:
        """从右侧弹出"""
        redis = await get_redis()
        return await redis.rpop(key)
    
    # Set 操作
    @staticmethod
    async def sadd(key: str, *members: Any) -> int:
        """添加集合成员"""
        redis = await get_redis()
        return await redis.sadd(key, *members)
    
    @staticmethod
    async def smembers(key: str) -> set:
        """获取所有集合成员"""
        redis = await get_redis()
        return await redis.smembers(key)
    
    @staticmethod
    async def srem(key: str, *members: Any) -> int:
        """移除集合成员"""
        redis = await get_redis()
        return await redis.srem(key, *members)
    
    # 发布/订阅
    @staticmethod
    async def publish(channel: str, message: Union[str, dict]) -> int:
        """发布消息到频道"""
        redis = await get_redis()
        if isinstance(message, dict):
            message = json.dumps(message, ensure_ascii=False)
        return await redis.publish(channel, message)
    
    @staticmethod
    async def subscribe(channel: str):
        """订阅频道"""
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        return pubsub


# 导出缓存实例
cache = RedisCache()
