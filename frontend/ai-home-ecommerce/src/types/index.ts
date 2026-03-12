// 产品相关类型
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  category: string;
  tags: string[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
  sku: string;
  attributes: Record<string, string>;
}

// 分类类型
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parentId?: string;
  children?: Category[];
}

// 用户类型
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  phone?: string;
  address?: Address[];
  preferences?: UserPreferences;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
}

// 订单类型
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  shippingAddress: Address;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
}

export type OrderStatus = 
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

// API 响应类型
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Agent 消息类型（用于多Agent对话）
export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  agentAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'product' | 'recommendation';
  products?: Product[];
  timestamp: string;
}

// ==================== 新增类型 ====================

// 对话消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  type?: 'text' | 'product' | 'scheme' | 'loading';
  products?: Product[];
  schemes?: Scheme[];
}

// Agent 工作阶段
export type AgentStage = 
  | 'idle'
  | 'retrieving'
  | 'filtering'
  | 'inquiring'
  | 'negotiating'
  | 'summarizing'
  | 'completed'
  | 'error';

export interface AgentStageInfo {
  stage: AgentStage;
  label: string;
  description: string;
  progress: number;
  timestamp: string;
}

// 议价记录
export interface NegotiationRecord {
  id: string;
  productId: string;
  productName: string;
  originalPrice: number;
  finalPrice: number;
  discount: number;
  strategy: string;
  reason: string;
  rounds: NegotiationRound[];
  timestamp: string;
}

export interface NegotiationRound {
  round: number;
  buyerOffer: number;
  sellerResponse: number;
  sellerMessage: string;
}

// 方案类型
export interface Scheme {
  id: string;
  name: string;
  style: string;
  description: string;
  products: SchemeProduct[];
  originalTotal: number;
  finalTotal: number;
  totalDiscount: number;
  recommendationReason: string;
  coverImage?: string;
}

export interface SchemeProduct {
  product: Product;
  quantity: number;
  originalPrice: number;
  finalPrice: number;
  negotiationRecord?: NegotiationRecord;
}

// 订单表单数据
export interface OrderFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  province: string;
  city: string;
  district: string;
  remark?: string;
}

// 履约状态
export interface FulfillmentStatus {
  stage: 'ordered' | 'preparing' | 'shipped' | 'delivering' | 'delivered';
  label: string;
  description: string;
  timestamp?: string;
  completed: boolean;
}

// WebSocket 消息类型
export interface WebSocketMessage {
  type: 'agent_stage' | 'negotiation_update' | 'chat_message' | 'error' | 'connected';
  payload: unknown;
  timestamp: string;
}

export interface AgentStageMessage {
  sessionId: string;
  stage: AgentStage;
  progress: number;
  message: string;
}

// 聊天请求/响应
export interface ChatRequest {
  sessionId?: string;
  message: string;
  context?: ChatMessage[];
}

export interface ChatResponse {
  sessionId: string;
  session_id?: string;
  message: ChatMessage | string;
  schemes?: Scheme[];
  has_schemes?: boolean;
}

// ==================== 记忆系统类型 ====================

export interface ContextPin {
  key: string;
  label: string;
  value?: string;
  removable?: boolean;
}

export interface MemoryTag {
  key: string;
  label: string;
  value?: string;
  category: 'preference' | 'constraint' | 'lifestyle' | 'budget';
  confidence: number;
  source: 'explicit' | 'implicit';
  created_at: string;
}

export interface SpaceProfile {
  space_id: string;
  name: string;
  area_sqft?: number;
  area_sqm?: number;
  style?: string;
  notes?: string;
}

export interface UserLongTermMemory {
  user_id: string;
  nickname?: string;
  spaces: SpaceProfile[];
  active_space_id?: string;
  tags: MemoryTag[];
  purchase_history_summary: string[];
  avg_order_value?: number;
  visit_count: number;
  last_seen: string;
  created_at: string;
}

export interface ImplicitPreferencePrompt {
  session_id: string;
  detected_key: string;
  detected_label: string;
  detected_value?: string;
  category: string;
  confirmation_prompt: string;
}

// ==================== 项目制上下文隔离类型 ====================

export interface ProjectContext {
  budget_total?: number;
  budget_spent?: number;
  style?: string;
  room_type?: string;
  room_dimensions?: { length: number; width: number; height: number };
  constraints?: string[];
  notes?: string;
}

export interface FavoriteItem {
  product_id: string;
  product_name: string;
  price?: number;
  image_url?: string;
  reason?: string;
  added_at?: string;
}

export interface ProjectDesign {
  project_id: string;
  user_id: string;
  name: string;
  icon: string;
  status: string;
  context: ProjectContext;
  favorites: FavoriteItem[];
  session_ids: string[];
  scheme_snapshots: string[];
  created_at: string;
  updated_at: string;
}

// ==================== Agent Skills 类型 ====================

export interface SkillInvocation {
  skill_name: string;
  input_summary: string;
  result_summary: string;
  passed: boolean;
  timestamp: string;
}

