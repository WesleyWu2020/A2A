# LLM 配置指南

本项目支持多种 LLM 提供商，默认使用 **MiniMax 2.5** 模型。

## 支持的模型

### 1. MiniMax (推荐)
- **模型**: `MiniMax-Text-01` (最新 2.5 版本)
- **特点**: 中文理解能力强，性价比高
- **文档**: https://platform.minimax.io/docs

### 2. OpenAI
- **模型**: `gpt-4o-mini`, `gpt-4o`
- **特点**: 英文理解能力强，功能丰富
- **文档**: https://platform.openai.com/docs

## 快速配置

### 方式 1: 使用 MiniMax (推荐)

1. 获取 API Key
   - 访问 https://platform.minimax.io
   - 注册账号并创建应用
   - 获取 Group ID 和 API Key

2. 配置环境变量
   ```bash
   cd /home/ubuntu/projects/e2/backend
   vim .env.local
   ```

3. 填入配置
   ```bash
   LLM_PROVIDER=minimax
   LLM_API_KEY=your-minimax-api-key
   LLM_BASE_URL=https://api.minimax.chat/v1
   LLM_MODEL=MiniMax-Text-01
   ```

### 方式 2: 使用 OpenAI

```bash
# 编辑 .env.local
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4o-mini
```

## 配置文件详解

### `backend/.env.local`

```bash
# ============================================
# LLM 基础配置
# ============================================

# LLM 提供商: minimax | openai
LLM_PROVIDER=minimax

# API Key (必须)
LLM_API_KEY=your-api-key

# API 地址
LLM_BASE_URL=https://api.minimax.chat/v1

# 模型名称
LLM_MODEL=MiniMax-Text-01

# 温度参数 (0-2，越大越随机)
LLM_TEMPERATURE=0.7

# 最大 Token 数
LLM_MAX_TOKENS=4000
```

## MiniMax 模型选择

| 模型 | 上下文长度 | 特点 | 适用场景 |
|------|-----------|------|---------|
| MiniMax-Text-01 | 200K | 最新版本，综合能力最强 | 推荐默认使用 |
| abab6.5s | 8K | 轻量级，响应快 | 简单对话 |
| abab6.5g | 8K | 通用型 | 一般任务 |
| abab6.5t | 8K | 中文优化 | 中文场景 |

## 验证配置

启动后端时会自动检查配置：

```bash
./start_backend.sh
```

输出示例：
```
✅ 已加载 .env.local 配置
✅ MiniMax 配置已启用
   模型: MiniMax-Text-01
   API: https://api.minimax.chat/v1

启动后端服务...
```

## 故障排查

### 问题 1: API Key 无效
```
⚠️ 警告: MiniMax API Key 未配置
```
**解决**: 检查 `.env.local` 中的 `LLM_API_KEY` 是否正确

### 问题 2: API 调用失败
**解决**: 
1. 检查网络连接
2. 确认 API Key 有相应模型的调用权限
3. 查看后端日志: `tail -f backend/logs/app.log`

### 问题 3: 响应慢或超时
**解决**: 
1. 降低 `LLM_MAX_TOKENS` 值
2. 检查网络延迟
3. 尝试切换模型

## 代码中使用

```python
from app.core.llm_client import get_llm_client

llm = get_llm_client()

# 调用 LLM
response = await llm.chat_completion(
    messages=[
        {"role": "system", "content": "你是助手"},
        {"role": "user", "content": "你好"}
    ]
)
print(response)
```

## 注意事项

1. **API Key 安全**: 不要提交到 Git，使用 `.env.local` 文件
2. **额度监控**: 关注 MiniMax/OpenAI 控制台的使用量
3. **失败降级**: 未配置 API Key 时，系统自动使用模拟数据
