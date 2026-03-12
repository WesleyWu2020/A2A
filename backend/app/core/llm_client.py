"""
LLM 客户端封装
支持 MiniMax、OpenAI 等兼容 OpenAI SDK 的模型
"""
import logging
from typing import Optional, List, Dict, Any, AsyncGenerator
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """统一 LLM 客户端 (通过 OpenRouter 或直连)"""

    def __init__(self):
        config = settings.active_llm_config
        self.provider = settings.LLM_PROVIDER

        default_headers = {}
        if self.provider == "openrouter":
            default_headers["HTTP-Referer"] = settings.OPENROUTER_SITE_URL
            default_headers["X-Title"] = settings.OPENROUTER_SITE_NAME

        self.client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
            default_headers=default_headers or None,
        )
        self.model = config["model"]
        self.temperature = config["temperature"]
        self.max_tokens = config["max_tokens"]

        logger.info(f"LLMClient initialized: provider={self.provider}, model={self.model}")
    
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        stream: bool = False,
        response_format: Optional[Dict[str, Any]] = None
    ) -> Any:
        """
        调用对话补全接口
        
        Args:
            messages: 消息列表 [{"role": "user", "content": "..."}]
            model: 模型名称，默认使用配置中的模型
            temperature: 温度参数
            max_tokens: 最大 token 数
            stream: 是否流式返回
            response_format: 响应格式，如 {"type": "json_object"}
        """
        try:
            params = {
                "model": model or self.model,
                "messages": messages,
                "temperature": temperature if temperature is not None else self.temperature,
                "max_tokens": max_tokens if max_tokens is not None else self.max_tokens,
                "stream": stream
            }
            
            # 添加 response_format（如果指定）
            if response_format:
                params["response_format"] = response_format
            
            response = await self.client.chat.completions.create(**params)
            
            if stream:
                return response  # 返回流式响应迭代器
            
            # 非流式响应，返回内容
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"LLM API error: {e}")
            raise
    
    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """流式对话补全"""
        try:
            response = await self.chat_completion(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True
            )
            
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"LLM streaming error: {e}")
            raise
    
    def validate_config(self) -> bool:
        """验证 LLM 配置是否有效"""
        config = settings.active_llm_config
        if not config["api_key"]:
            logger.warning(f"LLM API Key not configured for provider: {self.provider}")
            return False
        return True


# 全局 LLM 客户端实例
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """获取 LLM 客户端单例"""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


def reset_llm_client():
    """重置 LLM 客户端（用于配置更新后）"""
    global _llm_client
    _llm_client = None
    logger.info("LLM client reset")
