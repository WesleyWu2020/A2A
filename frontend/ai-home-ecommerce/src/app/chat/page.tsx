'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  Heart,
  Settings,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentTimeline } from '@/components/AgentTimeline';
import { ProductCard } from '@/components/ProductCard';
import { SchemeCard } from '@/components/SchemeCard';
import { NegotiationDialog } from '@/components/NegotiationDialog';
import { PriceDisplay } from '@/components/PriceDisplay';
import { ChatTypingIndicator } from '@/components/LoadingSpinner';
import { ContextPins } from '@/components/ContextPins';
import { ImplicitPreferenceCard } from '@/components/ImplicitPreferenceCard';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { ProjectSettingsPanel } from '@/components/ProjectSettingsPanel';
import { FavoritesPanel } from '@/components/FavoritesPanel';
import { SkillResultsBadge } from '@/components/SkillResultsBadge';
import { useChatStore, useAgentTimelineStore, useSchemeStore, useOrderStore, useMemoryStore, useProjectStore } from '@/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { ChatMessage, Scheme, NegotiationRecord } from '@/types';
import { API_BASE_URL } from '@/lib/api';

// ─── types ────────────────────────────────────────────────────────────────────

interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  images: string[];
  category: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function enrichSchemesWithImages(schemes: Scheme[], fp: FeaturedProduct[]): Scheme[] {
  if (fp.length === 0) return schemes;
  let imgIdx = 0;
  return schemes.map((scheme, si) => ({
    ...scheme,
    coverImage: scheme.coverImage || fp[si % fp.length]?.image,
    products: scheme.products.map((item) => {
      const hasImage = item.product.images?.length > 0 && item.product.images[0];
      if (hasImage) return item;
      const real = fp[imgIdx % fp.length];
      imgIdx++;
      return {
        ...item,
        product: {
          ...item.product,
          images: real ? [real.image, ...real.images.slice(1, 3)] : [],
        },
      };
    }),
  }));
}

// ─── quick prompts ────────────────────────────────────────────────────────────

const quickPrompts = [
  'Budget $3,000 — help me furnish a cozy living room, I have two cats so need pet-friendly fabric',
  'Looking for Scandinavian-style bedroom furniture, prefer natural wood tones',
  'Need a complete home office setup, ergonomic and modern',
  'Kid-friendly furniture for a 10-year-old\'s bedroom, safe and eco materials',
];

const SUMMARIZING_STATUS_ROTATION = [
  'Compiling 3 curated packages with negotiated prices...',
  'Finalizing package comparisons and trade-offs...',
  'Optimizing value picks based on your safety and eco needs...',
];

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

  return <p className="text-sm leading-relaxed">{displayed}</p>;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
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
          ? 'bg-indigo-100 text-indigo-600'
          : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className={cn('flex max-w-[80%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white'
            : 'bg-white shadow-sm border border-slate-100 text-slate-900',
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

        <span className="mt-1 text-xs text-slate-400">
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
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      {isReturn ? (
        <>
          <h2 className="mt-5 text-xl font-bold text-slate-900">
            Welcome back{nickname ? `, ${nickname}` : ''}! 👋
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Your AI home assistant remembers your preferences. Tell me what you&apos;re looking for today.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-5 text-xl font-bold text-slate-900">
            I&apos;m Your AI Home Furnishing Assistant
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Tell me what you need — I&apos;ll search, negotiate prices, and build curated packages for you.
          </p>
        </>
      )}
    </motion.div>
  );
}

// ─── packages panel ───────────────────────────────────────────────────────────

interface PackagesPanelProps {
  schemes: Scheme[];
  onViewNegotiation: (scheme: Scheme) => void;
  onConfirmOrder: (scheme: Scheme) => void;
  selectedSchemeId: string | null;
  onSelectScheme: (scheme: Scheme) => void;
  onRefresh: () => void;
}

function PackagesPanel({
  schemes,
  onViewNegotiation,
  onConfirmOrder,
  selectedSchemeId,
  onSelectScheme,
  onRefresh,
}: PackagesPanelProps) {
  const totalSavings = schemes.reduce((s, sc) => s + sc.totalDiscount, 0);
  const selectedScheme = schemes.find((s) => s.id === selectedSchemeId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Package className="h-4 w-4 text-indigo-600" />
            AI-Curated Packages
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {schemes.length}
            </span>
          </h3>
          {totalSavings > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600">
              <TrendingDown className="h-3 w-3" />
              AI negotiated total savings of ${totalSavings.toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
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
            className="shrink-0 border-t border-slate-200 bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-900">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
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
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 hover:shadow-indigo-500/40"
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
  const isResizingRef = useRef(false);
  const [topPanelRatio, setTopPanelRatio] = useState(42);
  const [streamingPreview, setStreamingPreview] = useState('');

  // negotiation dialog
  const [negRecord, setNegRecord] = useState<NegotiationRecord | null>(null);
  const [negOpen, setNegOpen] = useState(false);

  // selected scheme
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const { messages, isLoading, sendMessage, initializeSession, sessionId } = useChatStore();
  const { stages, isActive, setIsActive, addStage, updateStage, clearStages } = useAgentTimelineStore();
  const { schemes, setSchemes, selectScheme } = useSchemeStore();
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

  const {
    activeProject,
    lastSkillInvocations,
    loadProjects,
  } = useProjectStore();

  // project panels
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);

  const hasSchemes = schemes.length > 0;
  const latestStage = stages.length > 0 ? stages[stages.length - 1] : null;

  // WebSocket (optional)
  useWebSocket(sessionId, {
    onAgentStage: (data) => {
      addStage({ stage: data.stage, label: data.stage, description: data.message, progress: data.progress, timestamp: new Date().toISOString() });
      setIsActive(data.stage !== 'completed');
    },
  });

  // init session + load memory + load projects
  useEffect(() => {
    if (!sessionId) initializeSession();
    loadUserMemory();
    loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // enrich images when schemes arrive
  useEffect(() => {
    if (schemes.length === 0) return;
    const needsImages = schemes.some(
      (s) => s.products.some((p) => !p.product.images?.length || !p.product.images[0])
    );
    if (!needsImages) return;
    fetch(`${API_BASE_URL}/api/products/featured?limit=12`)
      .then((r) => r.json())
      .then((res) => {
        const fp: FeaturedProduct[] = res.code === 200 && res.data?.products ? res.data.products : [];
        if (fp.length > 0) setSchemes(enrichSchemesWithImages(schemes, fp));
      })
      .catch(() => {});
  }, [schemes, setSchemes]);

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
      if (!isResizingRef.current || !rightPanelRef.current) return;
      const rect = rightPanelRef.current.getBoundingClientRect();
      const nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedRatio = Math.min(72, Math.max(28, nextRatio));
      setTopPanelRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // send message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    const message = inputValue.trim();
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

  const applyPrompt = (prompt: string) => {
    setInputValue(prompt);
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

  const handleRefresh = () => {
    setSchemes([]);
    setSelectedSchemeId(null);
    clearStages();
  };

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header />

      {/* ── Project Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <ProjectSwitcher />
        {activeProject && (
          <>
            <button
              onClick={() => setShowProjectSettings(true)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
            <button
              onClick={() => setShowFavorites(true)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <Heart className="h-3.5 w-3.5" />
              Favorites
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Chat ── */}
        <div className="flex w-1/2 flex-col border-r border-slate-200 bg-white">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="mx-auto max-w-xl space-y-5">
              {messages.length === 0 ? (
                <WelcomeMessage
                  nickname={userMemory?.nickname}
                  visitCount={userMemory?.visit_count}
                />
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
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
                  />
                  <div className="pl-12">
                    <ChatTypingIndicator />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Context Pins — visible once the user has sent at least one message */}
          {contextPins.length > 0 && (
            <div className="shrink-0 border-t border-slate-100">
              <ContextPins
                pins={contextPins}
                sessionId={sessionId}
                onRemovePin={removeContextPin}
              />
            </div>
          )}

          {/* Implicit Preference Confirmation Card */}
          {pendingImplicitPrompt && (
            <div className="shrink-0">
              <ImplicitPreferenceCard
                prompt={pendingImplicitPrompt}
                onConfirm={confirmImplicitPreference}
                onDismiss={dismissImplicitPrompt}
              />
            </div>
          )}

          {/* Quick prompts — only when empty */}
          {messages.length === 0 && (
            <div className="shrink-0 border-t border-slate-100 px-5 py-3">
              <p className="mb-2 text-xs text-slate-400">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPrompt(p)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {p.length > 55 ? p.slice(0, 52) + '…' : p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/10">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your home furnishing needs..."
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                  inputValue.trim() && !isLoading
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed',
                )}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-slate-400">Press Enter to send</p>
          </div>
        </div>

        {/* ── Right: Timeline + Packages ── */}
        <div ref={rightPanelRef} className="flex w-1/2 flex-col bg-slate-50">

          {/* Right-top: Agent Activity Log */}
          <div className={cn(
            'shrink-0 overflow-y-auto border-b border-slate-200 transition-all duration-500',
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100">
                    <Sparkles className="h-7 w-7 text-indigo-500" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-700">AI Agent Activity Log</p>
                  <p className="mt-1 text-xs text-slate-400">Agent steps will appear here while processing</p>

                  {/* Pro tips */}
                  <div className="mt-6 w-full max-w-xs rounded-xl bg-amber-50 p-4 text-left">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                      <Sparkles className="h-3.5 w-3.5" />
                      Pro Tips
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs text-amber-700">
                      <li>• More details = better recommendations</li>
                      <li>• Mention style, budget, and room size</li>
                      <li>• AI automatically negotiates prices</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Skill Check Results */}
          {lastSkillInvocations.length > 0 && (
            <div className="shrink-0 border-b border-slate-200 px-5 py-2">
              <SkillResultsBadge invocations={lastSkillInvocations} />
            </div>
          )}

          {hasSchemes && (
            <div
              onMouseDown={() => {
                isResizingRef.current = true;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
              }}
              className="group relative h-2 shrink-0 cursor-row-resize bg-slate-100"
            >
              <div className="absolute left-1/2 top-1/2 h-1 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 transition-colors group-hover:bg-indigo-400" />
            </div>
          )}

          {/* Right-bottom: Packages */}
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
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <NegotiationDialog isOpen={negOpen} onClose={() => setNegOpen(false)} record={negRecord} />
      <ProjectSettingsPanel isOpen={showProjectSettings} onClose={() => setShowProjectSettings(false)} />
      <FavoritesPanel isOpen={showFavorites} onClose={() => setShowFavorites(false)} />
    </div>
  );
}
