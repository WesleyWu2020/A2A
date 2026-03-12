# AI 家居电商 Demo

多 Agent 驱动的 AI 家居电商平台 Demo，支持自然语言需求输入、智能方案推荐、自动议价等功能。

## 项目结构

```
.
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── agents/            # LangGraph Agent 编排
│   │   ├── api/               # API 路由
│   │   ├── core/              # 核心配置 (数据库、Redis)
│   │   ├── models/            # 数据模型
│   │   └── services/          # 业务服务
│   ├── scripts/               # 数据清洗脚本
│   └── main.py               # 应用入口
├── frontend/                  # Next.js 前端
│   └── ai-home-ecommerce/
│       ├── src/app/          # 页面
│       ├── src/components/   # 组件
│       └── src/store/        # 状态管理
└── homary.json               # 商品数据源
```

## 技术栈

- **前端**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui + Zustand
- **后端**: FastAPI + Python + LangGraph + PostgreSQL + Redis
- **AI**: MiniMax 2.5 / OpenAI GPT-4o / LangGraph Agent 编排
- **部署**: Vercel (前端) + Railway/Fly.io (后端)

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 20+
- PostgreSQL 14+ (已安装 pgvector)
- Redis 6+

### 1. 数据库准备

PostgreSQL 和 Redis 已配置完成，数据已导入：

```bash
# 检查数据库
psql -h localhost -U postgres -d ai_home_ecommerce -c "SELECT COUNT(*) FROM products;"

# 检查 Redis
redis-cli ping
```

### 2. 配置 LLM (MiniMax 推荐)

编辑 `backend/.env.local` 配置 MiniMax API Key：

```bash
cd /home/ubuntu/projects/e2/backend
vim .env.local
```

配置内容：
```bash
# 使用 MiniMax (推荐)
LLM_PROVIDER=minimax
LLM_API_KEY=your-minimax-api-key
LLM_BASE_URL=https://api.minimax.chat/v1
LLM_MODEL=MiniMax-Text-01

# 或使用 OpenAI
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-your-openai-key
```

获取 MiniMax API Key: https://platform.minimax.io

### 3. 启动后端

```bash
cd /home/ubuntu/projects/e2/backend
source venv/bin/activate

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

或使用脚本：
```bash
./start_backend.sh
```

后端服务将在 http://localhost:8000 启动，API 文档：http://localhost:8000/docs

### 4. 启动前端

```bash
cd /home/ubuntu/projects/e2/frontend/ai-home-ecommerce
npm run dev
```

或使用脚本：
```bash
./start_frontend.sh
```

前端将在 http://localhost:3000 启动

## 核心功能

### 1. 首页
- Hero 区域展示核心价值
- 2D 商品拼贴视觉效果
- Try Now 入口

### 2. 对话页
- 自然语言需求输入
- 多轮对话交互
- Agent 活动日志实时展示

### 3. 方案页
- 3 套差异化方案展示
- 商品清单和价格对比
- 议价记录查看

### 4. 订单页
- 订单确认
- 履约状态跟踪

## API 接口

### 对话
- `POST /api/chat/message` - 发送消息
- `GET /api/chat/history/{session_id}` - 获取历史记录

### 推荐
- `POST /api/recommend/generate` - 生成推荐方案
- `GET /api/recommend/schemes/{id}` - 获取方案详情

### 订单
- `POST /api/order/create` - 创建订单
- `GET /api/order/{order_id}` - 获取订单详情

### WebSocket
- `WS /ws/{session_id}` - 实时活动日志

## 数据说明

- **商品数据**: 4,522 条 Homary 商品数据
- **类目**: Furniture (64.7%), Bath (11.7%), Lighting (5.4%) 等
- **价格范围**: $19.99 - $6,872.99
- **平均价格**: $673.60

## 开发计划

- [x] 项目初始化
- [x] 数据清洗与导入
- [x] 后端 API 开发
- [x] 前端页面开发
- [x] Agent 编排实现
- [x] 对接真实 LLM (支持 MiniMax / OpenAI)
- [ ] 性能优化
- [ ] 部署上线

## 注意事项

1. **LLM 配置**: 默认使用 MiniMax 2.5 模型，需配置 `LLM_API_KEY`
2. **备用方案**: 也可切换到 OpenAI，修改 `LLM_PROVIDER=openai`
3. **演示模式**: 未配置 API Key 时，AI 功能使用模拟数据
4. **图片资源**: 来自 Homary CDN

## License

MIT
