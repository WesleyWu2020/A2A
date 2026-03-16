"""
应用配置管理模块
包含数据库、Redis、OpenAI 等配置
"""
from functools import lru_cache
from typing import Optional, List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """应用配置类"""
    
    # 应用配置
    APP_NAME: str = Field(default="MartGenie", description="应用名称")
    APP_VERSION: str = Field(default="1.0.0", description="应用版本")
    DEBUG: bool = Field(default=False, description="调试模式")
    
    # 服务器配置
    HOST: str = Field(default="127.0.0.1", description="服务器主机")
    PORT: int = Field(default=8000, description="服务器端口")
    
    # 数据库配置 (PostgreSQL)
    DATABASE_URL: str = Field(
        default="postgresql://user:password@localhost:5432/home_design",
        description="PostgreSQL 数据库连接 URL"
    )
    DB_POOL_MIN_SIZE: int = Field(default=5, description="数据库连接池最小连接数")
    DB_POOL_MAX_SIZE: int = Field(default=20, description="数据库连接池最大连接数")
    DB_COMMAND_TIMEOUT: int = Field(default=60, description="数据库命令超时时间(秒)")
    
    # Redis 配置
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis 连接 URL"
    )
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis 密码")
    REDIS_TIMEOUT: int = Field(default=5, description="Redis 连接超时(秒)")
    
    # LLM 配置 (通过 OpenRouter 统一接入)
    LLM_PROVIDER: str = Field(default="openrouter", description="LLM 提供商: openrouter/openai/minimax")
    LLM_API_KEY: str = Field(default="", description="LLM API Key (OpenRouter API Key)")
    LLM_BASE_URL: str = Field(default="https://openrouter.ai/api/v1", description="LLM Base URL")
    LLM_MODEL: str = Field(default="google/gemini-2.0-flash-001", description="默认使用的模型")
    LLM_TEMPERATURE: float = Field(default=0.7, description="温度参数")
    LLM_MAX_TOKENS: int = Field(default=4000, description="最大 Token 数")

    # OpenRouter 额外配置
    OPENROUTER_SITE_URL: str = Field(default="https://ai-home-ecommerce.demo", description="OpenRouter HTTP-Referer")
    OPENROUTER_SITE_NAME: str = Field(default="MartGenie", description="OpenRouter X-Title")
    
    # CORS 配置
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        description="允许的 CORS 来源"
    )
    
    # JWT 配置
    JWT_SECRET_KEY: str = Field(default="your-secret-key", description="JWT 密钥")
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT 算法")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=60 * 24 * 7,  # 7 天
        description="JWT Token 过期时间(分钟)"
    )
    
    # 日志配置
    LOG_LEVEL: str = Field(default="INFO", description="日志级别")
    LOG_FORMAT: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="日志格式"
    )
    
    # 业务配置
    MAX_RECOMMENDATIONS_PER_SESSION: int = Field(
        default=10,
        description="每个会话最大推荐方案数"
    )
    NEGOTIATION_MAX_ROUNDS: int = Field(
        default=5,
        description="议价最大轮数"
    )
    NEGOTIATION_DISCOUNT_MAX_PERCENT: float = Field(
        default=0.15,
        description="议价最大折扣比例(15%)"
    )
    
    @property
    def active_llm_config(self):
        """获取当前激活的 LLM 配置"""
        return {
            "api_key": self.LLM_API_KEY,
            "base_url": self.LLM_BASE_URL,
            "model": self.LLM_MODEL,
            "temperature": self.LLM_TEMPERATURE,
            "max_tokens": self.LLM_MAX_TOKENS,
        }
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """获取应用配置（缓存单例）"""
    return Settings()


# 导出配置实例
settings = get_settings()
