'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Lora, Plus_Jakarta_Sans } from 'next/font/google';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Sparkles,
  User,
  Bot,
  Loader2,
  Check,
  ArrowRight,
  Package,
  TrendingDown,
  RefreshCw,
  Home,
  ShoppingBag,
  Store,
  CircleUserRound,
  MessageCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AgentTimeline } from '@/components/AgentTimeline';
import { ProductCard } from '@/components/ProductCard';
import { SchemeCard } from '@/components/SchemeCard';
import { NegotiationDialog } from '@/components/NegotiationDialog';
import { PriceDisplay } from '@/components/PriceDisplay';
import { ChatTypingIndicator } from '@/components/LoadingSpinner';
import { ContextPins } from '@/components/ContextPins';
import { ImplicitPreferenceCard } from '@/components/ImplicitPreferenceCard';
import { SkillResultsBadge } from '@/components/SkillResultsBadge';
import { ChatSidebar } from '@/components/ChatSidebar';
import { useChatStore, useAgentTimelineStore, useSchemeStore, useOrderStore, useMemoryStore, useProjectStore, useConversationStore } from '@/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { ChatMessage, Scheme, SchemeRound, NegotiationRecord } from '@/types';
import { API_BASE_URL } from '@/lib/api';
import { enrichSchemesWithResolvedImages } from '@/lib/scheme-image-resolver';

// ─── types ────────────────────────────────────────────────────────────────────

// ─── helpers ──────────────────────────────────────────────────────────────────

// ─── quick prompts ────────────────────────────────────────────────────────────

const categoryQuickPrompts: Record<string, string[]> = {
  'Home & Furniture': [
    'Grey modular sofa under $900',
    'Bedside lamp with warm light',
    'Mid-century coffee table',
    'King bed frame, solid wood',
  ],
  Fashion: [
    'Neutral trench coat under $180',
    'White sneakers for daily commute',
    'Minimal leather tote for office',
    'Breathable running outfit set',
  ],
  Electronics: [
    'Noise-canceling earbuds under $120',
    '27-inch 4K monitor for Mac',
    'Robot vacuum for pet hair',
    'Compact projector for bedroom',
  ],
  Beauty: [
    'Gentle skincare set for dry skin',
    'Hair dryer with low heat damage',
    'Everyday makeup starter kit',
    'Fragrance under $80 with warm notes',
  ],
  Kitchen: [
    'Air fryer under $120',
    'Stainless cookware set for induction',
    'Compact espresso machine',
    'Meal prep containers set',
  ],
  Gaming: [
    'Mechanical keyboard for FPS',
    'Gaming chair under $250',
    '144Hz monitor for PS5',
    'Low-latency wireless headset',
  ],
};

const promptChips = ['Home & Furniture', 'Best Price', 'Fast Shipping'];

const categoryPills = [
  { label: 'Home & Furniture', state: 'live' },
  { label: 'Fashion', state: 'soon' },
  { label: 'Electronics', state: 'soon' },
  { label: 'Beauty', state: 'soon' },
  { label: 'Kitchen', state: 'soon' },
  { label: 'Gaming', state: 'later' },
] as const;

const categoryInputSeeds: Record<string, string> = {
  'Home & Furniture': 'Help me find home furniture with good value and delivery options.',
  Fashion: 'I am shopping for fashion items with comfort and style in mind.',
  Electronics: 'Recommend reliable electronics with strong value for money.',
  Beauty: 'Help me choose beauty products with safe ingredients and good reviews.',
  Kitchen: 'I need practical kitchen products with durable quality.',
  Gaming: 'Recommend gaming gear with great performance and low latency.',
};

const SUMMARIZING_STATUS_ROTATION = [
  'Compiling 3 curated packages with negotiated prices...',
  'Finalizing package comparisons and trade-offs...',
  'Optimizing value picks based on your safety and eco needs...',
];

const RIGHT_PANEL_WIDTH_STORAGE_KEY = 'chat_right_panel_width';
const CHAT_PREFERENCE_STORAGE_PREFIX = 'chat_preferences';
const CHAT_PREFERENCE_DRAFT_KEY = `${CHAT_PREFERENCE_STORAGE_PREFIX}:draft`;

interface ScenarioQuickAction {
  id: string;
  label: string;
  route: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
}

const SCENARIO_QUICK_ACTIONS: ScenarioQuickAction[] = [
  {
    id: 'go-home',
    label: 'Home',
    route: '/',
    description: 'Back to homepage',
    icon: Home,
    keywords: ['home', 'homepage', '首页', '回到首页'],
  },
  {
    id: 'go-plaza',
    label: 'Plaza',
    route: '/plaza',
    description: 'Browse products',
    icon: ShoppingBag,
    keywords: ['plaza', 'browse', 'discover', '逛', '广场', '看看商品', '商品'],
  },
  {
    id: 'go-seller',
    label: 'Seller Workspace',
    route: '/seller',
    description: 'Manage seller tasks',
    icon: Store,
    keywords: ['seller', 'workspace', '店铺', '卖家', '商家', '工作台'],
  },
  {
    id: 'go-order',
    label: 'My Order',
    route: '/order',
    description: 'Check order status',
    icon: Package,
    keywords: ['order', 'shipping', 'delivery', '物流', '订单', '到哪', '跟踪', 'track'],
  },
  {
    id: 'go-profile',
    label: 'My Profile',
    route: '/profile',
    description: 'View my profile',
    icon: CircleUserRound,
    keywords: ['profile', 'account', 'preference', '个人', '账号', '偏好', '资料'],
  },
];

function getPreferenceStorageKey(conversationId: string | null) {
  return conversationId
    ? `${CHAT_PREFERENCE_STORAGE_PREFIX}:${conversationId}`
    : CHAT_PREFERENCE_DRAFT_KEY;
}

const lora = Lora({ subsets: ['latin'], weight: ['400', '500'] });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600'] });

function TypewriterText({ text, enabled }: { text: string; enabled: boolean }) {
  const [displayed, setDisplayed] = useState(enabled ? '' : text);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      return;
    }

    let index = 0;
    setDisplayed('');
    const timer = setInterval(() => {
      index = Math.min(text.length, index + 2);
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(timer);
      }
    }, 18);

    return () => clearInterval(timer);
  }, [text, enabled]);

  return <p className="text-sm leading-relaxed text-[#18170f]">{displayed}</p>;
}

function detectScenarioIntents(content: string, userContext?: string): ScenarioQuickAction[] {
  const source = `${content} ${userContext ?? ''}`.toLowerCase();
  const matched: ScenarioQuickAction[] = [];

  for (const action of SCENARIO_QUICK_ACTIONS) {
    const hit = action.keywords.some((kw) => source.includes(kw.toLowerCase()));
    if (hit) {
      matched.push(action);
    }
  }

  // Keep results concise and actionable.
  return matched.slice(0, 3);
}

// ─── sub-components ───────────────────────────────────────────────────────────

// 方案轮次卡片（嵌入在聊天流中）
function SchemeRoundCard({
  round,
  isActive,
  onClick,
}: {
  round: SchemeRound;
  isActive: boolean;
  onClick: () => void;
}) {
  const totalSavings = round.schemes.reduce((s, sc) => s + sc.totalDiscount, 0);
  const generatedTime = new Date(round.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'mt-2 w-full rounded-xl border px-4 py-3 text-left transition-all',
        isActive
          ? 'border-[#a5b4fc] bg-[#eef2ff] ring-2 ring-[#4f46e5]/20 shadow-md'
          : 'border-[#e6e0d8] bg-white hover:border-[#a5b4fc] hover:bg-[#f5f3ef] shadow-sm',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold',
            isActive
              ? 'bg-[#4f46e5] text-white'
              : 'bg-[#f5f3ef] text-[#6e6b62]',
          )}>
            v{round.roundNumber}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#18170f]">
              Scheme v{round.roundNumber}
            </p>
            <p className="text-xs text-[#6e6b62] mt-0.5 line-clamp-1">
              {round.summary}
            </p>
            <p className="text-[11px] text-[#afa9a0] mt-0.5">
              Generated at {generatedTime}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalSavings > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#4f46e5]">
              <TrendingDown className="h-3 w-3" />
              -${totalSavings.toLocaleString()}
            </span>
          )}
          <ArrowRight className={cn(
            'h-4 w-4 transition-colors',
            isActive ? 'text-[#4f46e5]' : 'text-[#afa9a0]',
          )} />
        </div>
      </div>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-1.5 flex items-center gap-1 text-xs text-[#4f46e5] font-medium"
        >
          <Check className="h-3 w-3" />
          Currently viewing
        </motion.div>
      )}
    </motion.button>
  );
}

function MessageBubble({
  message,
  schemeRound,
  activeRoundId,
  onSwitchRound,
  intentActions,
  onIntentAction,
}: {
  message: ChatMessage;
  schemeRound?: SchemeRound;
  activeRoundId: string | null;
  onSwitchRound: (roundId: string) => void;
  intentActions?: ScenarioQuickAction[];
  onIntentAction?: (action: ScenarioQuickAction) => void;
}) {
  const isUser = message.role === 'user';
  const enableTypewriter = message.role === 'assistant' && message.type !== 'loading';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        isUser
          ? 'bg-[#ede9e2] text-[#6e6b62]'
          : 'bg-[#6366f1] text-white',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('flex max-w-[80%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'rounded-2xl px-4 py-2.5',
          isUser
            ? 'border border-[#c7d2fe] bg-[#e9e7ff] text-[#312e81]'
            : 'bg-white shadow-sm border border-[#e6e0d8] text-[#18170f]',
        )}>
          <TypewriterText text={message.content} enabled={enableTypewriter} />
        </div>

        {message.products && message.products.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {message.products.map((product) => (
              <ProductCard key={product.id} product={product} variant="compact" />
            ))}
          </div>
        )}

        {/* 方案轮次卡片 — 当该消息关联了某一轮方案时展示 */}
        {schemeRound && (
          <SchemeRoundCard
            round={schemeRound}
            isActive={activeRoundId === schemeRound.id}
            onClick={() => onSwitchRound(schemeRound.id)}
          />
        )}

        {!!intentActions?.length && onIntentAction && (
          <div className="mt-2 flex flex-wrap gap-2">
            {intentActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={`${message.id}-${action.id}`}
                  onClick={() => onIntentAction(action)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#a5b4fc] bg-[#eef2ff] px-3 py-1.5 text-xs font-medium text-[#3730a3] transition-colors hover:border-[#4f46e5] hover:bg-[#e0e7ff]"
                  title={action.description}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}

        <span className="mt-1 text-xs text-[#afa9a0]">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </motion.div>
  );
}

function WelcomeMessage({ nickname, visitCount }: { nickname?: string; visitCount?: number }) {
  const isReturn = visitCount && visitCount > 1;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-10 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4f46e5] shadow-lg shadow-[#4f46e5]/25">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      {isReturn ? (
        <>
          <h2 className={cn('mt-5 text-xl text-[#18170f]', lora.className)}>
            Welcome back{nickname ? `, ${nickname}` : ''}! 👋
          </h2>
          <p className="mt-2 max-w-sm text-sm text-[#6e6b62]">
            Your AI home assistant remembers your preferences. Tell me what you&apos;re looking for today.
          </p>
        </>
      ) : (
        <>
          <h2 className={cn('mt-5 text-xl text-[#18170f]', lora.className)}>
            I&apos;m Your AI Home Furnishing Assistant
          </h2>
          <p className="mt-2 max-w-sm text-sm text-[#6e6b62]">
            Tell me what you need — I&apos;ll search, negotiate prices, and build curated packages for you.
          </p>
        </>
      )}
    </motion.div>
  );
}

function ScenarioQuickJumpBar({
  actions,
  onAction,
}: {
  actions: ScenarioQuickAction[];
  onAction: (action: ScenarioQuickAction) => void;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#8f897f]">
        <MessageCircle className="h-3 w-3" />
        Quick Navigate
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#ddd6cc] bg-[#f5f3ef] px-3 py-1.5 text-xs font-medium text-[#6e6b62] transition-colors hover:border-[#a5b4fc] hover:bg-[#eef2ff] hover:text-[#3730a3]"
              title={action.description}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── packages panel ───────────────────────────────────────────────────────────

interface PackagesPanelProps {
  schemes: Scheme[];
  onViewNegotiation: (scheme: Scheme) => void;
  onConfirmOrder: (scheme: Scheme) => void;
  selectedSchemeId: string | null;
  onSelectScheme: (scheme: Scheme) => void;
  onRefresh: () => void | Promise<void>;
  activeRound?: SchemeRound | null;
  totalRounds: number;
  isLoading: boolean;
}

function PackagesPanel({
  schemes,
  onViewNegotiation,
  onConfirmOrder,
  selectedSchemeId,
  onSelectScheme,
  onRefresh,
  activeRound,
  totalRounds,
  isLoading,
}: PackagesPanelProps) {
  const totalSavings = schemes.reduce((s, sc) => s + sc.totalDiscount, 0);
  const selectedScheme = schemes.find((s) => s.id === selectedSchemeId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e6e0d8] bg-white px-5 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#18170f]">
            <Package className="h-4 w-4 text-[#4f46e5]" />
            AI-Curated Packages
            <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#3730a3]">
              {schemes.length}
            </span>
            {activeRound && totalRounds > 1 && (
              <span className="rounded-full bg-[#f5f3ef] px-2 py-0.5 text-xs font-medium text-[#6e6b62]">
                v{activeRound.roundNumber} / {totalRounds}
              </span>
            )}
          </h3>
          {totalSavings > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[#4f46e5]">
              <TrendingDown className="h-3 w-3" />
              AI negotiated total savings of ${totalSavings.toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={cn(
            'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors',
            isLoading
              ? 'cursor-not-allowed text-[#c6c0b8]'
              : 'text-[#6e6b62] hover:bg-[#f5f3ef] hover:text-[#18170f]'
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading ? 'animate-spin' : '')} />
          {isLoading ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      {/* Scheme cards */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {schemes.map((scheme) => (
          <SchemeCard
            key={scheme.id}
            scheme={scheme}
            isSelected={selectedSchemeId === scheme.id}
            onSelect={() => onSelectScheme(scheme)}
            onViewNegotiation={() => onViewNegotiation(scheme)}
          />
        ))}
      </div>

      {/* Confirm bar */}
      <AnimatePresence>
        {selectedScheme && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="shrink-0 border-t border-[#e6e0d8] bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-[#18170f]">
                  <Check className="h-3.5 w-3.5 text-[#4f46e5]" />
                  {selectedScheme.name}
                </p>
                <PriceDisplay
                  price={selectedScheme.finalTotal}
                  originalPrice={selectedScheme.originalTotal}
                  size="sm"
                />
              </div>
              <button
                onClick={() => onConfirmOrder(selectedScheme)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4f46e5] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4f46e5]/25 transition-all hover:scale-105 hover:bg-[#6366f1]"
              >
                Confirm Order
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const summarizingPulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const isVerticalResizingRef = useRef(false);
  const isHorizontalResizingRef = useRef(false);
  const [topPanelRatio, setTopPanelRatio] = useState(42);
  const [rightPanelWidth, setRightPanelWidth] = useState(560);
  const [streamingPreview, setStreamingPreview] = useState('');
  const [activePromptChips, setActivePromptChips] = useState<string[]>(['Home & Furniture']);
  const [activeCategory, setActiveCategory] = useState<string>('Home & Furniture');

  // negotiation dialog
  const [negRecord, setNegRecord] = useState<NegotiationRecord | null>(null);
  const [negOpen, setNegOpen] = useState(false);

  // selected scheme
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const { messages, isLoading, sendMessage, sessionId } = useChatStore();
  const { stages, isActive, setIsActive, addStage, updateStage, clearStages } = useAgentTimelineStore();
  const {
    schemes,
    setSchemes,
    selectScheme,
    schemeHistory,
    activeRoundId,
    setActiveRound,
    updateRoundSchemes,
  } = useSchemeStore();
  const { setCurrentOrder } = useOrderStore();
  const {
    contextPins,
    pendingImplicitPrompt,
    userMemory,
    loadUserMemory,
    removeContextPin,
    confirmImplicitPreference,
    dismissImplicitPrompt,
  } = useMemoryStore();

  const { lastSkillInvocations } = useProjectStore();

  const { initFromLocalStorage, sidebarOpen, activeConversationId } = useConversationStore();

  const hasSchemes = schemes.length > 0;
  const latestStage = stages.length > 0 ? stages[stages.length - 1] : null;
  const isHeroMode = messages.length === 0 && !isLoading && !hasSchemes;
  const quickPrompts = categoryQuickPrompts[activeCategory] ?? categoryQuickPrompts['Home & Furniture'];
  const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user') ?? null;
  const lastAssistantMessage = [...messages].reverse().find((msg) => msg.role === 'assistant') ?? null;
  const lastAssistantIntentActions = lastAssistantMessage
    ? detectScenarioIntents(lastAssistantMessage.content, lastUserMessage?.content)
    : [];

  // WebSocket (optional)
  useWebSocket(sessionId, {
    onAgentStage: (data) => {
      addStage({ stage: data.stage, label: data.stage, description: data.message, progress: data.progress, timestamp: new Date().toISOString() });
      setIsActive(data.stage !== 'completed');
    },
  });

  // init session from saved conversations + load memory + load projects
  useEffect(() => {
    initFromLocalStorage();
    loadUserMemory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getPreferenceStorageKey(activeConversationId);
    const raw = localStorage.getItem(key);

    if (!raw) {
      setActiveCategory('Home & Furniture');
      setActivePromptChips(['Home & Furniture']);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { activeCategory?: string; activePromptChips?: string[] };
      const category = parsed.activeCategory || 'Home & Furniture';
      const chips = Array.isArray(parsed.activePromptChips) ? parsed.activePromptChips : ['Home & Furniture'];
      setActiveCategory(category);
      setActivePromptChips(chips);
    } catch {
      setActiveCategory('Home & Furniture');
      setActivePromptChips(['Home & Furniture']);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getPreferenceStorageKey(activeConversationId);
    localStorage.setItem(key, JSON.stringify({ activeCategory, activePromptChips }));
  }, [activeConversationId, activeCategory, activePromptChips]);

  // Restore persisted right panel width (and re-clamp when sidebar visibility changes).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    if (!raw) return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;

    const sidebarOffset = sidebarOpen ? 280 : 0;
    const maxWidth = Math.max(420, window.innerWidth - sidebarOffset - 420);
    const clamped = Math.min(maxWidth, Math.max(420, parsed));
    setRightPanelWidth(clamped);
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(Math.round(rightPanelWidth)));
  }, [rightPanelWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      const sidebarOffset = sidebarOpen ? 280 : 0;
      const maxWidth = Math.max(420, window.innerWidth - sidebarOffset - 420);
      setRightPanelWidth((prev) => Math.min(maxWidth, Math.max(420, prev)));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [sidebarOpen]);

  // auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // enrich images when schemes arrive (also update scheme history round)
  useEffect(() => {
    if (schemes.length === 0) return;
    const needsImages = schemes.some(
      (s) => s.products.some((p) => !p.product.images?.length || !p.product.images[0])
    );
    if (!needsImages) return;
    void enrichSchemesWithResolvedImages(schemes, API_BASE_URL)
      .then((enriched) => {
        if (enriched === schemes) return;
        setSchemes(enriched);
        // 同步更新 schemeHistory 中对应轮次的 schemes（不可变）
        if (activeRoundId) {
          updateRoundSchemes(activeRoundId, enriched);
        }
      })
      .catch(() => {});
  }, [schemes, activeRoundId, setSchemes, updateRoundSchemes]);

  const clearStreamingPreview = useCallback(() => {
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setStreamingPreview('');
  }, []);

  const buildThinkingScript = useCallback((prompt: string) => {
    return [
      'Understanding your request and constraints... ',
      `Requirement captured: "${prompt}". `,
      'Prioritizing child safety, rounded edges, anti-tip stability, and low-VOC finishes... ',
      'Filtering kid-friendly bedroom products by eco materials and durability... ',
      'Preparing suitable bundles and value options for comparison... ',
    ].join('');
  }, []);

  const startStreamingPreview = useCallback((prompt: string) => {
    clearStreamingPreview();
    const script = buildThinkingScript(prompt);
    let index = 0;

    streamTimerRef.current = setInterval(() => {
      if (index >= script.length) {
        return;
      }
      const step = script[index] === ' ' ? 1 : 2;
      index = Math.min(script.length, index + step);
      setStreamingPreview(script.slice(0, index));
    }, 28);
  }, [buildThinkingScript, clearStreamingPreview]);

  useEffect(() => {
    if (!(isLoading && latestStage?.stage === 'summarizing')) {
      if (summarizingPulseTimerRef.current) {
        clearInterval(summarizingPulseTimerRef.current);
        summarizingPulseTimerRef.current = null;
      }
      return;
    }

    let tick = 0;
    summarizingPulseTimerRef.current = setInterval(() => {
      const current = useAgentTimelineStore
        .getState()
        .stages
        .find((s) => s.stage === 'summarizing');
      const nextProgress = Math.min(99, (current?.progress ?? 95) + 1);
      const nextText = SUMMARIZING_STATUS_ROTATION[tick % SUMMARIZING_STATUS_ROTATION.length];
      tick += 1;
      updateStage({
        stage: 'summarizing',
        label: 'summarizing',
        description: nextText,
        progress: nextProgress,
        timestamp: new Date().toISOString(),
      });
    }, 900);

    return () => {
      if (summarizingPulseTimerRef.current) {
        clearInterval(summarizingPulseTimerRef.current);
        summarizingPulseTimerRef.current = null;
      }
    };
  }, [isLoading, latestStage?.stage, updateStage]);

  useEffect(() => () => clearStreamingPreview(), [clearStreamingPreview]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isVerticalResizingRef.current && rightPanelRef.current) {
        const rect = rightPanelRef.current.getBoundingClientRect();
        const nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
        const clampedRatio = Math.min(72, Math.max(28, nextRatio));
        setTopPanelRatio(clampedRatio);
      }

      if (isHorizontalResizingRef.current) {
        const sidebarOffset = sidebarOpen ? 280 : 0;
        const maxWidth = Math.max(420, window.innerWidth - sidebarOffset - 420);
        const minWidth = 420;
        const nextWidth = window.innerWidth - e.clientX;
        const clampedWidth = Math.min(maxWidth, Math.max(minWidth, nextWidth));
        setRightPanelWidth(clampedWidth);
      }
    };

    const handleMouseUp = () => {
      isVerticalResizingRef.current = false;
      isHorizontalResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sidebarOpen]);

  // 切换方案轮次时，清空右侧当前选中的 package，避免跨轮次残留选中态
  useEffect(() => {
    setSelectedSchemeId(null);
  }, [activeRoundId]);

  // send message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue.trim();
    const preferencePayload = buildBackendPreferencePayload();
    setInputValue('');

    setIsActive(true);
    clearStages();
    addStage({
      stage: 'retrieving',
      label: 'retrieving',
      description: 'Understanding your requirements and preparing product search...',
      progress: 10,
      timestamp: new Date().toISOString(),
    });
    startStreamingPreview(message);

    try {
      await sendMessage(message, {
        requestPreferences: preferencePayload,
        onToken: (text) => {
          setStreamingPreview(text);
        },
      });
      const { schemes: storeSchemes } = useSchemeStore.getState();
      const hasCompletedStage = useAgentTimelineStore
        .getState()
        .stages
        .some((s) => s.stage === 'completed');

      if (storeSchemes.length > 0) {
        if (!hasCompletedStage) {
          addStage({
            stage: 'completed',
            label: 'Completed',
            description: `Generated ${storeSchemes.length} curated packages — review them on the right.`,
            progress: 100,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (!hasCompletedStage) {
        addStage({
          stage: 'completed',
          label: 'Completed',
          description: 'Response is ready. You can continue refining your request.',
          progress: 100,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      clearStreamingPreview();
      setIsActive(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const buildPreferenceSuffix = useCallback(() => {
    const parts: string[] = [];
    if (activePromptChips.includes('Best Price')) {
      parts.push('Prioritize the best total price.');
    }
    if (activePromptChips.includes('Fast Shipping')) {
      parts.push('Prefer faster shipping options.');
    }
    if (activePromptChips.includes('Home & Furniture')) {
      parts.push('Focus on home and furniture products.');
    }
    return parts.join(' ');
  }, [activePromptChips]);

  const buildBackendPreferencePayload = useCallback(() => {
    return {
      category: activeCategory,
      active_filters: activePromptChips,
      objectives: {
        best_price: activePromptChips.includes('Best Price'),
        fast_shipping: activePromptChips.includes('Fast Shipping'),
        home_furniture_focus: activePromptChips.includes('Home & Furniture'),
      },
    };
  }, [activeCategory, activePromptChips]);

  const applyPrompt = (prompt: string) => {
    const suffix = buildPreferenceSuffix();
    setInputValue(suffix ? `${prompt}. ${suffix}` : prompt);
    inputRef.current?.focus();
  };

  const togglePromptChip = (chip: string) => {
    setActivePromptChips((prev) => {
      if (prev.includes(chip)) {
        return prev.filter((c) => c !== chip);
      }
      return [...prev, chip];
    });
  };

  const handleCategorySelect = (label: string) => {
    setActiveCategory(label);

    if (label === 'Home & Furniture') {
      setActivePromptChips((prev) => prev.includes('Home & Furniture') ? prev : [...prev, 'Home & Furniture']);
    } else {
      setActivePromptChips((prev) => prev.filter((chip) => chip !== 'Home & Furniture'));
    }

    setInputValue((prev) => {
      if (prev.trim().length > 0) return prev;
      const seed = categoryInputSeeds[label] ?? prev;
      const suffix = buildPreferenceSuffix();
      return suffix ? `${seed} ${suffix}` : seed;
    });
    inputRef.current?.focus();
  };

  const handleViewNegotiation = (scheme: Scheme) => {
    const p = scheme.products.find((p) => p.negotiationRecord);
    if (p?.negotiationRecord) { setNegRecord(p.negotiationRecord); setNegOpen(true); }
  };

  const handleSelectScheme = (scheme: Scheme) => {
    setSelectedSchemeId(scheme.id);
    selectScheme(scheme);
  };

  const handleConfirmOrder = (scheme: Scheme) => {
    setCurrentOrder({
      id: `order-${Date.now()}`,
      userId: 'user-1',
      items: scheme.products.map((p) => ({
        productId: p.product.id,
        productName: p.product.name,
        productImage: p.product.images[0] || '',
        price: p.finalPrice,
        quantity: p.quantity,
      })),
      status: 'pending' as const,
      totalAmount: scheme.finalTotal,
      shippingAddress: { id: 'addr-1', name: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: true },
      paymentMethod: 'card',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    router.push('/order');
  };

  const handleScenarioNavigate = (action: ScenarioQuickAction) => {
    router.push(action.route);
  };

  const handleRefresh = async () => {
    if (isLoading) return;
    const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim();
    if (!latestUserMessage) return;

    const regeneratePrompt = [
      latestUserMessage,
      '',
      'Please regenerate a NEW version of package proposals with different product combinations and negotiation strategies from previous versions. Keep my original constraints and budget intent.',
    ].join('\n');

    setIsActive(true);
    setSelectedSchemeId(null);
    clearStages();

    addStage({
      stage: 'retrieving',
      label: 'retrieving',
      description: 'Regenerating a new version of your packages...',
      progress: 10,
      timestamp: new Date().toISOString(),
    });
    startStreamingPreview('Regenerate latest package version');

    try {
      await sendMessage(regeneratePrompt, {
        requestPreferences: buildBackendPreferencePayload(),
        onToken: (text) => {
          setStreamingPreview(text);
        },
      });

      const { schemes: storeSchemes } = useSchemeStore.getState();
      const hasCompletedStage = useAgentTimelineStore
        .getState()
        .stages
        .some((s) => s.stage === 'completed');

      if (!hasCompletedStage) {
        addStage({
          stage: 'completed',
          label: 'Completed',
          description: storeSchemes.length > 0
            ? `Regenerated ${storeSchemes.length} new packages — latest version is now active.`
            : 'Regeneration completed. You can refine your request for more options.',
          progress: 100,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      clearStreamingPreview();
      setIsActive(false);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex h-screen flex-col bg-[#f6f5ff] text-[#18170f]', plusJakarta.className)}>
      <div className="flex flex-1 overflow-hidden">
        <AnimatePresence>
          {sidebarOpen && <ChatSidebar />}
        </AnimatePresence>
        {!sidebarOpen && <ChatSidebar />}
        {isHeroMode ? (
          <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_35%,rgba(79,70,229,0.12),transparent_48%)]" />
            <div className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4f46e5] shadow-lg shadow-[#4f46e5]/25">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6366f1]">
                <span className="h-2 w-2 rounded-full bg-[#6366f1] shadow-[0_0_0_4px_rgba(99,102,241,0.22)]" />
                Your genie is ready
              </div>
              <h1 className={cn('mt-5 max-w-3xl text-[44px] leading-[1.16] text-[#18170f]', lora.className)}>
                Tell me what you want.
                <br />
                I&apos;ll get you the <em className="text-[#4f46e5]">best deal.</em>
              </h1>
              <p className="mt-4 max-w-xl text-[22px] leading-relaxed text-[#6e6b62]">
                Describe anything you want to buy. MartGennie compares prices, finds deals, and negotiates.
              </p>

              <div className="mt-8 w-full rounded-[24px] border border-[#ddd6cc] bg-white p-4 shadow-[0_6px_28px_rgba(0,0,0,0.08)] focus-within:border-[#a5b4fc] focus-within:ring-4 focus-within:ring-[#4f46e5]/10">
                <ScenarioQuickJumpBar
                  actions={SCENARIO_QUICK_ACTIONS}
                  onAction={handleScenarioNavigate}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. I want a grey modular sofa under $900, good quality, ships to LA..."
                  className="w-full bg-transparent px-2 py-2 text-[15px] text-[#18170f] placeholder:text-[#b0aaa0] focus:outline-none"
                  disabled={isLoading}
                />
                <div className="mt-3 flex items-center justify-between border-t border-[#eee8df] pt-3">
                  <div className="flex flex-wrap gap-2">
                    {promptChips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => togglePromptChip(chip)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          activePromptChips.includes(chip)
                            ? 'border-[#a5b4fc] bg-[#eef2ff] text-[#3730a3]'
                            : 'border-[#ddd6cc] bg-[#f5f3ef] text-[#6e6b62] hover:border-[#a5b4fc] hover:bg-[#eef2ff] hover:text-[#3730a3]'
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                      inputValue.trim() && !isLoading
                        ? 'bg-[#4f46e5] text-white shadow-lg shadow-[#4f46e5]/30 hover:bg-[#6366f1]'
                        : 'cursor-not-allowed bg-[#ede9e2] text-[#afa9a0]',
                    )}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-left text-xs text-[#8f897f]">
                  Active: {activeCategory}{activePromptChips.length > 0 ? ` · ${activePromptChips.join(' · ')}` : ''}
                </p>
              </div>

              <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPrompt(p)}
                    className="rounded-full border border-[#ddd6cc] bg-white px-4 py-2 text-sm text-[#6e6b62] transition-colors hover:border-[#a5b4fc] hover:bg-[#eef2ff] hover:text-[#3730a3]"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="mt-10 flex w-full max-w-3xl flex-wrap justify-center gap-3">
                {categoryPills.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleCategorySelect(item.label)}
                    className={cn(
                      'rounded-full border px-4 py-2 text-sm transition-colors',
                      activeCategory === item.label
                        ? 'border-[#a5b4fc] bg-[#eef2ff] text-[#3730a3]'
                        : 'border-[#ddd6cc] bg-white text-[#6e6b62] hover:border-[#cfc7bc] hover:bg-[#f5f3ef]'
                    )}
                  >
                    <span>{item.label}</span>
                    <span className={cn(
                      'ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                      item.state === 'live' ? 'bg-[#d7f0e6] text-[#3730a3]' : item.state === 'soon' ? 'bg-[#fef3c7] text-[#b45309]' : 'bg-[#ede9e2] text-[#8a857d]'
                    )}>
                      {item.state}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-1 min-w-0 flex-col border-r border-[#e6e0d8] bg-[#fffefc]">
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="mx-auto max-w-xl space-y-5">
                  {messages.length === 0 ? (
                    <WelcomeMessage
                      nickname={userMemory?.nickname}
                      visitCount={userMemory?.visit_count}
                    />
                  ) : (
                    messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        schemeRound={msg.schemeRoundId ? schemeHistory.find(r => r.id === msg.schemeRoundId) : undefined}
                        activeRoundId={activeRoundId}
                        onSwitchRound={setActiveRound}
                        intentActions={msg.id === lastAssistantMessage?.id ? lastAssistantIntentActions : []}
                        onIntentAction={handleScenarioNavigate}
                      />
                    ))
                  )}

                  {isLoading && (
                    <div className="space-y-2">
                      <MessageBubble
                        message={{
                          id: 'assistant-streaming-preview',
                          role: 'assistant',
                          content: streamingPreview || 'Thinking',
                          timestamp: new Date().toISOString(),
                          type: 'loading',
                        }}
                        activeRoundId={activeRoundId}
                        onSwitchRound={setActiveRound}
                      />
                      <div className="pl-12">
                        <ChatTypingIndicator />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {contextPins.length > 0 && (
                <div className="shrink-0 border-t border-[#eee8df]">
                  <ContextPins
                    pins={contextPins}
                    sessionId={sessionId}
                    onRemovePin={removeContextPin}
                  />
                </div>
              )}

              {pendingImplicitPrompt && (
                <div className="shrink-0">
                  <ImplicitPreferenceCard
                    prompt={pendingImplicitPrompt}
                    onConfirm={confirmImplicitPreference}
                    onDismiss={dismissImplicitPrompt}
                  />
                </div>
              )}

              <div className="shrink-0 border-t border-[#e6e0d8] px-4 py-3">
                <ScenarioQuickJumpBar
                  actions={SCENARIO_QUICK_ACTIONS}
                  onAction={handleScenarioNavigate}
                />
                <div className="flex items-center gap-2 rounded-2xl border border-[#d9d3ca] bg-white p-2 shadow-[0_2px_16px_rgba(0,0,0,0.06)] focus-within:border-[#a5b4fc] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#4f46e5]/10">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your home furnishing needs..."
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[#18170f] placeholder:text-[#afa9a0] focus:outline-none"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                      inputValue.trim() && !isLoading
                        ? 'bg-[#4f46e5] text-white shadow-lg shadow-[#4f46e5]/25 hover:bg-[#6366f1]'
                        : 'cursor-not-allowed bg-[#ede9e2] text-[#afa9a0]',
                    )}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-xs text-[#afa9a0]">Press Enter to send</p>
              </div>
            </div>

            <div
              onMouseDown={() => {
                isHorizontalResizingRef.current = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
              className="group relative w-2 shrink-0 cursor-col-resize bg-[#f0efff]"
            >
              <div className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c7c3ef] transition-colors group-hover:bg-[#a5b4fc]" />
            </div>

            <div
              ref={rightPanelRef}
              className="flex shrink-0 flex-col bg-[#f5f4ff]"
              style={{ width: `${rightPanelWidth}px` }}
            >

              <div className={cn(
                'shrink-0 overflow-y-auto border-b border-[#e0dbff] transition-all duration-500',
                hasSchemes ? '' : 'flex-1',
              )}
              style={hasSchemes ? { height: `${topPanelRatio}%` } : undefined}
              >
                <div className="p-5">
                  {(isActive || stages.length > 0) ? (
                    <AgentTimeline
                      stages={stages}
                      currentStage={latestStage}
                      isActive={isActive}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef2ff]">
                        <Sparkles className="h-7 w-7 text-[#4f46e5]" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-[#18170f]">AI Agent Activity Log</p>
                      <p className="mt-1 text-xs text-[#afa9a0]">Agent steps will appear here while processing</p>
                    </div>
                  )}
                </div>
              </div>

              {lastSkillInvocations.length > 0 && (
                <div className="shrink-0 border-b border-[#e0dbff] px-5 py-2">
                  <SkillResultsBadge invocations={lastSkillInvocations} />
                </div>
              )}

              {hasSchemes && (
                <div
                  onMouseDown={() => {
                    isVerticalResizingRef.current = true;
                    document.body.style.cursor = 'row-resize';
                    document.body.style.userSelect = 'none';
                  }}
                  className="group relative h-2 shrink-0 cursor-row-resize bg-[#f0efff]"
                >
                  <div className="absolute left-1/2 top-1/2 h-1 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c7c3ef] transition-colors group-hover:bg-[#a5b4fc]" />
                </div>
              )}

              <AnimatePresence>
                {hasSchemes && (
                  <motion.div
                    key="packages"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.4 }}
                    className="flex-1 min-h-[200px] overflow-hidden"
                  >
                    <PackagesPanel
                      schemes={schemes}
                      selectedSchemeId={selectedSchemeId}
                      onSelectScheme={handleSelectScheme}
                      onViewNegotiation={handleViewNegotiation}
                      onConfirmOrder={handleConfirmOrder}
                      onRefresh={handleRefresh}
                      activeRound={schemeHistory.find(r => r.id === activeRoundId) ?? null}
                      totalRounds={schemeHistory.length}
                      isLoading={isLoading}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <NegotiationDialog isOpen={negOpen} onClose={() => setNegOpen(false)} record={negRecord} />
    </div>
  );
}
