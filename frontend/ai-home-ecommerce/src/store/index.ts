import { create } from 'zustand';
import { 
  ChatMessage, 
  Scheme, 
  Order, 
  AgentStageInfo,
  OrderFormData,
  FulfillmentStatus,
  ContextPin,
  UserLongTermMemory,
  MemoryTag,
  SpaceProfile,
  ImplicitPreferencePrompt,
} from '@/types';
import { apiClient, getWebSocketClient } from '@/lib/api';

// ==================== Chat Store ====================

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  currentStage: AgentStageInfo | null;
  
  // Actions
  addMessage: (message: ChatMessage) => void;
  setSessionId: (sessionId: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setCurrentStage: (stage: AgentStageInfo | null) => void;
  sendMessage: (content: string, options?: { onToken?: (text: string) => void }) => Promise<void>;
  clearMessages: () => void;
  initializeSession: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  currentStage: null,

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  setSessionId: (sessionId) => set({ sessionId }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setCurrentStage: (stage) => set({ currentStage: stage }),

  sendMessage: async (content, options) => {
    let { sessionId } = get();
    const { messages, addMessage, setIsLoading } = get();

    // Ensure session exists before sending
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      get().setSessionId(sessionId);
    }

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      type: 'text',
    };
    addMessage(userMessage);

    setIsLoading(true);

    try {
      let streamedText = '';
      const streamResult = await apiClient.sendChatMessageStream({
        sessionId: sessionId || undefined,
        message: content,
        context: messages,
      }, {
        onStart: (data) => {
          const sid = data.session_id ? String(data.session_id) : null;
          if (sid) set({ sessionId: sid });
        },
        onToken: (data) => {
          streamedText = data.content || streamedText;
          if (data.session_id) {
            set({ sessionId: data.session_id });
          }
          options?.onToken?.(streamedText);
        },
      });

      const response = {
        success: true,
        data: streamResult,
      };

      if (response.success && response.data) {
        const data = response.data as unknown as Record<string, unknown>;

        // 更新 sessionId（后端返回 session_id，前端用 sessionId）
        const newSessionId = (data.session_id as string) || (data.sessionId as string);
        if (newSessionId) {
          set({ sessionId: newSessionId });
        }

        // 告知用户本轮已使用长期档案信息
        if (data.used_profile_context === true) {
          addMessage({
            id: `${Date.now()}-profile-hint`,
            role: 'system',
            content: 'Using your saved profile as default constraints for this recommendation.',
            timestamp: new Date().toISOString(),
            type: 'text',
          });
        }

        // 添加 AI 回复（后端返回完整 ChatMessage 对象）
        const messageData = data.message;
        if (messageData && typeof messageData === 'object') {
          addMessage(messageData as ChatMessage);
        } else if (typeof messageData === 'string') {
          // Fallback: message is a plain string
          addMessage({
            id: Date.now().toString(),
            role: 'assistant',
            content: messageData,
            timestamp: new Date().toISOString(),
            type: 'text',
          });
        } else if (streamedText) {
          addMessage({
            id: Date.now().toString(),
            role: 'assistant',
            content: streamedText,
            timestamp: new Date().toISOString(),
            type: 'text',
          });
        }

        // 如果有方案数据，存入 scheme store
        const schemes = data.schemes as unknown[];
        if (schemes && schemes.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          useSchemeStore.getState().setSchemes(schemes as any[]);
        }

        // 更新 Context Pins（需求标签组）
        const pins = data.context_pins as ContextPin[] | undefined;
        if (pins && pins.length > 0) {
          useMemoryStore.getState().setContextPins(pins);
        }

        // 隐性偏好检测提示
        const implicitPrompt = data.implicit_preference_prompt as ImplicitPreferencePrompt | undefined;
        if (implicitPrompt) {
          useMemoryStore.getState().setPendingImplicitPrompt(implicitPrompt);
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
        type: 'text',
      });
    } finally {
      setIsLoading(false);
    }
  },

  clearMessages: () => set({ messages: [], sessionId: null, currentStage: null }),

  initializeSession: () => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set({ sessionId });
    
    // 初始化 WebSocket 连接
    const wsClient = getWebSocketClient(sessionId);
    wsClient.connect().then(() => {
      console.log('WebSocket connected for session:', sessionId);
    }).catch(() => {
      // WebSocket is optional — chat works fine via HTTP API
    });
  },
}));

// ==================== Scheme Store ====================

interface SchemeState {
  schemes: Scheme[];
  selectedScheme: Scheme | null;
  isLoading: boolean;
  
  // Actions
  setSchemes: (schemes: Scheme[]) => void;
  selectScheme: (scheme: Scheme | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  fetchSchemes: (sessionId: string) => Promise<void>;
}

export const useSchemeStore = create<SchemeState>((set) => ({
  schemes: [],
  selectedScheme: null,
  isLoading: false,

  setSchemes: (schemes) => set({ schemes }),

  selectScheme: (scheme) => set({ selectedScheme: scheme }),

  setIsLoading: (isLoading) => set({ isLoading }),

  fetchSchemes: async (sessionId) => {
    set({ isLoading: true });
    try {
      const response = await apiClient.getSchemes(sessionId);
      if (response.success && response.data) {
        set({ schemes: response.data });
      }
    } catch (error) {
      console.error('Failed to fetch schemes:', error);
    } finally {
      set({ isLoading: false });
    }
  },
}));

// ==================== Order Store ====================

interface OrderState {
  currentOrder: Order | null;
  fulfillmentStatus: FulfillmentStatus[];
  isLoading: boolean;
  orderFormData: OrderFormData;
  
  // Actions
  setCurrentOrder: (order: Order | null) => void;
  setFulfillmentStatus: (status: FulfillmentStatus[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  updateOrderFormData: (data: Partial<OrderFormData>) => void;
  createOrder: (schemeId: string) => Promise<Order | null>;
  fetchOrder: (orderId: string) => Promise<void>;
  resetOrderForm: () => void;
}

const defaultOrderFormData: OrderFormData = {
  name: '',
  phone: '',
  email: '',
  address: '',
  province: '',
  city: '',
  district: '',
  remark: '',
};

export const useOrderStore = create<OrderState>((set, get) => ({
  currentOrder: null,
  fulfillmentStatus: [],
  isLoading: false,
  orderFormData: { ...defaultOrderFormData },

  setCurrentOrder: (order) => set({ currentOrder: order }),

  setFulfillmentStatus: (status) => set({ fulfillmentStatus: status }),

  setIsLoading: (isLoading) => set({ isLoading }),

  updateOrderFormData: (data) => {
    set((state) => ({
      orderFormData: { ...state.orderFormData, ...data },
    }));
  },

  createOrder: async (schemeId) => {
    const { orderFormData } = get();
    set({ isLoading: true });
    
    try {
      const response = await apiClient.createOrder({
        ...orderFormData,
        schemeId,
      });

      if (response.success && response.data) {
        set({ currentOrder: response.data });
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to create order:', error);
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchOrder: async (orderId) => {
    set({ isLoading: true });
    try {
      const [orderResponse, fulfillmentResponse] = await Promise.all([
        apiClient.getOrder(orderId),
        apiClient.getOrderFulfillment(orderId),
      ]);

      if (orderResponse.success && orderResponse.data) {
        set({ currentOrder: orderResponse.data });
      }

      if (fulfillmentResponse.success && fulfillmentResponse.data) {
        // 转换履约状态
        const statuses: FulfillmentStatus[] = fulfillmentResponse.data.map((stage) => ({
          stage: stage.stage as FulfillmentStatus['stage'],
          label: stage.label,
          description: stage.description,
          timestamp: stage.timestamp,
          completed: stage.completed,
        }));
        set({ fulfillmentStatus: statuses });
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  resetOrderForm: () => set({ orderFormData: { ...defaultOrderFormData } }),
}));

// ==================== Agent Timeline Store ====================

interface AgentTimelineState {
  stages: AgentStageInfo[];
  isActive: boolean;
  
  // Actions
  addStage: (stage: AgentStageInfo) => void;
  updateStage: (stage: AgentStageInfo) => void;
  clearStages: () => void;
  setIsActive: (isActive: boolean) => void;
  getCurrentStage: () => AgentStageInfo | null;
}

export const useAgentTimelineStore = create<AgentTimelineState>((set, get) => ({
  stages: [],
  isActive: false,

  addStage: (stage) => {
    set((state) => ({
      stages: [...state.stages, stage],
    }));
  },

  updateStage: (stage) => {
    set((state) => ({
      stages: state.stages.map((s) => 
        s.stage === stage.stage ? { ...s, ...stage } : s
      ),
    }));
  },

  clearStages: () => set({ stages: [], isActive: false }),

  setIsActive: (isActive) => set({ isActive }),

  getCurrentStage: () => {
    const { stages } = get();
    return stages.length > 0 ? stages[stages.length - 1] : null;
  },
}));

// ==================== 原有 Store（保留） ====================

// 示例：用户状态管理
interface UserState {
  user: { id: string; name: string } | null;
  isLoggedIn: boolean;
  setUser: (user: { id: string; name: string } | null) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoggedIn: false,
  setUser: (user) => set({ user, isLoggedIn: !!user }),
  logout: () => set({ user: null, isLoggedIn: false }),
}));

// 示例：购物车状态管理
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) => {
    const { items } = get();
    const existingItem = items.find((i) => i.id === item.id);
    if (existingItem) {
      set({
        items: items.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
        ),
      });
    } else {
      set({ items: [...items, item] });
    }
  },
  removeItem: (id) => {
    const { items } = get();
    set({ items: items.filter((i) => i.id !== id) });
  },
  clearCart: () => set({ items: [] }),
  totalItems: () => {
    const { items } = get();
    return items.reduce((total, item) => total + item.quantity, 0);
  },
  totalPrice: () => {
    const { items } = get();
    return items.reduce((total, item) => total + item.price * item.quantity, 0);
  },
}));

// ==================== Memory Store ====================

// 用固定 userId 模拟匿名用户（Demo用途，真实场景应从auth获取）
export const DEMO_USER_ID = 'demo_user_001';

interface MemoryState {
  // 长期记忆
  userMemory: UserLongTermMemory | null;
  isLoadingMemory: boolean;

  // 当前会话 Context Pins（短期记忆标签）
  contextPins: ContextPin[];

  // 隐性偏好待确认弹窗
  pendingImplicitPrompt: ImplicitPreferencePrompt | null;

  // Actions
  loadUserMemory: () => Promise<void>;
  addTag: (tag: MemoryTag) => Promise<void>;
  removeTag: (tagKey: string) => Promise<void>;
  confirmImplicitPreference: (prompt: ImplicitPreferencePrompt) => Promise<void>;
  dismissImplicitPrompt: () => void;
  setPendingImplicitPrompt: (prompt: ImplicitPreferencePrompt | null) => void;
  setContextPins: (pins: ContextPin[]) => void;
  removeContextPin: (sessionId: string, pinKey: string) => Promise<void>;
  upsertSpace: (space: SpaceProfile) => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  userMemory: null,
  isLoadingMemory: false,
  contextPins: [],
  pendingImplicitPrompt: null,

  loadUserMemory: async () => {
    set({ isLoadingMemory: true });
    try {
      const res = await apiClient.getUserMemory(DEMO_USER_ID);
      if (res.success && res.data) {
        set({ userMemory: res.data });
      }
    } catch (e) {
      console.warn('Failed to load user memory:', e);
    } finally {
      set({ isLoadingMemory: false });
    }
  },

  addTag: async (tag) => {
    try {
      const res = await apiClient.addMemoryTag(DEMO_USER_ID, tag);
      if (res.success && res.data) {
        set((state) => ({
          userMemory: state.userMemory
            ? { ...state.userMemory, tags: res.data.tags }
            : null,
        }));
      }
    } catch (e) {
      console.warn('Failed to add memory tag:', e);
    }
  },

  removeTag: async (tagKey) => {
    try {
      const res = await apiClient.removeMemoryTag(DEMO_USER_ID, tagKey);
      if (res.success && res.data) {
        set((state) => ({
          userMemory: state.userMemory
            ? { ...state.userMemory, tags: res.data.tags }
            : null,
        }));
      }
    } catch (e) {
      console.warn('Failed to remove memory tag:', e);
    }
  },

  confirmImplicitPreference: async (prompt) => {
    const tag: MemoryTag = {
      key: prompt.detected_key,
      label: prompt.detected_label,
      value: prompt.detected_value,
      category: prompt.category as MemoryTag['category'],
      confidence: 0.9,
      source: 'implicit',
      created_at: new Date().toISOString(),
    };
    await get().addTag(tag);
    set({ pendingImplicitPrompt: null });
  },

  dismissImplicitPrompt: () => set({ pendingImplicitPrompt: null }),

  setPendingImplicitPrompt: (prompt) => set({ pendingImplicitPrompt: prompt }),

  setContextPins: (pins) => set({ contextPins: pins }),

  removeContextPin: async (sessionId, pinKey) => {
    try {
      await apiClient.removeSessionPin(sessionId, pinKey);
    } catch (e) {
      console.warn('Failed to remove session pin:', e);
    }
    set((state) => ({
      contextPins: state.contextPins.filter((p) => p.key !== pinKey),
    }));
  },

  upsertSpace: async (space) => {
    try {
      const res = await apiClient.upsertSpace(DEMO_USER_ID, space);
      if (res.success && res.data) {
        set({ userMemory: res.data });
      }
    } catch (e) {
      console.warn('Failed to upsert space:', e);
    }
  },

  updateNickname: async (nickname) => {
    try {
      const res = await apiClient.updateUserMemory(DEMO_USER_ID, { nickname });
      if (res.success && res.data) {
        set({ userMemory: res.data });
      }
    } catch (e) {
      console.warn('Failed to update nickname:', e);
    }
  },
}));
