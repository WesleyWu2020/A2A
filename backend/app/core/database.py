"""
数据库连接池和会话管理模块
使用 asyncpg 进行异步 PostgreSQL 操作
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg
from asyncpg import Connection, Pool

from app.core.config import settings

logger = logging.getLogger(__name__)

# 全局连接池
_pool: Optional[Pool] = None


async def init_db_pool() -> Pool:
    """初始化数据库连接池"""
    global _pool
    
    if _pool is not None:
        return _pool
    
    try:
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            server_settings={
                'jit': 'off'
            }
        )
        logger.info(
            f"Database pool initialized: min={settings.DB_POOL_MIN_SIZE}, "
            f"max={settings.DB_POOL_MAX_SIZE}"
        )
        return _pool
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def close_db_pool() -> None:
    """关闭数据库连接池"""
    global _pool
    
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


async def get_pool() -> Pool:
    """获取数据库连接池"""
    if _pool is None:
        return await init_db_pool()
    return _pool


@asynccontextmanager
async def get_connection() -> AsyncGenerator[Connection, None]:
    """获取数据库连接的上下文管理器"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def get_transaction() -> AsyncGenerator[Connection, None]:
    """获取数据库事务的上下文管理器"""
    async with get_connection() as conn:
        async with conn.transaction():
            yield conn


async def execute_query(
    query: str,
    *args,
    fetch: bool = True,
    fetch_one: bool = False
) -> Optional[list]:
    """
    执行 SQL 查询
    
    Args:
        query: SQL 查询语句
        args: 查询参数
        fetch: 是否获取结果
        fetch_one: 是否只获取一条记录
    
    Returns:
        查询结果列表或单条记录
    """
    async with get_connection() as conn:
        if fetch_one:
            result = await conn.fetchrow(query, *args)
            return result
        elif fetch:
            result = await conn.fetch(query, *args)
            return result
        else:
            await conn.execute(query, *args)
            return None


async def execute_many(query: str, args_list: list) -> None:
    """
    批量执行 SQL 语句
    
    Args:
        query: SQL 语句
        args_list: 参数列表
    """
    async with get_connection() as conn:
        await conn.executemany(query, args_list)


# 数据库初始化 SQL
INIT_SQL = """
-- 商品表
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    spu_id VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    category_l1 VARCHAR(100),
    category_l2 VARCHAR(100),
    category_l3 VARCHAR(100),
    price_current DECIMAL(12, 2),
    price_original DECIMAL(12, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    styles JSONB DEFAULT '[]',
    materials JSONB DEFAULT '[]',
    colors JSONB DEFAULT '[]',
    sizes JSONB DEFAULT '[]',
    scenes JSONB DEFAULT '[]',
    inventory INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]',
    description TEXT,
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    source_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建商品索引
CREATE INDEX IF NOT EXISTS idx_products_spu_id ON products(spu_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_l1, category_l2, category_l3);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price_current);
CREATE INDEX IF NOT EXISTS idx_products_styles ON products USING GIN(styles);
CREATE INDEX IF NOT EXISTS idx_products_materials ON products USING GIN(materials);

-- 用户会话表
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64),
    preferences JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 推荐方案表
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(64) UNIQUE NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    schemes JSONB DEFAULT '[]',
    total_schemes INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    buyer_feedback JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendations_session_id ON recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) UNIQUE NOT NULL,
    recommendation_id VARCHAR(64) NOT NULL,
    scheme_index INTEGER NOT NULL,
    items JSONB DEFAULT '[]',
    total_amount DECIMAL(12, 2) NOT NULL,
    original_amount DECIMAL(12, 2),
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    discount_percent DECIMAL(5, 4) DEFAULT 0,
    negotiation_history JSONB DEFAULT '[]',
    status VARCHAR(32) DEFAULT 'pending',
    shipping_address JSONB,
    contact_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_recommendation_id ON orders(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Agent 活动日志表
CREATE TABLE IF NOT EXISTS agent_activities (
    id SERIAL PRIMARY KEY,
    activity_id VARCHAR(64) UNIQUE NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    agent_type VARCHAR(32) NOT NULL,  -- buyer, seller
    activity_type VARCHAR(64) NOT NULL,  -- understand_needs, recommend, negotiate, etc.
    content JSONB NOT NULL,
    timeline_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_activities_session_id ON agent_activities(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_activities_agent_type ON agent_activities(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_activities_created_at ON agent_activities(created_at);

-- 对话会话表（多对话管理）
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(64) NOT NULL DEFAULT 'demo_user_001',
    title VARCHAR(200) DEFAULT '新对话',
    session_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- 对话消息表（持久化聊天记录）
CREATE TABLE IF NOT EXISTS conversation_messages (
    id SERIAL PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(64) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_created_at ON conversation_messages(created_at);

-- 更新触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 创建更新触发器
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recommendations_updated_at ON recommendations;
CREATE TRIGGER update_recommendations_updated_at
    BEFORE UPDATE ON recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
"""


async def init_database() -> None:
    """初始化数据库表结构"""
    try:
        async with get_connection() as conn:
            await conn.execute(INIT_SQL)
            # Backward-compatible migration for products table.
            # Some historical schemas used spu_id + JSONB arrays only, while
            # current APIs expect sku_id/main_image and TEXT[] attribute columns.
            await conn.execute("""
                ALTER TABLE products ADD COLUMN IF NOT EXISTS sku_id VARCHAR(64);
                ALTER TABLE products ADD COLUMN IF NOT EXISTS main_image TEXT;
                ALTER TABLE products ADD COLUMN IF NOT EXISTS price_floor DECIMAL(12, 2);
            """)

            await conn.execute("""
                UPDATE products
                SET sku_id = COALESCE(sku_id, spu_id, CONCAT('prod_', id::text))
                WHERE sku_id IS NULL OR sku_id = '';
            """)

            await conn.execute("""
                UPDATE products
                SET main_image = COALESCE(main_image, to_jsonb(images)->>0)
                WHERE (main_image IS NULL OR main_image = '')
                  AND images IS NOT NULL;
            """)

            # Convert JSONB attribute columns into TEXT[] when needed so
            # overlap queries (&&) work in product search APIs.
            await conn.execute("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'products' AND column_name = 'styles' AND udt_name = 'jsonb'
                    ) THEN
                        ALTER TABLE products
                        ALTER COLUMN styles TYPE TEXT[]
                        USING CASE
                            WHEN styles IS NULL THEN ARRAY[]::TEXT[]
                            WHEN jsonb_typeof(styles) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(styles))
                            ELSE ARRAY[]::TEXT[]
                        END;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'products' AND column_name = 'materials' AND udt_name = 'jsonb'
                    ) THEN
                        ALTER TABLE products
                        ALTER COLUMN materials TYPE TEXT[]
                        USING CASE
                            WHEN materials IS NULL THEN ARRAY[]::TEXT[]
                            WHEN jsonb_typeof(materials) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(materials))
                            ELSE ARRAY[]::TEXT[]
                        END;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'products' AND column_name = 'colors' AND udt_name = 'jsonb'
                    ) THEN
                        ALTER TABLE products
                        ALTER COLUMN colors TYPE TEXT[]
                        USING CASE
                            WHEN colors IS NULL THEN ARRAY[]::TEXT[]
                            WHEN jsonb_typeof(colors) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(colors))
                            ELSE ARRAY[]::TEXT[]
                        END;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'products' AND column_name = 'scenes' AND udt_name = 'jsonb'
                    ) THEN
                        ALTER TABLE products
                        ALTER COLUMN scenes TYPE TEXT[]
                        USING CASE
                            WHEN scenes IS NULL THEN ARRAY[]::TEXT[]
                            WHEN jsonb_typeof(scenes) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(scenes))
                            ELSE ARRAY[]::TEXT[]
                        END;
                    END IF;
                END$$;
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_products_sku_id ON products(sku_id);
            """)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
