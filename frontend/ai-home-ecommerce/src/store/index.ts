import { create } from 'zustand';
import { 
  ChatMessage, 
  Scheme, 
  SchemeRound,
  Order, 
  AgentStageInfo,
  OrderFormData,
  FulfillmentStatus,
  ContextPin,
  UserLongTermMemory,
  MemoryTag,
  SpaceProfile,
  ImplicitPreferencePrompt,
  ProjectDesign,
  ProjectContext,
  FavoriteItem,
  SkillInvocation,
  Conversation,
} from '@/types';
import { apiClient, getWebSocketClient, resetWebSocketClient } from '@/lib/api';

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
  loadMessages: (messages: ChatMessage[]) => void;
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
    // Guard against init race: user can send before conversation bootstrap finishes.
    // In that case we create one on-demand so sidebar/history always has this chat.
    let { sessionId } = get();
    const conversationStore = useConversationStore.getState();
    if (!conversationStore.activeConversationId) {
      await conversationStore.createNewConversation();
      sessionId = get().sessionId;
    }

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

    // Persist user message to conversation
    useConversationStore.getState().persistMessage(userMessage);

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

        // 告知用户当前活跃项目
        const activeProjectName = data.active_project_name as string | undefined;
        if (activeProjectName) {
          addMessage({
            id: `${Date.now()}-project-hint`,
            role: 'system',
            content: `📂 Project: ${activeProjectName} — budget, style and room constraints applied.`,
            timestamp: new Date().toISOString(),
            type: 'text',
          });
        }

        // Skills 校验结果
        const skillWarnings = data.skill_warnings as string[] | undefined;
        if (skillWarnings && skillWarnings.length > 0) {
          addMessage({
            id: `${Date.now()}-skill-warn`,
            role: 'system',
            content: `⚠️ Skills Check: ${skillWarnings.join(' | ')}`,
            timestamp: new Date().toISOString(),
            type: 'text',
          });
        }
        const skillInvocations = data.skill_invocations as SkillInvocation[] | undefined;
        if (skillInvocations) {
          useProjectStore.getState().setLastSkillInvocations(skillInvocations);
        }

        // 添加 AI 回复（后端返回完整 ChatMessage 对象）
        const messageData = data.message;
        let assistantMsg: ChatMessage | null = null;
        if (messageData && typeof messageData === 'object') {
          assistantMsg = messageData as ChatMessage;
          addMessage(assistantMsg);
        } else if (typeof messageData === 'string') {
          // Fallback: message is a plain string
          assistantMsg = {
            id: Date.now().toString(),
            role: 'assistant',
            content: messageData,
            timestamp: new Date().toISOString(),
            type: 'text',
          };
          addMessage(assistantMsg);
        } else if (streamedText) {
          assistantMsg = {
            id: Date.now().toString(),
            role: 'assistant',
            content: streamedText,
            timestamp: new Date().toISOString(),
            type: 'text',
          };
          addMessage(assistantMsg);
        }

        // 如果有方案数据，存入 scheme store 并创建方案轮次
        const schemes = data.schemes as unknown[];
        let schemeRound: SchemeRound | null = null;
        if (schemes && schemes.length > 0) {
          const schemeArr = schemes as Scheme[];
          const schemeStore = useSchemeStore.getState();
          const roundNumber = schemeStore.schemeHistory.length + 1;

          // 从方案中提取摘要信息
          const styleSummary = schemeArr[0]?.style || 'Custom';
          const totalRange = schemeArr.length > 0
            ? `$${Math.min(...schemeArr.map(s => s.finalTotal)).toLocaleString()} - $${Math.max(...schemeArr.map(s => s.finalTotal)).toLocaleString()}`
            : '';
          const summary = `${styleSummary} | ${schemeArr.length} packages | ${totalRange}`;

          // 找到刚添加的 assistant message 的 ID
          const currentMessages = get().messages;
          const lastAssistantMsg = [...currentMessages].reverse().find(m => m.role === 'assistant');
          const messageId = lastAssistantMsg?.id || Date.now().toString();

          schemeRound = {
            id: `round_${Date.now()}_${roundNumber}`,
            roundNumber,
            schemes: schemeArr,
            timestamp: new Date().toISOString(),
            summary,
            messageId,
          };

          // 将 schemeRoundId 关联到对应的 assistant 消息
          if (lastAssistantMsg) {
            set((state) => ({
              messages: state.messages.map((msg) =>
                msg.id === lastAssistantMsg.id
                  ? { ...msg, schemeRoundId: schemeRound!.id }
                  : msg
              ),
            }));
          }

          schemeStore.addSchemeRound(schemeRound);
        }

        // Persist assistant message to conversation (include scheme data in metadata)
        if (assistantMsg) {
          const metadata: Record<string, unknown> | undefined = schemeRound
            ? { schemeRound }
            : undefined;
          useConversationStore.getState().persistMessage(assistantMsg, metadata);
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

  loadMessages: (messages) => set({ messages }),

  initializeSession: () => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set({ sessionId });
    
    // 初始化 WebSocket 连接
    resetWebSocketClient();
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

  // 方案轮次历史
  schemeHistory: SchemeRound[];
  activeRoundId: string | null;

  // Actions
  setSchemes: (schemes: Scheme[]) => void;
  selectScheme: (scheme: Scheme | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  fetchSchemes: (sessionId: string) => Promise<void>;
  addSchemeRound: (round: SchemeRound) => void;
  setActiveRound: (roundId: string) => void;
  updateRoundSchemes: (roundId: string, schemes: Scheme[]) => void;
  clearSchemeHistory: () => void;
  getActiveSchemes: () => Scheme[];
}

export const useSchemeStore = create<SchemeState>((set, get) => ({
  schemes: [],
  selectedScheme: null,
  isLoading: false,
  schemeHistory: [],
  activeRoundId: null,

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

  addSchemeRound: (round) => {
    set((state) => ({
      schemeHistory: [...state.schemeHistory, round],
      activeRoundId: round.id,
      schemes: round.schemes,
      selectedScheme: null,
    }));
  },

  setActiveRound: (roundId) => {
    const { schemeHistory } = get();
    const round = schemeHistory.find((r) => r.id === roundId);
    if (round) {
      set({
        activeRoundId: roundId,
        schemes: round.schemes,
        selectedScheme: null,
      });
    }
  },

  updateRoundSchemes: (roundId, schemes) => {
    set((state) => ({
      schemeHistory: state.schemeHistory.map((round) =>
        round.id === roundId ? { ...round, schemes } : round
      ),
      schemes: state.activeRoundId === roundId ? schemes : state.schemes,
    }));
  },

  clearSchemeHistory: () => {
    set({
      schemes: [],
      selectedScheme: null,
      schemeHistory: [],
      activeRoundId: null,
    });
  },

  getActiveSchemes: () => {
    const { activeRoundId, schemeHistory, schemes } = get();
    if (!activeRoundId) return schemes;
    const round = schemeHistory.find((r) => r.id === activeRoundId);
    return round ? round.schemes : schemes;
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

const getConversationMessagesStorageKey = (conversationId: string) =>
  `conversation_messages_${conversationId}`;

// Monotonic switch token: only latest switch request can commit UI state.
let conversationSwitchRequestSeq = 0;

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

// ==================== Project Store ====================

interface ProjectState {
  projects: ProjectDesign[];
  activeProjectId: string | null;
  activeProject: ProjectDesign | null;
  isLoading: boolean;
  lastSkillInvocations: SkillInvocation[];

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, icon?: string, context?: ProjectContext) => Promise<ProjectDesign | null>;
  updateProject: (projectId: string, patch: { name?: string; icon?: string; context?: ProjectContext }) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  addFavorite: (productId: string, productName: string, price?: number, imageUrl?: string, reason?: string) => Promise<void>;
  removeFavorite: (productId: string) => Promise<void>;
  setLastSkillInvocations: (invocations: SkillInvocation[]) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activeProject: null,
  isLoading: false,
  lastSkillInvocations: [],

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await apiClient.listProjects(DEMO_USER_ID);
      if (res.success && res.data) {
        const projects = res.data.projects || [];
        const activeId = res.data.active_project_id;
        const active = projects.find((p) => p.project_id === activeId) || null;
        set({ projects, activeProjectId: activeId, activeProject: active });
      }
    } catch (e) {
      console.warn('Failed to load projects:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (name, icon = '🏠', context) => {
    try {
      const res = await apiClient.createProject(DEMO_USER_ID, name, icon, context);
      if (res.success && res.data) {
        await get().loadProjects();
        return res.data;
      }
    } catch (e) {
      console.warn('Failed to create project:', e);
    }
    return null;
  },

  updateProject: async (projectId, patch) => {
    try {
      await apiClient.updateProject(projectId, patch);
      await get().loadProjects();
    } catch (e) {
      console.warn('Failed to update project:', e);
    }
  },

  deleteProject: async (projectId) => {
    try {
      await apiClient.deleteProject(projectId, DEMO_USER_ID);
      await get().loadProjects();
    } catch (e) {
      console.warn('Failed to delete project:', e);
    }
  },

  switchProject: async (projectId) => {
    try {
      await apiClient.setActiveProject(DEMO_USER_ID, projectId);
      const { projects } = get();
      const active = projects.find((p) => p.project_id === projectId) || null;
      set({ activeProjectId: projectId, activeProject: active });
    } catch (e) {
      console.warn('Failed to switch project:', e);
    }
  },

  addFavorite: async (productId, productName, price, imageUrl, reason) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      await apiClient.addFavorite(DEMO_USER_ID, activeProjectId, {
        product_id: productId,
        product_name: productName,
        price,
        image_url: imageUrl,
        reason,
      });
      await get().loadProjects();
    } catch (e) {
      console.warn('Failed to add favorite:', e);
    }
  },

  removeFavorite: async (productId) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    try {
      await apiClient.removeFavorite(DEMO_USER_ID, activeProjectId, productId);
      await get().loadProjects();
    } catch (e) {
      console.warn('Failed to remove favorite:', e);
    }
  },

  setLastSkillInvocations: (invocations) => set({ lastSkillInvocations: invocations }),
}));

// ==================== Conversation Store ====================

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  sidebarOpen: boolean;

  // Actions
  loadConversations: () => Promise<void>;
  createNewConversation: () => Promise<void>;
  switchConversation: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  persistMessage: (message: ChatMessage, metadata?: Record<string, unknown>) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  initFromLocalStorage: () => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoading: false,
  sidebarOpen: true,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  loadConversations: async () => {
    set({ isLoading: true });
    try {
      const res = await apiClient.listConversations(DEMO_USER_ID);
      if (res.success && res.data) {
        set({ conversations: res.data.conversations || [] });
      }
    } catch (e) {
      console.warn('Failed to load conversations:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  createNewConversation: async () => {
    try {
      const res = await apiClient.createConversation(DEMO_USER_ID);
      if (res.success && res.data) {
        const { conversation_id, session_id, title, created_at } = res.data;
        const newConv: Conversation = {
          conversation_id,
          user_id: DEMO_USER_ID,
          title,
          session_id,
          created_at,
          updated_at: created_at,
        };

        set((s) => ({
          conversations: [newConv, ...s.conversations],
          activeConversationId: conversation_id,
        }));

        // Reset chat state for new conversation
        useChatStore.getState().clearMessages();
        useChatStore.getState().setSessionId(session_id);
        useSchemeStore.getState().clearSchemeHistory();
        useAgentTimelineStore.getState().clearStages();
        useMemoryStore.getState().setContextPins([]);

        // Reconnect WebSocket for new session
        resetWebSocketClient();
        const wsClient = getWebSocketClient(session_id);
        wsClient.connect().catch(() => {});

        // Persist to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('activeConversationId', conversation_id);
        }
      }
    } catch (e) {
      console.warn('Failed to create conversation:', e);
    }
  },

  switchConversation: async (conversationId) => {
    const { activeConversationId } = get();
    if (conversationId === activeConversationId) return;

    const requestSeq = ++conversationSwitchRequestSeq;

    set({ isLoading: true });
    try {
      const target = get().conversations.find((c) => c.conversation_id === conversationId);
      if (!target) return;

      // Optimistic switch so sidebar click always appears responsive.
      set({ activeConversationId: conversationId });
      useChatStore.getState().clearMessages();
      useChatStore.getState().setSessionId(target.session_id);
      useSchemeStore.getState().clearSchemeHistory();
      useAgentTimelineStore.getState().clearStages();
      useMemoryStore.getState().setContextPins([]);

      // Reconnect WebSocket immediately for the target session.
      resetWebSocketClient();
      const wsClient = getWebSocketClient(target.session_id);
      wsClient.connect().catch(() => {});

      if (typeof window !== 'undefined') {
        localStorage.setItem('activeConversationId', conversationId);
      }

      // Primary source: persisted conversation messages table.
      let chatMessages: ChatMessage[] = [];
      const convRes = await apiClient.getConversation(conversationId);
      if (convRes.success && convRes.data) {
        chatMessages = (convRes.data.messages || []).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          type: (m.type || 'text') as ChatMessage['type'],
          timestamp: m.timestamp || new Date().toISOString(),
        }));

        if (typeof window !== 'undefined' && chatMessages.length > 0) {
          try {
            localStorage.setItem(
              getConversationMessagesStorageKey(conversationId),
              JSON.stringify(chatMessages.slice(-300))
            );
          } catch {
            // Ignore local cache failures.
          }
        }
      }

      // Fallback source: in-memory chat history from /api/chat/history.
      if (chatMessages.length === 0 && target.session_id) {
        const historyRes = await apiClient.getChatHistory(target.session_id);
        if (historyRes.success && historyRes.data) {
          chatMessages = (historyRes.data.messages || []).map((raw, idx) => {
            const m = raw as Record<string, unknown>;
            return {
              id: m.id ? String(m.id) : `${target.session_id}-${idx}`,
              role: (m.role ? String(m.role) : 'assistant') as 'user' | 'assistant' | 'system',
              content: m.content ? String(m.content) : '',
              type: (m.type ? String(m.type) : 'text') as ChatMessage['type'],
              timestamp: m.timestamp ? String(m.timestamp) : new Date().toISOString(),
            };
          });
        }
      }

      // Last fallback: browser-local cache, used when backend history is empty.
      if (chatMessages.length === 0 && typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(getConversationMessagesStorageKey(conversationId));
          if (raw) {
            const parsed = JSON.parse(raw) as ChatMessage[];
            if (Array.isArray(parsed)) {
              chatMessages = parsed;
            }
          }
        } catch {
          // Ignore cache parse errors and continue with empty list.
        }
      }

      // Ignore stale request results when user already switched again.
      if (
        requestSeq !== conversationSwitchRequestSeq ||
        get().activeConversationId !== conversationId
      ) {
        return;
      }

      useChatStore.getState().loadMessages(chatMessages);

      // Rebuild scheme rounds from message metadata so right panel shows
      // the same plans that were generated in the original conversation.
      const schemeStore = useSchemeStore.getState();
      let roundIdx = 0;
      const messageIdToRoundId: Record<string, string> = {};
      if (convRes?.success && convRes.data?.messages) {
        for (const m of convRes.data.messages) {
          const meta = (m.metadata || {}) as Record<string, unknown>;
          const savedRound = meta.schemeRound as Record<string, unknown> | undefined;
          if (savedRound && savedRound.schemes) {
            roundIdx++;
            const roundId = String(savedRound.id || `round_restored_${roundIdx}`);
            const round: SchemeRound = {
              id: roundId,
              roundNumber: (savedRound.roundNumber as number) || roundIdx,
              schemes: savedRound.schemes as Scheme[],
              timestamp: String(savedRound.timestamp || m.timestamp || new Date().toISOString()),
              summary: String(savedRound.summary || ''),
              messageId: m.id,
            };
            schemeStore.addSchemeRound(round);
            messageIdToRoundId[m.id] = roundId;
          }
        }
      }

      // Link messages to their scheme rounds so inline scheme cards appear.
      if (Object.keys(messageIdToRoundId).length > 0) {
        const linked = chatMessages.map((msg) =>
          messageIdToRoundId[msg.id]
            ? { ...msg, schemeRoundId: messageIdToRoundId[msg.id] }
            : msg
        );
        useChatStore.getState().loadMessages(linked);
      }
    } catch (e) {
      console.warn('Failed to switch conversation:', e);
    } finally {
      if (requestSeq === conversationSwitchRequestSeq) {
        set({ isLoading: false });
      }
    }
  },

  renameConversation: async (conversationId, title) => {
    try {
      await apiClient.renameConversation(conversationId, title);
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.conversation_id === conversationId ? { ...c, title } : c
        ),
      }));
    } catch (e) {
      console.warn('Failed to rename conversation:', e);
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      await apiClient.deleteConversation(conversationId);
      const { conversations, activeConversationId } = get();
      const remaining = conversations.filter((c) => c.conversation_id !== conversationId);
      set({ conversations: remaining });

      // If deleted the active one, switch to next or create new
      if (conversationId === activeConversationId) {
        if (remaining.length > 0) {
          await get().switchConversation(remaining[0].conversation_id);
        } else {
          await get().createNewConversation();
        }
      }
    } catch (e) {
      console.warn('Failed to delete conversation:', e);
    }
  },

  persistMessage: (message, metadata) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) return;
    const nowIso = new Date().toISOString();

    // Save message to backend (fire-and-forget)
    apiClient.saveMessage(activeConversationId, {
      message_id: message.id,
      role: message.role,
      content: message.content,
      message_type: message.type || 'text',
      metadata: metadata,
    }).catch(() => {});

    // Save to browser-local cache as a resilient fallback for history restore.
    if (typeof window !== 'undefined') {
      try {
        const key = getConversationMessagesStorageKey(activeConversationId);
        const raw = localStorage.getItem(key);
        const cached = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
        const next = Array.isArray(cached) ? [...cached, message] : [message];
        // Prevent unbounded growth in local cache.
        const trimmed = next.slice(-300);
        localStorage.setItem(key, JSON.stringify(trimmed));
      } catch {
        // Ignore local cache failures.
      }
    }

    // Keep current conversation fresh and pinned near top.
    set((s) => {
      const next = s.conversations.map((c) =>
        c.conversation_id === activeConversationId ? { ...c, updated_at: nowIso } : c
      );
      next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return { conversations: next };
    });

    // Auto-generate title from first user message
    const conv = conversations.find((c) => c.conversation_id === activeConversationId);
    if (conv && conv.title === 'New Chat' && message.role === 'user') {
      apiClient.generateConversationTitle(activeConversationId, message.content)
        .then((res) => {
          if (res.success && res.data?.title) {
            set((s) => ({
              conversations: s.conversations.map((c) =>
                c.conversation_id === activeConversationId
                  ? { ...c, title: res.data.title, updated_at: new Date().toISOString() }
                  : c
              ),
            }));
          }
        })
        .catch(() => {});
    }
  },

  initFromLocalStorage: async () => {
    // Load conversation list first
    await get().loadConversations();
    const { conversations } = get();

    // Try to restore from localStorage
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('activeConversationId') : null;

    if (savedId && conversations.some((c) => c.conversation_id === savedId)) {
      await get().switchConversation(savedId);
    } else if (conversations.length > 0) {
      // Resume last conversation
      await get().switchConversation(conversations[0].conversation_id);
    } else {
      // First visit — create a new conversation
      await get().createNewConversation();
    }
  },
}));
