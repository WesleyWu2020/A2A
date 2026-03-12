# AI家居电商前端项目结构

## 项目概览
Next.js + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion + Zustand

## 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 首页 (Hero + 2D商品展示 + CTA)
│   ├── layout.tsx                # 根布局 (字体 + 元数据)
│   ├── globals.css               # 全局样式 (Tailwind + shadcn)
│   ├── chat/
│   │   └── page.tsx              # 对话页 (需求输入 + 消息列表)
│   ├── schemes/
│   │   └── page.tsx              # 方案结果页 (3套方案展示)
│   └── order/
│       └── page.tsx              # 订单页 (表单 + 成功状态)
│
├── components/                   # 共享组件
│   ├── Header.tsx                # 导航栏
│   ├── ProductCard.tsx           # 商品卡片 (3种变体)
│   ├── SchemeCard.tsx            # 方案卡片
│   ├── PriceDisplay.tsx          # 价格展示 (原价/折扣)
│   ├── LoadingSpinner.tsx        # 加载动画 (含骨架屏)
│   ├── AgentTimeline.tsx         # Agent 活动日志
│   ├── NegotiationDialog.tsx     # 议价记录弹窗
│   └── ui/
│       └── button.tsx            # shadcn Button 组件
│
├── hooks/                        # 自定义 Hooks
│   └── useWebSocket.ts           # WebSocket 连接管理
│
├── lib/                          # 工具库
│   ├── api.ts                    # API 客户端 + WebSocket
│   ├── utils.ts                  # 工具函数 (cn)
│   └── query-client.ts           # React Query 客户端
│
├── store/                        # Zustand 状态管理
│   └── index.ts                  # Chat/Scheme/Order Store
│
└── types/                        # TypeScript 类型定义
    └── index.ts                  # 所有类型定义
```

## 核心功能模块

### 1. 首页 (src/app/page.tsx)
- Hero 区域：展示"AI 帮你完成复杂家居采购"核心卖点
- 2D 视觉展示：商品卡片拼贴效果（FloatingCard 动画）
- Try Now 主 CTA 按钮，跳转到对话页
- 特性介绍卡片

### 2. 对话页 (src/app/chat/page.tsx)
- 对话式需求输入界面
- 用户消息和 AI 消息展示 (MessageBubble)
- 输入框支持多轮对话
- 快捷提示按钮
- 侧边栏：Agent Timeline 组件
- 调用后端 API: POST /api/chat/message

### 3. Agent 活动日志 (src/components/AgentTimeline.tsx)
- 展示 Agent 工作阶段：检索、过滤、询价、议价、汇总
- 实时接收 WebSocket 消息更新
- 带动画的进度条和状态指示
- 支持紧凑模式和完整模式

### 4. 方案结果页 (src/app/schemes/page.tsx)
- 展示 3 套方案 (SchemeCard)
- 每套方案包含：名称、风格、商品清单、价格对比、推荐理由
- 查看议价记录按钮
- 选择方案下单按钮
- 包含模拟数据

### 5. 议价记录弹窗 (src/components/NegotiationDialog.tsx)
- 展示起始价格、优惠策略、最终价格
- 卖家 Agent 的让利原因说明
- 多轮议价对话展示

### 6. 订单页 (src/app/order/page.tsx)
- 订单确认表单 (收货信息)
- 订单成功展示 (OrderSuccess 组件)
- 履约状态卡片：已下单 → 备货中 → 已发货 → 预计送达

### 7. 共享组件 (src/components/)
- **Header**: 响应式导航栏，含移动端适配
- **ProductCard**: 商品卡片，支持 default/compact/horizontal 三种变体
- **SchemeCard**: 方案卡片，含展开/收起商品清单功能
- **LoadingSpinner**: 加载动画，含骨架屏、打字指示器
- **PriceDisplay**: 价格展示组件，支持折扣显示

### 8. 状态管理 (src/store/)
- **useChatStore**: 对话状态、消息列表、发送消息
- **useSchemeStore**: 方案列表、选中方案
- **useOrderStore**: 订单表单、当前订单、履约状态
- **useAgentTimelineStore**: Agent 阶段追踪

### 9. API 客户端 (src/lib/api.ts)
- HTTP API 封装 (fetch)
- WebSocket 连接管理 (自动重连)
- 类型安全的请求/响应处理

## 设计风格
- 主色调：深蓝/紫色系 (indigo-600, violet-600) - 科技感
- 辅助色：橙色/金色 (amber-500) - 强调 CTA
- 卡片式布局 + 圆角设计
- 2D 插画风格（Framer Motion 动画）
- 响应式设计 (mobile-first)

## 依赖项
- next: 14.2.35
- react: ^18
- framer-motion: ^12.35.1 (动画)
- zustand: ^5.0.11 (状态管理)
- tailwindcss: ^3.4.1 (样式)
- lucide-react: ^0.577.0 (图标)
- @tanstack/react-query: ^5.90.21 (数据获取)
