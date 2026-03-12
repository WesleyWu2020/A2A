'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Sparkles,
  MessageCircle,
  Zap,
  Shield,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { API_BASE_URL } from '@/lib/api';

interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  rating: number;
}

// 浮动产品卡片 with real image
function FloatingCard({
  children,
  className,
  delay = 0
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -8, scale: 1.02 }}
      className={className}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// Real product image card
function RealProductCard({
  product,
  size,
  delay,
  className,
  badge,
}: {
  product: FeaturedProduct;
  size: 'lg' | 'md' | 'sm';
  delay: number;
  className: string;
  badge?: string;
}) {
  const dims = size === 'lg' ? 'h-48 w-48' : size === 'md' ? 'h-36 w-36' : 'h-28 w-28';
  const discount = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <FloatingCard delay={delay} className={className}>
      <div className={`${dims} overflow-hidden rounded-2xl shadow-xl bg-white relative`}>
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-semibold text-white leading-tight">{product.name}</p>
          <p className="text-xs text-white/80">${product.price.toFixed(0)}</p>
        </div>
        {(badge || discount > 0) && (
          <div className="absolute top-2 right-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-xs font-bold text-white shadow">
            {badge || `-${discount}%`}
          </div>
        )}
      </div>
    </FloatingCard>
  );
}

// 商品卡片拼贴效果 — uses real products from PostgreSQL
function ProductMosaic() {
  const [products, setProducts] = useState<FeaturedProduct[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/products/featured?limit=4`)
      .then(r => r.json())
      .then(res => {
        if (res.code === 200 && res.data?.products) {
          setProducts(res.data.products);
        }
      })
      .catch(() => {});
  }, []);

  // Skeleton placeholders while loading
  const placeholders = [
    { size: 'lg' as const, delay: 0.2, className: 'absolute left-0 top-0', badge: 'AI Pick' },
    { size: 'md' as const, delay: 0.4, className: 'absolute right-0 top-4', badge: undefined },
    { size: 'md' as const, delay: 0.6, className: 'absolute right-8 bottom-0', badge: undefined },
    { size: 'sm' as const, delay: 0.8, className: 'absolute left-4 bottom-8', badge: undefined },
  ];

  return (
    <div className="relative h-[400px] w-full max-w-lg">
      {placeholders.map((ph, i) => {
        const p = products[i];
        if (!p) {
          // Show gradient placeholder while loading
          const dims = ph.size === 'lg' ? 'h-48 w-48' : ph.size === 'md' ? 'h-36 w-36' : 'h-28 w-28';
          return (
            <FloatingCard key={i} delay={ph.delay} className={ph.className}>
              <div className={`${dims} rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 animate-pulse shadow-xl`} />
            </FloatingCard>
          );
        }
        return (
          <RealProductCard
            key={p.id}
            product={p}
            size={ph.size}
            delay={ph.delay}
            className={ph.className}
            badge={i === 0 ? 'AI Pick' : undefined}
          />
        );
      })}

      {/* Decorative elements */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute -right-4 top-1/2 h-8 w-8 rounded-full border-4 border-dashed border-indigo-200"
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute left-1/2 -bottom-4 h-4 w-4 rounded-full bg-amber-400"
      />
    </div>
  );
}

// 特性卡片
function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  delay 
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4 }}
      className="group rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/50 transition-shadow hover:shadow-xl"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25 transition-transform group-hover:scale-110">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </motion.div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 pt-16 sm:px-6 lg:px-8">
        {/* Background Decorations */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />
          <div className="absolute -right-1/4 top-1/4 h-96 w-96 rounded-full bg-violet-100/50 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/50 px-4 py-2"
              >
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-700">AI-Powered Home Furnishing Assistant</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl"
              >
                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  AI Does the Work,
                </span>
                <br />
                You Get the Home
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-6 text-lg leading-relaxed text-slate-600"
              >
                Just describe what you need. Our AI agents search, filter, negotiate prices, and generate your ideal home furnishing packages — automatically.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              >
                <Link
                  href="/chat"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:scale-105"
                >
                  <MessageCircle className="h-5 w-5" />
                  Get Started
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-700 transition-all hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  Learn More
                </Link>
              </motion.div>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mt-12 flex items-center justify-center lg:justify-start gap-8"
              >
                <div>
                  <p className="text-3xl font-bold text-indigo-600">4,500+</p>
                  <p className="text-sm text-slate-500">Products</p>
                </div>
                <div className="h-12 w-px bg-slate-200" />
                <div>
                  <p className="text-3xl font-bold text-violet-600">30%</p>
                  <p className="text-sm text-slate-500">Avg. Savings</p>
                </div>
                <div className="h-12 w-px bg-slate-200" />
                <div>
                  <p className="text-3xl font-bold text-emerald-600">&lt;5 min</p>
                  <p className="text-sm text-slate-500">To Your Package</p>
                </div>
              </motion.div>
            </div>

            {/* Right Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex justify-center lg:justify-end"
            >
              <ProductMosaic />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="how-it-works" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              How Our AI Agents Work
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Multi-agent collaboration for end-to-end home furnishing — from search to delivery
            </p>
          </motion.div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Zap}
              title="Smart Requirement Analysis"
              description="AI understands your style, budget, and functional needs — no forms to fill, just chat"
              delay={0}
            />
            <FeatureCard
              icon={Sparkles}
              title="Catalog-Wide Search"
              description="Searches 4,500+ Homary products instantly, filtering by your exact preferences"
              delay={0.1}
            />
            <FeatureCard
              icon={MessageCircle}
              title="AI Price Negotiation"
              description="Our Buyer Agent negotiates with sellers to secure the best prices and deals for you"
              delay={0.2}
            />
            <FeatureCard
              icon={Shield}
              title="Quality Assurance"
              description="Auto-filters high-rated items, analyzes reviews, and ensures product reliability"
              delay={0.3}
            />
            <FeatureCard
              icon={Zap}
              title="3 Curated Packages"
              description="Get three distinct packages at different price points — budget, mid-range, and premium"
              delay={0.4}
            />
            <FeatureCard
              icon={Sparkles}
              title="One-Click Order"
              description="Pick your package and place the order instantly — we handle the rest"
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-center sm:p-12 lg:p-16"
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Furnish Your Home the Smart Way?
          </h2>
          <p className="mt-4 text-lg text-indigo-100">
            Start a conversation now and let AI find your perfect home furnishing package
          </p>
          <Link
            href="/chat"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-xl transition-all hover:shadow-2xl hover:scale-105"
          >
            <MessageCircle className="h-5 w-5" />
            Start AI Chat
            <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-sm text-slate-500">
            © 2024 AI Home Assistant. Smarter home furnishing, powered by AI.
          </p>
        </div>
      </footer>
    </div>
  );
}
