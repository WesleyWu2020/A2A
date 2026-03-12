#!/bin/bash
cd /home/ubuntu/projects/e2/backend
source venv/bin/activate

# 加载本地环境变量（如果存在）
if [ -f .env.local ]; then
    export $(grep -v '^#' .env.local | xargs)
    echo "✅ 已加载 .env.local 配置"
fi

# 检查 LLM 配置
if [ "$LLM_PROVIDER" = "minimax" ]; then
    if [ -z "$LLM_API_KEY" ] || [ "$LLM_API_KEY" = "your-minimax-api-key" ]; then
        echo "⚠️  警告: MiniMax API Key 未配置，AI 功能将使用模拟数据"
        echo "   请编辑 .env.local 文件配置 LLM_API_KEY"
        echo "   获取地址: https://platform.minimax.io"
    else
        echo "✅ MiniMax 配置已启用"
        echo "   模型: $LLM_MODEL"
        echo "   API: $LLM_BASE_URL"
    fi
else
    if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "sk-your-openai-key" ]; then
        echo "⚠️  警告: OpenAI API Key 未配置，AI 功能将使用模拟数据"
        echo "   请编辑 .env.local 文件配置 OPENAI_API_KEY"
    else
        echo "✅ OpenAI 配置已启用"
        echo "   模型: $OPENAI_MODEL"
    fi
fi

echo ""
echo "启动后端服务..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
