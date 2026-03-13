'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock3, Handshake, Loader2, Sparkles, Tag } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { useChatStore, useConversationStore, useOrderStore } from '@/store';
import { Button } from '@/components/ui/button';

interface NightMarketScheme {
  scheme_id: string;
  scheme_name: string;
  theme?: string;
  style_tags: string[];
  items_count: number;
  cover_image?: string;
  original_price: number;
  expected_discount_min: number;
  expected_discount_max: number;
  final_price_hint: number;
  urgency_text: string;
  scheme_snapshot: Record<string, unknown>;
}

interface MarketOffer {
  offer_id: string;
  final_price: number;
  discount_percent: number;
  expires_at: string;
}

interface TranscriptMessage {
  role: 'buyer' | 'seller';
  message: string;
  price?: number;
  round: number;
  timestamp?: string;
}

interface NegotiationState {
  negotiation_id: string;
  scheme_id: string;
  scheme_name: string;
  status: 'active' | 'success' | 'failed' | 'expired';
  current_round: number;
  max_rounds: number;
  mood_score: number;
  current_seller_price: number;
  transcript: TranscriptMessage[];
  offer?: MarketOffer;
}

interface NightMarketPanelProps {
  sessionId?: string | null;
}

interface AcceptResult {
  acceptedAt: string;
  finalPrice: number;
  offerId: string;
}

const ACTIVE_NEGOTIATION_STORAGE_KEY = 'night_market_active_negotiation_id';
const QUICK_BARGAIN_PROMPTS = [
  'I am a student on a tight budget. Can we get a better package deal?',
  'If I confirm today, could you offer a stronger discount on this bundle?',
  'I really like this set. Is there a student-friendly final price you can do?',
  'Can we reduce the total a bit if I keep all items in this package?',
  'What is the best all-in price you can offer right now for this combo?',
];

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NightMarketPanel({ sessionId }: NightMarketPanelProps) {
  const router = useRouter();
  const createNewConversation = useConversationStore((state) => state.createNewConversation);
  const setCurrentOrder = useOrderStore((state) => state.setCurrentOrder);
  const negotiationSectionRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<NightMarketScheme[]>([]);
  const [activeScheme, setActiveScheme] = useState<NightMarketScheme | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationState | null>(null);
  const [offerPrice, setOfferPrice] = useState<string>('');
  const [message, setMessage] = useState<string>('Can we get a better package deal?');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [accepting, setAccepting] = useState<boolean>(false);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [acceptResult, setAcceptResult] = useState<AcceptResult | null>(null);
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadSchemes = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('session_id', sessionId);
      const response = await fetch(`${API_BASE_URL}/api/plaza/night-market?${params.toString()}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.message || 'Failed to fetch Night Market schemes');
      }
      setSchemes(result.data?.schemes || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load Night Market. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchemes();
  }, [sessionId]);

  useEffect(() => {
    if (!activeScheme || !negotiation) return;
    window.requestAnimationFrame(() => {
      negotiationSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [activeScheme, negotiation?.negotiation_id]);

  const loadNegotiationSession = async (negotiationId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/negotiation/market/session/${negotiationId}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      if (result.code !== 200 || !result.data) {
        return;
      }

      const data = result.data;
      const matchedScheme = schemes.find((scheme) => scheme.scheme_id === data.scheme_id) || null;

      setActiveScheme(
        matchedScheme || {
          scheme_id: data.scheme_id,
          scheme_name: data.scheme_name,
          theme: 'Recovered Negotiation',
          style_tags: [],
          items_count: 0,
          cover_image: undefined,
          original_price: Number(data.original_price || data.current_seller_price || 0),
          expected_discount_min: 0,
          expected_discount_max: 0,
          final_price_hint: Number(data.current_seller_price || 0),
          urgency_text: 'Resumed from your latest session',
          scheme_snapshot: {},
        }
      );

      const transcript: TranscriptMessage[] = Array.isArray(data.transcript)
        ? data.transcript.map((msg: Record<string, unknown>) => ({
            role: String(msg.role) === 'buyer' ? 'buyer' : 'seller',
            message: String(msg.message || ''),
            price: typeof msg.price === 'number' ? msg.price : undefined,
            round: Number(msg.round || 0),
            timestamp: msg.timestamp ? String(msg.timestamp) : undefined,
          }))
        : [];

      setNegotiation({
        negotiation_id: data.negotiation_id,
        scheme_id: data.scheme_id,
        scheme_name: data.scheme_name,
        status: data.status,
        current_round: Number(data.current_round || 0),
        max_rounds: Number(data.max_rounds || 0),
        mood_score: Number(data.mood_score || 0),
        current_seller_price: Number(data.current_seller_price || 0),
        transcript,
        offer: data.offer,
      });
      setAcceptResult(null);
      setCreatedOrderId(null);

      if (typeof data.current_seller_price === 'number' && data.current_seller_price > 0) {
        setOfferPrice(String(Math.round(data.current_seller_price * 0.96)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (loading || schemes.length === 0 || negotiation) return;
    if (typeof window === 'undefined') return;
    const storedNegotiationId = window.localStorage.getItem(ACTIVE_NEGOTIATION_STORAGE_KEY);
    if (!storedNegotiationId) return;
    void loadNegotiationSession(storedNegotiationId);
  }, [loading, schemes, negotiation]);

  const resolveSessionId = async (): Promise<string | null> => {
    const existingSessionId = sessionId ?? useChatStore.getState().sessionId;
    if (existingSessionId) {
      return existingSessionId;
    }

    await createNewConversation();
    return useChatStore.getState().sessionId;
  };

  const startNegotiation = async (scheme: NightMarketScheme) => {
    const activeSessionId = await resolveSessionId();
    if (!activeSessionId) {
      setError('Session not ready yet. Please start a chat session first.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/negotiation/market/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          scheme_id: scheme.scheme_id,
          scheme_name: scheme.scheme_name,
          original_price: scheme.original_price,
          scheme_snapshot: scheme.scheme_snapshot,
        }),
      });
      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.message || 'Failed to start negotiation');
      }
      const data = result.data;
      setActiveScheme(scheme);
      setOfferPrice(String(Math.round(data.current_seller_price * 0.9)));
      setNegotiation({
        negotiation_id: data.negotiation_id,
        scheme_id: data.scheme_id,
        scheme_name: data.scheme_name,
        status: data.status,
        current_round: data.current_round,
        max_rounds: data.max_rounds,
        mood_score: data.mood_score,
        current_seller_price: data.current_seller_price,
        transcript: [
          {
            role: 'seller',
            message: data.greeting,
            price: data.current_seller_price,
            round: data.current_round,
          },
        ],
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_NEGOTIATION_STORAGE_KEY, String(data.negotiation_id));
      }
    } catch (err) {
      console.error(err);
      setError('Could not open negotiation room.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCounterOffer = async () => {
    const activeSessionId = sessionId ?? useChatStore.getState().sessionId;
    if (!negotiation || !activeSessionId || !offerPrice) return;

    const numericOffer = Number(offerPrice);
    if (!Number.isFinite(numericOffer) || numericOffer <= 0) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/negotiation/market/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiation_id: negotiation.negotiation_id,
          session_id: activeSessionId,
          offer_price: numericOffer,
          message,
        }),
      });
      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.message || 'Counter offer failed');
      }
      const data = result.data;
      const nextTranscript = [...negotiation.transcript];
      nextTranscript.push({
        role: 'buyer',
        message: message || 'Counter offer',
        price: data.buyer_offer,
        round: data.current_round,
      });
      nextTranscript.push({
        role: 'seller',
        message: data.seller_message,
        price: data.seller_price,
        round: data.current_round,
      });

      setNegotiation({
        ...negotiation,
        status: data.status,
        current_round: data.current_round,
        max_rounds: data.max_rounds,
        mood_score: data.mood_score,
        current_seller_price: data.seller_price,
        transcript: nextTranscript,
        offer: data.offer,
      });

      if (!data.accepted) {
        setOfferPrice(String(Math.round(data.seller_price * 0.96)));
      }
    } catch (err) {
      console.error(err);
      setError('Your offer did not go through. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const acceptOffer = async () => {
    const activeSessionId = sessionId ?? useChatStore.getState().sessionId;
    if (!negotiation?.offer || !activeSessionId) return;

    setAccepting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/negotiation/market/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiation_id: negotiation.negotiation_id,
          offer_id: negotiation.offer.offer_id,
          session_id: activeSessionId,
        }),
      });
      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.message || 'Accept offer failed');
      }

      setNegotiation({
        ...negotiation,
        status: 'success',
      });
      if (result.data) {
        setAcceptResult({
          acceptedAt: String(result.data.accepted_at || new Date().toISOString()),
          finalPrice: Number(result.data.final_price || negotiation.offer.final_price),
          offerId: String(result.data.offer_id || negotiation.offer.offer_id),
        });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to accept offer.');
    } finally {
      setAccepting(false);
    }
  };

  const proceedToPurchase = async () => {
    const activeSessionId = sessionId ?? useChatStore.getState().sessionId;
    if (!negotiation?.offer || !activeSessionId) return;
    if (!acceptResult) {
      setError('Please click Accept Offer first to confirm and lock the negotiated quote.');
      return;
    }

    setCreatingOrder(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/negotiation/market/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiation_id: negotiation.negotiation_id,
          offer_id: negotiation.offer.offer_id,
          session_id: activeSessionId,
        }),
      });
      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.message || result.detail || 'Failed to create order');
      }
      const orderId = String(result.data?.order_id || `NM-${Date.now()}`);
      setCreatedOrderId(orderId);

      const snapshotItems = Array.isArray(activeScheme?.scheme_snapshot?.items)
        ? (activeScheme?.scheme_snapshot?.items as Array<Record<string, unknown>>)
        : [];

      const fallbackItem = {
        productId: activeScheme?.scheme_id || 'night-market-bundle',
        productName: activeScheme?.scheme_name || 'Night Market Bundle',
        productImage: activeScheme?.cover_image || '',
        price: Number(acceptResult.finalPrice || negotiation.offer.final_price),
        quantity: 1,
      };

      const orderItems = snapshotItems.length > 0
        ? snapshotItems.map((item, idx) => ({
            productId: String(item.product_id || `item-${idx + 1}`),
            productName: String(item.product_name || `Bundle Item ${idx + 1}`),
            productImage: String(item.product_image || ''),
            price: Number(item.price || 0),
            quantity: 1,
          }))
        : [fallbackItem];

      setCurrentOrder({
        id: orderId,
        userId: 'demo_user_001',
        items: orderItems,
        status: 'pending',
        totalAmount: Number(acceptResult.finalPrice || negotiation.offer.final_price),
        shippingAddress: {
          id: 'nm-default-address',
          name: 'Night Market Buyer',
          phone: '000-000-0000',
          province: 'Pending',
          city: 'Pending',
          district: 'Pending',
          detail: 'Please complete shipping details on the order page.',
          isDefault: true,
        },
        paymentMethod: 'negotiated-offer',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      router.push('/order');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message
        ? err.message
        : 'Could not create order from this offer. Please try another bundle or continue from recommendations.';
      setError(message);
    } finally {
      setCreatingOrder(false);
    }
  };

  const offerCountdown = useMemo(() => {
    if (!negotiation?.offer) return null;
    const ms = new Date(negotiation.offer.expires_at).getTime() - nowTs;
    if (ms <= 0) return 'Expired';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, [negotiation?.offer, nowTs]);

  const negotiationRounds = useMemo(() => {
    if (!negotiation) return [];
    const grouped = new Map<number, { round: number; buyer?: TranscriptMessage; seller?: TranscriptMessage }>();

    for (const msg of negotiation.transcript) {
      if (msg.round <= 0) continue;
      const existing = grouped.get(msg.round) || { round: msg.round };
      if (msg.role === 'buyer') {
        existing.buyer = msg;
      } else {
        existing.seller = msg;
      }
      grouped.set(msg.round, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => a.round - b.round);
  }, [negotiation]);

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <Sparkles className="h-3.5 w-3.5" />
              Night Market
            </p>
            <h2 className="mt-3 text-3xl font-bold text-slate-900">AI Negotiation Bazaar</h2>
            <p className="mt-2 text-sm text-slate-600">
              Pick a full-home bundle and bargain with the Seller Agent in real time. Each room has limited rounds.
            </p>
          </div>
          <Button variant="outline" onClick={loadSchemes} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh Market
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schemes.map((scheme) => (
            <article key={scheme.scheme_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="h-40 bg-slate-100">
                {scheme.cover_image ? (
                  <img src={scheme.cover_image} alt={scheme.scheme_name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">No preview</div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{scheme.scheme_name}</h3>
                  <p className="line-clamp-1 text-sm text-slate-500">{scheme.theme || 'AI Curated Bundle'}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {scheme.style_tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="rounded-xl bg-amber-50 p-3 text-sm">
                  <p className="font-medium text-amber-800">{scheme.urgency_text}</p>
                  <p className="mt-1 text-amber-700">
                    Expected cut: {scheme.expected_discount_min}% - {scheme.expected_discount_max}%
                  </p>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Bundle price</p>
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(scheme.original_price)}</p>
                    <p className="text-xs text-emerald-700">Likely close at {formatCurrency(scheme.final_price_hint)}</p>
                  </div>
                  <Button
                    onClick={() => startNegotiation(scheme)}
                    disabled={submitting}
                    className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <Handshake className="mr-1.5 h-4 w-4" />
                    Bargain
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {activeScheme && negotiation && (
        <section ref={negotiationSectionRef} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{activeScheme.scheme_name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                Round {negotiation.current_round}/{negotiation.max_rounds} • Seller Mood {negotiation.mood_score}/100
              </p>
            </div>
            <div className="w-full max-w-sm rounded-full bg-slate-100 p-1">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"
                style={{ width: `${Math.max(6, negotiation.mood_score)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {negotiation.transcript.map((msg, idx) => (
              <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === 'seller' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'seller' ? 'bg-slate-100 text-slate-800' : 'bg-indigo-600 text-white'}`}>
                  <p>{msg.message}</p>
                  {typeof msg.price === 'number' && (
                    <p className={`mt-1 text-xs ${msg.role === 'seller' ? 'text-slate-500' : 'text-indigo-100'}`}>
                      {msg.role === 'seller' ? 'Counter' : 'Offer'}: {formatCurrency(msg.price)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Negotiation Journey</p>
            <p className="mt-1 text-xs text-slate-600">Each round shows your offer, the Seller Agent response, and price movement.</p>
            {negotiationRounds.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Opening round is complete. Submit your first offer to start the journey.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {negotiationRounds.map((roundData) => (
                  <div key={roundData.round} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Round {roundData.round}</p>
                    <p className="mt-1 text-sm text-indigo-700">
                      Buyer Offer: {typeof roundData.buyer?.price === 'number' ? formatCurrency(roundData.buyer.price) : '-'}
                    </p>
                    <p className="text-sm text-slate-700">
                      Seller Counter: {typeof roundData.seller?.price === 'number' ? formatCurrency(roundData.seller.price) : '-'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{roundData.seller?.message || 'Waiting for seller response...'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {negotiation.offer ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Limited Offer Locked</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(negotiation.offer.final_price)}</p>
              <p className="text-sm text-emerald-700">Discount: {negotiation.offer.discount_percent}%</p>
              <p className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-800">
                <Clock3 className="h-4 w-4" />
                Expires in {offerCountdown}
              </p>
              <div className="mt-3">
                <Button
                  onClick={acceptOffer}
                  disabled={accepting || offerCountdown === 'Expired' || !!acceptResult}
                  className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tag className="mr-2 h-4 w-4" />}
                  {acceptResult ? 'Offer Accepted' : 'Accept Offer'}
                </Button>
              </div>

              {!acceptResult && negotiation.status === 'success' && (
                <p className="mt-3 text-sm text-emerald-800">
                  This quote is ready. Click <span className="font-semibold">Accept Offer</span> to confirm before purchase.
                </p>
              )}

              {acceptResult && (
                <div className="mt-4 rounded-xl border border-emerald-300 bg-white p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Offer accepted successfully
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {acceptResult
                      ? `Your final locked price is ${formatCurrency(acceptResult.finalPrice)}. Accepted at ${new Date(acceptResult.acceptedAt).toLocaleString()}.`
                      : 'Your offer is confirmed and locked. You can continue browsing or start a new bargaining session.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={proceedToPurchase} disabled={creatingOrder || !!createdOrderId}>
                      {creatingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {createdOrderId ? 'Order Created' : 'Proceed to Purchase'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setNegotiation(null);
                        setActiveScheme(null);
                        setAcceptResult(null);
                        void loadSchemes();
                        if (typeof window !== 'undefined') {
                          window.localStorage.removeItem(ACTIVE_NEGOTIATION_STORAGE_KEY);
                        }
                      }}
                    >
                      Start New Bargain
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Back to Market List
                    </Button>
                  </div>
                  {createdOrderId && (
                    <p className="mt-3 text-sm text-emerald-700">
                      Order created successfully. Order ID: <span className="font-semibold">{createdOrderId}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Bargain Prompts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_BARGAIN_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setMessage(prompt)}
                      disabled={submitting || negotiation.status !== 'active'}
                      className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use: {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px_auto]">
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Tell the seller why this price works for you"
                  disabled={submitting || negotiation.status !== 'active'}
                />
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
                  value={offerPrice}
                  onChange={(event) => setOfferPrice(event.target.value)}
                  min={1}
                  step={1}
                  disabled={submitting || negotiation.status !== 'active'}
                />
                <Button
                  onClick={submitCounterOffer}
                  disabled={submitting || negotiation.status !== 'active' || negotiation.current_round >= negotiation.max_rounds}
                  className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send Offer
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
