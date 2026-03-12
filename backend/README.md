# 多 Agent 家居电商 Demo - 后端

基于 FastAPI 的多 Agent 家居电商系统后端。

## 技术栈

- **FastAPI** - 高性能 Web 框架
- **Pydantic v2** - 数据验证和序列化
- **WebSocket** - 实时通信
- **内存存储** - 数据加载到内存，支持快速查询

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── models/              # 数据模型 (Pydantic)
│   │   ├── product.py       # 商品模型
│   │   ├── user.py          # 用户画像模型
│   │   ├── scheme.py        # 方案模型
│   │   ├── order.py         # 订单模型
│   │   └── timeline.py      # Timeline 事件模型
│   ├── core/                # 核心模块
│   │   └── data_loader.py   # 数据加载器
│   ├── services/            # 业务服务层
│   │   ├── product_service.py
│   │   ├── scheme_service.py
│   │   ├── negotiation_service.py
│   │   └── order_service.py
│   ├── agents/              # Agent 编排
│   │   ├── buyer_agent.py   # 买家 Agent
│   │   ├── seller_agent.py  # 卖家 Agent
│   │   ├── orchestrator.py  # Agent 编排器
│   │   └── timeline_emitter.py
│   └── api/                 # API 路由
│       ├── chat.py
│       ├── recommend.py
│       ├── negotiation.py
│       ├── order.py
│       ├── products.py
│       └── timeline_ws.py   # WebSocket
├── main.py                  # 主入口
├── requirements.txt
└── .env.example
```

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

### 3. 启动服务

```bash
python main.py
```

或使用 uvicorn：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 访问 API 文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 端点

### 对话
- `POST /api/chat/start` - 开始对话
- `POST /api/chat/message` - 发送消息
- `GET /api/chat/status/{session_id}` - 获取会话状态

### 推荐
- `POST /api/recommend/generate` - 生成推荐方案
- `GET /api/recommend/{session_id}` - 获取推荐结果
- `POST /api/recommend/select` - 选择方案开始议价

### 议价
- `GET /api/negotiation/{scheme_id}` - 获取议价记录
- `POST /api/negotiation/counter` - 用户还价
- `POST /api/negotiation/accept` - 接受报价

### 订单
- `POST /api/order/create` - 创建订单
- `GET /api/order/{order_id}` - 获取订单详情
- `POST /api/order/{order_id}/pay` - 支付订单

### 商品
- `GET /api/products/search` - 商品搜索
- `GET /api/products/{product_id}` - 商品详情
- `GET /api/products/category/list` - 类目列表
- `GET /api/products/style/list` - 风格列表

### WebSocket
- `WS /ws/timeline/{session_id}` - Timeline 实时推送

## Agent 状态机

```
┌─────────┐    start     ┌────────────┐
│  idle   │ ───────────▶ │ collecting │
└─────────┘              └─────┬──────┘
                               │
                               ▼ message
                         ┌────────────┐
                         │  解析需求  │
                         └─────┬──────┘
                               │
                               ▼
                         ┌────────────┐
                         │recommending│
                         └─────┬──────┘
                               │
                               ▼ select
                         ┌────────────┐
                         │negotiating │◀──────┐
                         └─────┬──────┘       │
                               │              │ counter
                               ▼ accept       │
                         ┌────────────┐       │
                         │  ordering  │───────┘
                         └─────┬──────┘
                               │
                               ▼ create
                         ┌────────────┐
                         │ completed  │
                         └────────────┘
```

## 开发说明

### 数据模型

所有数据模型使用 Pydantic v2 定义，位于 `app/models/` 目录。

### Agent 实现

- **BuyerAgent**: 负责需求解析、商品筛选、方案生成
- **SellerAgent**: 负责底价检查、折扣策略、议价说明
- **Orchestrator**: 协调 Buyer 和 Seller，管理工作流

### 数据存储

商品数据从 JSONL 文件加载到内存，通过 `ProductDataStore` 管理。

### Timeline

使用 WebSocket 实时推送 Agent 活动日志，支持：
- 实时事件推送
- 历史事件查询
- 多连接管理

## License

MIT
