import {
  ChatRequest,
  ChatResponse,
  Scheme,
  OrderFormData,
  Order,
  ApiResponse,
  WebSocketMessage,
  AgentStageMessage,
  UserLongTermMemory,
  ContextPin,
  MemoryTag,
  SpaceProfile,
  ProjectDesign,
  ProjectContext,
  FavoriteItem,
  Conversation,
  SellerProduct,
  SellerProductPayload,
  SellerAgentStrategy,
  SellerSandboxPayload,
  SellerSandboxResult,
  SellerInsightSummary,
  SellerWorkbenchData,
} from '@/types';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

// ==================== HTTP API ====================

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const raw = await response.json();

      // Transform backend {code, message, data} format → {success, data} format
      if (raw.code !== undefined) {
        return {
          success: raw.code >= 200 && raw.code < 300,
          data: raw.data as T,
          message: raw.message,
          error: raw.code >= 300 ? raw.message : undefined,
        };
      }

      // Already in {success, data} format (e.g., negotiation endpoints)
      return raw as ApiResponse<T>;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // 发送聊天消息
  async sendChatMessage(request: ChatRequest): Promise<ApiResponse<ChatResponse & { session_id?: string; has_schemes?: boolean }>> {
    return this.request('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({
        session_id: request.sessionId,
        message: request.message,
      }),
    });
  }

  async sendChatMessageStream(
    request: ChatRequest,
    handlers: {
      onStart?: (data: Record<string, unknown>) => void;
      onToken?: (data: { content: string; delta: string; session_id?: string }) => void;
      onComplete?: (data: Record<string, unknown>) => void;
    } = {}
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: request.sessionId,
        message: request.message,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completePayload: Record<string, unknown> = {};

    const parseBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventName = '';
      const dataLines: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim();
        }
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trim());
        }
      }

      if (!eventName || dataLines.length === 0) return;
      const dataText = dataLines.join('\n');

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(dataText) as Record<string, unknown>;
      } catch {
        parsed = { text: dataText };
      }

      if (eventName === 'start') {
        handlers.onStart?.(parsed);
      } else if (eventName === 'token') {
        handlers.onToken?.({
          content: String(parsed.content || ''),
          delta: String(parsed.delta || ''),
          session_id: parsed.session_id ? String(parsed.session_id) : undefined,
        });
      } else if (eventName === 'complete') {
        completePayload = parsed;
        handlers.onComplete?.(parsed);
      } else if (eventName === 'error') {
        throw new Error(String(parsed.message || 'Streaming failed'));
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        if (block.trim()) parseBlock(block);
      }
    }

    if (buffer.trim()) {
      parseBlock(buffer);
    }

    return completePayload;
  }

  // 获取方案列表 (按 session)
  async getSchemes(sessionId: string): Promise<ApiResponse<Scheme[]>> {
    return this.request<Scheme[]>(`/api/recommend/session/${sessionId}`);
  }

  async getChatHistory(sessionId: string, limit = 100): Promise<ApiResponse<{ session_id: string; messages: Array<Record<string, unknown>>; total: number }>> {
    return this.request<{ session_id: string; messages: Array<Record<string, unknown>>; total: number }>(
      `/api/chat/history/${sessionId}?limit=${limit}`
    );
  }

  // 获取方案详情
  async getSchemeDetail(schemeId: string): Promise<ApiResponse<Scheme>> {
    return this.request<Scheme>(`/api/recommend/schemes/${schemeId}`);
  }

  // 选择方案
  async selectScheme(schemeId: string, sessionId: string): Promise<ApiResponse<{ orderId: string }>> {
    return this.request<{ orderId: string }>('/api/recommend/select', {
      method: 'POST',
      body: JSON.stringify({ scheme_id: schemeId, session_id: sessionId }),
    });
  }

  // 创建订单
  async createOrder(orderData: OrderFormData & { schemeId: string }): Promise<ApiResponse<Order>> {
    return this.request<Order>('/api/order/create', {
      method: 'POST',
      body: JSON.stringify({
        scheme_id: orderData.schemeId,
        shipping_address: {
          name: orderData.name,
          phone: orderData.phone,
          province: orderData.province,
          city: orderData.city,
          district: orderData.district,
          detail: orderData.address,
        },
        contact_info: {
          email: orderData.email,
          remark: orderData.remark,
        },
      }),
    });
  }

  // 获取订单详情
  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/api/order/${orderId}`);
  }

  // 获取订单履约状态 (Demo mock — no dedicated endpoint in backend)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getOrderFulfillment(orderId: string): Promise<ApiResponse<FulfillmentStage[]>> {
    // Return mock fulfillment stages for the demo
    return Promise.resolve({
      success: true,
      data: [
        { stage: 'ordered', label: 'Order Placed', description: 'Your order has been confirmed', completed: true },
        { stage: 'preparing', label: 'Preparing', description: 'Items being prepared for shipment', completed: false },
        { stage: 'shipped', label: 'Shipped', description: 'Package on its way', completed: false },
        { stage: 'delivering', label: 'Out for Delivery', description: 'Arriving soon', completed: false },
        { stage: 'delivered', label: 'Delivered', description: 'Order complete', completed: false },
      ] as FulfillmentStage[],
    });
  }

  // 获取议价记录
  async getNegotiation(schemeId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/negotiation/${schemeId}`);
  }

  // ── Memory API ────────────────────────────────────────────────────────────

  async getUserMemory(userId: string): Promise<ApiResponse<UserLongTermMemory>> {
    return this.request<UserLongTermMemory>(`/api/memory/user/${userId}`);
  }

  async addMemoryTag(userId: string, tag: MemoryTag): Promise<ApiResponse<{ tags: MemoryTag[] }>> {
    return this.request<{ tags: MemoryTag[] }>('/api/memory/user/tag/add', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, tag }),
    });
  }

  async removeMemoryTag(userId: string, tagKey: string): Promise<ApiResponse<{ tags: MemoryTag[] }>> {
    return this.request<{ tags: MemoryTag[] }>('/api/memory/user/tag/remove', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, tag_key: tagKey }),
    });
  }

  async upsertSpace(userId: string, space: SpaceProfile): Promise<ApiResponse<UserLongTermMemory>> {
    return this.request<UserLongTermMemory>('/api/memory/user/space', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, space }),
    });
  }

  async updateUserMemory(userId: string, patch: Partial<UserLongTermMemory>): Promise<ApiResponse<UserLongTermMemory>> {
    return this.request<UserLongTermMemory>('/api/memory/user/upsert', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...patch }),
    });
  }

  async getSessionPins(sessionId: string): Promise<ApiResponse<{ context_pins: ContextPin[] }>> {
    return this.request<{ context_pins: ContextPin[] }>(`/api/memory/session/${sessionId}/pins`);
  }

  async removeSessionPin(sessionId: string, pinKey: string): Promise<ApiResponse<{ context_pins: ContextPin[] }>> {
    return this.request<{ context_pins: ContextPin[] }>(
      `/api/memory/session/${sessionId}/pins/${pinKey}`,
      { method: 'DELETE' }
    );
  }

  // ── Project API ─────────────────────────────────────────────────────────

  async listProjects(userId: string): Promise<ApiResponse<{ projects: ProjectDesign[]; active_project_id: string | null }>> {
    return this.request<{ projects: ProjectDesign[]; active_project_id: string | null }>(`/api/projects/user/${userId}`);
  }

  async getProject(projectId: string): Promise<ApiResponse<ProjectDesign>> {
    return this.request<ProjectDesign>(`/api/projects/${projectId}`);
  }

  async createProject(userId: string, name: string, icon: string = '🏠', context?: ProjectContext): Promise<ApiResponse<ProjectDesign>> {
    return this.request<ProjectDesign>('/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name, icon, context }),
    });
  }

  async updateProject(projectId: string, patch: { name?: string; icon?: string; status?: string; context?: ProjectContext }): Promise<ApiResponse<ProjectDesign>> {
    return this.request<ProjectDesign>(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async deleteProject(projectId: string, userId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>(`/api/projects/${projectId}?user_id=${userId}`, {
      method: 'DELETE',
    });
  }

  async setActiveProject(userId: string, projectId: string): Promise<ApiResponse<{ active_project_id: string }>> {
    return this.request<{ active_project_id: string }>(`/api/projects/user/${userId}/active/${projectId}`, {
      method: 'POST',
    });
  }

  async getActiveProject(userId: string): Promise<ApiResponse<ProjectDesign | null>> {
    return this.request<ProjectDesign | null>(`/api/projects/user/${userId}/active`);
  }

  async addFavorite(userId: string, projectId: string, item: { product_id: string; product_name: string; price?: number; image_url?: string; reason?: string }): Promise<ApiResponse<{ favorites: FavoriteItem[] }>> {
    return this.request<{ favorites: FavoriteItem[] }>('/api/projects/favorites/add', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, project_id: projectId, ...item }),
    });
  }

  async removeFavorite(userId: string, projectId: string, productId: string): Promise<ApiResponse<{ favorites: FavoriteItem[] }>> {
    return this.request<{ favorites: FavoriteItem[] }>('/api/projects/favorites/remove', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, project_id: projectId, product_id: productId }),
    });
  }

  async listFavorites(projectId: string): Promise<ApiResponse<{ favorites: FavoriteItem[] }>> {
    return this.request<{ favorites: FavoriteItem[] }>(`/api/projects/${projectId}/favorites`);
  }

  // ── Skills API ──────────────────────────────────────────────────────────

  async checkBudget(budgetTotal: number, budgetSpent: number, items: { price: number; quantity: number }[]): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>('/api/skills/budget/check', {
      method: 'POST',
      body: JSON.stringify({ budget_total: budgetTotal, budget_spent: budgetSpent, proposed_items: items }),
    });
  }

  async checkDimensions(roomDimensions: { length: number; width: number; height: number }, existingFurniture: Record<string, number>[], proposedFurniture: Record<string, number>[]): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>('/api/skills/dimension/check', {
      method: 'POST',
      body: JSON.stringify({ room_dimensions: roomDimensions, existing_furniture: existingFurniture, proposed_furniture: proposedFurniture }),
    });
  }

  // ── Conversation API ──────────────────────────────────────────────────

  async createConversation(userId: string, title?: string): Promise<ApiResponse<{ conversation_id: string; session_id: string; title: string; created_at: string }>> {
    return this.request('/api/conversations/create', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, title }),
    });
  }

  async listConversations(userId: string, limit = 50): Promise<ApiResponse<{ conversations: Conversation[] }>> {
    return this.request<{ conversations: Conversation[] }>(`/api/conversations/user/${userId}?limit=${limit}`);
  }

  async getConversation(conversationId: string): Promise<ApiResponse<Conversation & { messages: Array<{ id: string; role: string; content: string; type: string; timestamp: string; metadata: Record<string, unknown> }> }>> {
    return this.request(`/api/conversations/${conversationId}`);
  }

  async saveMessage(conversationId: string, message: { message_id: string; role: string; content: string; message_type?: string; metadata?: Record<string, unknown> }): Promise<ApiResponse<{ status: string }>> {
    return this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    });
  }

  async renameConversation(conversationId: string, title: string): Promise<ApiResponse<{ title: string }>> {
    return this.request(`/api/conversations/${conversationId}/title`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(conversationId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  }

  async generateConversationTitle(conversationId: string, firstMessage: string): Promise<ApiResponse<{ title: string }>> {
    return this.request(`/api/conversations/${conversationId}/generate-title`, {
      method: 'POST',
      body: JSON.stringify({ first_message: firstMessage }),
    });
  }

  // ── Seller Workspace API ────────────────────────────────────────────────

  async getSellerWorkbench(sellerId: string): Promise<ApiResponse<SellerWorkbenchData>> {
    return this.request<SellerWorkbenchData>(`/api/seller/${sellerId}/workbench`);
  }

  async listSellerProducts(sellerId: string): Promise<ApiResponse<{ products: SellerProduct[] }>> {
    return this.request<{ products: SellerProduct[] }>(`/api/seller/${sellerId}/products`);
  }

  async createSellerProduct(sellerId: string, payload: SellerProductPayload): Promise<ApiResponse<SellerProduct>> {
    return this.request<SellerProduct>(`/api/seller/${sellerId}/products`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async parseSellerBulkProducts(sellerId: string, rawText: string): Promise<ApiResponse<{ parsed_products: SellerProductPayload[]; warnings: string[] }>> {
    return this.request<{ parsed_products: SellerProductPayload[]; warnings: string[] }>(`/api/seller/${sellerId}/products/bulk-parse`, {
      method: 'POST',
      body: JSON.stringify({ raw_text: rawText }),
    });
  }

  async updateSellerStrategy(sellerId: string, strategy: SellerAgentStrategy): Promise<ApiResponse<SellerAgentStrategy>> {
    return this.request<SellerAgentStrategy>(`/api/seller/${sellerId}/strategy`, {
      method: 'PUT',
      body: JSON.stringify(strategy),
    });
  }

  async simulateSeller(sellerId: string, payload: SellerSandboxPayload): Promise<ApiResponse<SellerSandboxResult>> {
    return this.request<SellerSandboxResult>(`/api/seller/${sellerId}/sandbox/simulate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getSellerInsights(sellerId: string): Promise<ApiResponse<SellerInsightSummary>> {
    return this.request<SellerInsightSummary>(`/api/seller/${sellerId}/insights`);
  }
}

// 履约状态类型
export interface FulfillmentStage {
  stage: string;
  label: string;
  description: string;
  timestamp?: string;
  completed: boolean;
}

export const apiClient = new ApiClient(API_BASE_URL);

// ==================== WebSocket ====================

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private messageHandlers: Map<string, ((data: unknown) => void)[]> = new Map();
  private sessionId: string | null = null;

  constructor(sessionId?: string) {
    this.baseUrl = `${WS_BASE_URL}/ws`;
    this.sessionId = sessionId || null;
  }

  connect(sessionId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (sessionId) {
        this.sessionId = sessionId;
      }

      if (!this.sessionId) {
        reject(new Error('Session ID required for WebSocket connection'));
        return;
      }

      // Backend expects: /ws/{session_id} (path param, not query string)
      const wsUrl = `${this.baseUrl}/${this.sessionId}`;

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (error) {
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('WebSocket connected:', wsUrl);
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        console.log('WebSocket closed');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.warn('WebSocket error (will use HTTP fallback):', error);
        // Don't reject — the demo works without WebSocket (uses HTTP polling)
        resolve();
      };
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.sessionId) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {});
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach((handler) => handler(message.payload));

    // Also handle 'activity' type from backend and map to 'agent_stage'
    if ((message.type as string) === 'activity') {
      const mapped = this.mapActivityToStageMessage(message.payload as Record<string, unknown>);
      if (!mapped) return;
      const activityHandlers = this.messageHandlers.get('agent_stage') || [];
      activityHandlers.forEach((handler) => handler(mapped));
    }
  }

  private mapActivityToStageMessage(payload: Record<string, unknown>): AgentStageMessage | null {
    const activityType = String(payload.activity_type || '');
    const content = (payload.content || {}) as Record<string, unknown>;
    const phase = String(content.phase || '');

    const stageMap: Record<string, AgentStageMessage> = {
      understand_needs: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'retrieving',
        progress: phase === 'completed' ? 26 : 14,
        message: phase === 'completed'
          ? 'Requirements parsed. Starting product search...'
          : String(content.message || 'Understanding your needs and safety constraints...'),
      },
      search_products: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'filtering',
        progress: 38,
        message: `Searching and filtering product catalog, found ${String(content.results_count || '')} candidates...`,
      },
      generate_schemes: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'inquiring',
        progress: 65,
        message: 'Evaluating seller-side options and generating suitable bundles...',
      },
      present_schemes: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'summarizing',
        progress: 92,
        message: 'Curating package comparison for final recommendation...',
      },
      negotiate_price: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'negotiating',
        progress: 80,
        message: 'Negotiating with sellers for better prices...',
      },
      confirm_order: {
        sessionId: String(payload.session_id || this.sessionId || ''),
        stage: 'completed',
        progress: 100,
        message: 'Order details prepared and ready.',
      },
    };

    return stageMap[activityType] || null;
  }

  on<T>(type: string, handler: (data: T) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }

    const handlers = this.messageHandlers.get(type)!;
    const wrappedHandler = (data: unknown) => handler(data as T);
    handlers.push(wrappedHandler);

    return () => {
      const index = handlers.indexOf(wrappedHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  onAgentStage(handler: (data: AgentStageMessage) => void): () => void {
    return this.on<AgentStageMessage>('agent_stage', handler);
  }

  onNegotiationUpdate(handler: (data: unknown) => void): () => void {
    return this.on('negotiation_update', handler);
  }

  onChatMessage(handler: (data: unknown) => void): () => void {
    return this.on('chat_message', handler);
  }

  onError(handler: (data: { message: string }) => void): () => void {
    return this.on<{ message: string }>('error', handler);
  }

  send(message: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// WebSocket 单例
let wsClientInstance: WebSocketClient | null = null;

export function getWebSocketClient(sessionId?: string): WebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new WebSocketClient(sessionId);
  }
  return wsClientInstance;
}

export function resetWebSocketClient(): void {
  if (wsClientInstance) {
    wsClientInstance.disconnect();
    wsClientInstance = null;
  }
}
