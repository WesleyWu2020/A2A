'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  MessageCircle,
  TrendingUp,
  Star,
  Bell,
  ShoppingBag
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';
import { useChatStore, useMemoryStore } from '@/store';
import { PlazaBanner } from './components/PlazaBanner';
import { ProductCard } from './components/ProductCard';
import { AchievementCard } from './components/AchievementCard';
import { ReviewCard } from './components/ReviewCard';
import { WakeUpCard } from './components/WakeUpCard';
import { ProductDetailModal } from './components/ProductDetailModal';

const CATEGORY_PREFERENCES = ['Furniture', 'Home Decoration', 'Lighting'];
const STYLE_PREFERENCES = ['modern', 'farmhouse', 'industrial'];
const PREFERENCE_OPTIONS = [...CATEGORY_PREFERENCES, ...STYLE_PREFERENCES];

// Map profile tag keys to supported product style values
const PROFILE_TAG_TO_STYLE: Record<string, string> = {
  minimalist: 'Minimalist',
  mid_century: 'Mid-Century',
  scandinavian: 'Modern',
  prefers_wood: 'Farmhouse',
  cold_sensitive: 'Modern',
};

// Profile tags that correspond to a display-level style preference button
const PROFILE_TAG_TO_PREF: Record<string, string> = {
  minimalist: 'modern',
  mid_century: 'modern',
  scandinavian: 'modern',
  prefers_wood: 'farmhouse',
};

// 类型定义
interface PlazaProduct {
  spu_id: string;
  title: string;
  category: string;
  price_current: number;
  price_original?: number;
  currency: string;
  image?: string;
  tags: string[];
  rating?: number;
  styles: string[];
  scenes: string[];
}

interface PlazaSection {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
  products: PlazaProduct[];
  sort_order: number;
}

interface Achievement {
  id: string;
  user_name: string;
  avatar?: string;
  action_type: string;
  action_desc: string;
  save_amount?: number;
  product_title?: string;
  product_image?: string;
  style_tag?: string;
  timestamp: string;
}

interface Review {
  id: string;
  product_id: string;
  product_title: string;
  product_image?: string;
  highlights: Array<{
    icon: string;
    label: string;
    value: string;
  }>;
  agent_summary?: string;
  rating: number;
}

interface WakeUp {
  id: string;
  type: string;
  title: string;
  description: string;
  related_product_id?: string;
  related_product_image?: string;
  cta_text: string;
  cta_link: string;
}

interface PlazaData {
  banner: {
    title: string;
    subtitle: string;
    theme: string;
    cta: {
      text: string;
      link: string;
    };
  };
  sections: PlazaSection[];
  achievements: Achievement[];
  reviews: Review[];
  wakeups: WakeUp[];
}

// 动画变体
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 }
  }
};

const SCROLL_TOP_OFFSET = 84;

function scrollToElementWithOffset(node: HTMLElement | null) {
  if (!node) return;
  const targetY = node.getBoundingClientRect().top + window.scrollY - SCROLL_TOP_OFFSET;
  window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
}

// API 调用
async function fetchPlazaData({
  sessionId,
  preferenceCategory,
  preferenceStyle,
  profileTags,
}: {
  sessionId?: string | null;
  preferenceCategory?: string;
  preferenceStyle?: string;
  profileTags?: string[];
}): Promise<PlazaData | null> {
  try {
    const params = new URLSearchParams();

    if (sessionId) {
      params.set('session_id', sessionId);
    }

    if (preferenceCategory) {
      params.set('preference_category', preferenceCategory);
    }
    if (preferenceStyle) {
      params.set('preference_style', preferenceStyle);
    }
    if (profileTags && profileTags.length > 0) {
      params.set('profile_tags', profileTags.join(','));
    }

    const query = params.toString();
    const response = await fetch(
      `${API_BASE_URL}/api/plaza/home${query ? `?${query}` : ''}`,
      { cache: 'no-store' }
    );
    const result = await response.json();
    if (result.code === 200) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch plaza data:', error);
    return null;
  }
}

export default function PlazaPage() {
  const [data, setData] = useState<PlazaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preference, setPreference] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<PlazaProduct | null>(null);
  const [pendingCategoryJump, setPendingCategoryJump] = useState<string | null>(null);
  const personalizedSectionRef = useRef<HTMLElement | null>(null);
  const categorySectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const sessionId = useChatStore((state) => state.sessionId);
  const userMemory = useMemoryStore((state) => state.userMemory);
  const loadUserMemory = useMemoryStore((state) => state.loadUserMemory);

  // Load user profile on mount
  useEffect(() => {
    if (!userMemory) {
      void loadUserMemory();
    }
  }, [userMemory, loadUserMemory]);

  // Derive the profile style from user's memory tags
  const profileStyle = useMemo(() => {
    if (!userMemory?.tags) return '';
    for (const tag of userMemory.tags) {
      if (PROFILE_TAG_TO_STYLE[tag.key]) {
        return PROFILE_TAG_TO_STYLE[tag.key];
      }
    }
    return '';
  }, [userMemory]);

  // Set of preference-button keys that match the user profile (for sparkle indicator)
  const profileMatchedPrefs = useMemo(() => {
    const matched = new Set<string>();
    if (!userMemory?.tags) return matched;
    for (const tag of userMemory.tags) {
      const pref = PROFILE_TAG_TO_PREF[tag.key];
      if (pref) matched.add(pref);
    }
    return matched;
  }, [userMemory]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Determine category & style to send, fusing clicked preference with profile
    let category: string | undefined;
    let style: string | undefined;

    if (preference) {
      // User explicitly clicked a tag — short-term intent takes priority
      if (CATEGORY_PREFERENCES.includes(preference)) {
        category = preference;
        // Fuse with profile style when category is clicked
        style = profileStyle || undefined;
      } else if (STYLE_PREFERENCES.includes(preference)) {
        // Style clicked — override profile style, no specific category
        style = preference;
      }
    } else if (profileStyle) {
      // No explicit click, but profile has style — auto-recommend
      style = profileStyle;
    }

    const profileTagKeys = userMemory?.tags?.map((t) => t.key) ?? [];

    const plazaData = await fetchPlazaData({
      sessionId,
      preferenceCategory: category,
      preferenceStyle: style,
      profileTags: profileTagKeys,
    });
    if (plazaData) {
      setData(plazaData);
    } else {
      setError('Failed to load plaza data');
    }

    setLoading(false);
  }, [preference, sessionId, profileStyle, userMemory]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // For style chips, scroll to personalized section after data updates.
  useEffect(() => {
    if (!preference || loading || !data || !STYLE_PREFERENCES.includes(preference)) {
      return;
    }

    const hasPersonalized = data.sections.some((section) => section.type === 'personalized');
    if (!hasPersonalized) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToElementWithOffset(personalizedSectionRef.current);
    });
  }, [preference, loading, data]);

  // For category chips, jump to the matching built-in category section.
  useEffect(() => {
    if (!pendingCategoryJump || loading || !data) {
      return;
    }

    requestAnimationFrame(() => {
      const target = categorySectionRefs.current[pendingCategoryJump];
      scrollToElementWithOffset(target);
      setPendingCategoryJump(null);
    });
  }, [pendingCategoryJump, loading, data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30">
        <Header />
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-indigo-600" />
            <p className="mt-4 text-slate-600">Loading Plaza...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30">
        <Header />
        <div className="flex h-[calc(100vh-64px)] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <ShoppingBag className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">Failed to Load</h2>
            <p className="mt-2 text-slate-600">{error || 'Something went wrong'}</p>
            <Button onClick={loadData} className="mt-6">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30">
      <Header />

      {/* Hero Banner */}
      <PlazaBanner banner={data.banner} />

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">

        {/* 偏好设置 (轻量个性化) */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600">I&apos;m interested in:</span>
            {PREFERENCE_OPTIONS.map((option) => {
              const isActive = preference === option;
              const isProfileMatch = profileMatchedPrefs.has(option.toLowerCase());
              return (
                <button
                  key={option}
                  onClick={() => {
                    const nextPreference = preference === option ? '' : option;
                    setPreference(nextPreference);

                    if (CATEGORY_PREFERENCES.includes(option) && nextPreference) {
                      setPendingCategoryJump(option);
                    }
                  }}
                  className={`relative rounded-full px-4 py-2 text-sm font-medium transition-all ${isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                      : isProfileMatch
                        ? 'bg-indigo-50 text-indigo-600 border border-indigo-300 ring-1 ring-indigo-200'
                        : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200'
                    }`}
                >
                  {isProfileMatch && (
                    <Sparkles className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-indigo-500" />
                  )}
                  {option}
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 商品分区 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          id="sections"
          className="space-y-16"
        >
          {data.sections.map((section) => (
            <motion.section
              key={section.id}
              variants={itemVariants}
              ref={section.type === 'personalized' ? (node) => {
                personalizedSectionRef.current = node;
              } : CATEGORY_PREFERENCES.includes(section.title) ? (node) => {
                categorySectionRefs.current[section.title] = node;
              } : undefined}
            >
              {/* 分区标题 */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold text-slate-900">{section.title}</h2>
                    {section.type === 'personalized' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                        <Sparkles className="h-3 w-3" />
                        AI Picks
                      </span>
                    )}
                  </div>
                  {section.subtitle && (
                    <p className="mt-1 text-slate-600">{section.subtitle}</p>
                  )}
                </div>
                <Link
                  href={`/chat?intent=browse_${section.type}`}
                  className="group flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  View More
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>

              {/* 商品网格 */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {section.products.map((product, idx) => (
                  <ProductCard
                    key={product.spu_id}
                    product={product}
                    index={idx}
                    onOpenDetails={setSelectedProduct}
                  />
                ))}
              </div>
            </motion.section>
          ))}
        </motion.div>

        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />

        {/* Agent 战绩流 */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Agent Wins</h2>
              <p className="text-slate-600">See how AI helped others find their ideal home</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.achievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        </motion.section>

        {/* 结构化评价 */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500">
              <Star className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Featured Reviews</h2>
              <p className="text-slate-600">Product highlights curated by AI Agent</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </motion.section>

        {/* 智能唤醒 */}
        {data.wakeups.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20"
          >
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-purple-500">
                <Bell className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Smart Reminders</h2>
                <p className="text-slate-600">Needs proactively discovered by AI Agent</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.wakeups.map((wakeup) => (
                <WakeUpCard key={wakeup.id} wakeup={wakeup} />
              ))}
            </div>
          </motion.section>
        )}

        {/* 底部 CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-center sm:p-12 lg:p-16">
            {/* 装饰 */}
            <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h2 className="mt-6 text-3xl font-bold text-white sm:text-4xl">
                Let AI Find Your Perfect Home
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-indigo-100">
                Describe your needs — our AI Agent will search, filter, negotiate, and build your personalized package
              </p>
              <Link
                href="/chat"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-xl transition-all hover:shadow-2xl hover:scale-105"
              >
                <MessageCircle className="h-5 w-5" />
                Start AI Chat
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-sm text-slate-500">
            © 2024 AI Home Assistant. AI-Powered Home Furnishing Discovery.
          </p>
        </div>
      </footer>
    </div>
  );
}
