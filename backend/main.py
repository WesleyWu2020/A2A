"""
FastAPI 应用入口
包含 CORS、路由注册、生命周期管理
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db_pool, close_db_pool, init_database
from app.core.redis import init_redis, close_redis

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format=settings.LOG_FORMAT
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    
    启动时:
    1. 初始化数据库连接池
    2. 初始化 Redis 连接
    3. 初始化数据库表结构
    
    关闭时:
    1. 关闭数据库连接池
    2. 关闭 Redis 连接
    """
    # 启动
    logger.info("Starting up...")
    
    try:
        # 初始化数据库
        await init_db_pool()
        logger.info("Database pool initialized")
        
        # 初始化 Redis
        await init_redis()
        logger.info("Redis client initialized")
        
        # 初始化数据库表结构
        try:
            await init_database()
            logger.info("Database tables initialized")
        except Exception as e:
            logger.warning(f"Database initialization warning (tables may exist): {e}")
        
        logger.info("Application started successfully")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    
    yield
    
    # 关闭
    logger.info("Shutting down...")
    
    try:
        await close_db_pool()
        logger.info("Database pool closed")
        
        await close_redis()
        logger.info("Redis client closed")
        
    except Exception as e:
        logger.error(f"Shutdown error: {e}")
    
    logger.info("Application stopped")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Multi-agent home ecommerce system API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """全局异常处理器"""
    logger.error(f"Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": "Internal server error",
            "data": None
        }
    )


# 健康检查
@app.get("/health", tags=["Health"])
async def health_check():
    """健康检查端点"""
    return {
        "code": 200,
        "message": "healthy",
        "data": {
            "status": "up",
            "version": settings.APP_VERSION
        }
    }


# 根路径
@app.get("/", tags=["Root"])
async def root():
    """API 根路径"""
    return {
        "code": 200,
        "message": "Welcome to Home AI Design API",
        "data": {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "docs": "/docs"
        }
    }


# 导入并注册路由
from app.api.chat import router as chat_router
from app.api.recommend import router as recommend_router
from app.api.order import router as order_router
from app.api.products import router as products_router
from app.api.negotiation import router as negotiation_router
from app.api.plaza import router as plaza_router
from app.api.memory import router as memory_router
from app.api.projects import router as projects_router
from app.api.skills import router as skills_router
from app.api.conversations import router as conversations_router
from app.api.seller import router as seller_router

# 注册 API 路由
app.include_router(chat_router, prefix="/api")
app.include_router(recommend_router, prefix="/api")
app.include_router(order_router, prefix="/api")
app.include_router(products_router, prefix="/api")
app.include_router(negotiation_router, prefix="/api/negotiation", tags=["Negotiation"])
app.include_router(plaza_router, prefix="/api/plaza", tags=["Plaza"])
app.include_router(memory_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(conversations_router, prefix="/api")
app.include_router(seller_router, prefix="/api")

# 注册 WebSocket 路由
from app.websocket import websocket_endpoint
from fastapi import WebSocket

@app.websocket("/ws/{session_id}")
async def websocket_route(websocket: WebSocket, session_id: str):
    """WebSocket 路由"""
    await websocket_endpoint(websocket, session_id)


# WebSocket 状态监控
@app.get("/ws/stats", tags=["Monitoring"])
async def websocket_stats():
    """WebSocket 连接统计"""
    from app.websocket import get_websocket_stats
    stats = await get_websocket_stats()
    return {
        "code": 200,
        "message": "success",
        "data": stats
    }


# 对话会话启动 API
@app.post("/api/chat/start", tags=["Chat"])
async def chat_start():
    """创建新的对话会话"""
    import uuid as _uuid
    session_id = f"session_{_uuid.uuid4().hex[:16]}"
    return {
        "code": 200,
        "message": "success",
        "data": {
            "session_id": session_id,
            "created_at": __import__("datetime").datetime.now().isoformat()
        }
    }


# 会话管理 API
@app.post("/api/session/create", tags=["Session"])
async def create_session(user_id: str = None):
    """创建新会话"""
    import uuid
    from datetime import datetime, timedelta
    
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    
    # 保存到数据库
    from app.core.database import execute_query
    
    query = """
        INSERT INTO sessions (session_id, user_id, preferences, context, created_at, updated_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $5, $6)
    """
    
    await execute_query(
        query,
        session_id,
        user_id,
        {},
        {},
        datetime.now(),
        datetime.now() + timedelta(days=7),
        fetch=False
    )
    
    return {
        "code": 200,
        "message": "Session created",
        "data": {
            "session_id": session_id,
            "expires_at": (datetime.now() + timedelta(days=7)).isoformat()
        }
    }


@app.get("/api/session/{session_id}", tags=["Session"])
async def get_session(session_id: str):
    """获取会话信息"""
    from app.core.database import execute_query
    
    query = """
        SELECT session_id, user_id, preferences, context, created_at, expires_at
        FROM sessions
        WHERE session_id = $1
    """
    
    row = await execute_query(query, session_id, fetch_one=True)
    
    if not row:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "message": "Session not found", "data": None}
        )
    
    return {
        "code": 200,
        "message": "success",
        "data": {
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "preferences": row["preferences"] or {},
            "context": row["context"] or {},
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None
        }
    }


# Agent 活动日志 API
@app.get("/api/activities/{session_id}", tags=["活动日志"])
async def get_activities(
    session_id: str,
    limit: int = 50,
    agent_type: str = None
):
    """获取 Agent 活动日志"""
    from app.agents.timeline import get_session_activities
    
    activities = await get_session_activities(session_id, limit=limit)
    
    if agent_type:
        activities = [a for a in activities if a.get("agent_type") == agent_type]
    
    return {
        "code": 200,
        "message": "success",
        "data": {
            "session_id": session_id,
            "activities": activities,
            "total": len(activities)
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
