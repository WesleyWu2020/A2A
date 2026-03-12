'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bell, RefreshCw, Tag, Lightbulb, ArrowRight } from 'lucide-react';

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

interface WakeUpCardProps {
  wakeup: WakeUp;
}

export function WakeUpCard({ wakeup }: WakeUpCardProps) {
  // 根据类型选择图标和颜色
  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'follow_up':
        return {
          icon: RefreshCw,
          bgColor: 'bg-violet-500',
          lightBg: 'bg-violet-50',
          borderColor: 'border-violet-200',
          textColor: 'text-violet-700',
          iconColor: 'text-violet-500'
        };
      case 'reminder':
        return {
          icon: Tag,
          bgColor: 'bg-rose-500',
          lightBg: 'bg-rose-50',
          borderColor: 'border-rose-200',
          textColor: 'text-rose-700',
          iconColor: 'text-rose-500'
        };
      case 'recommendation':
        return {
          icon: Lightbulb,
          bgColor: 'bg-amber-500',
          lightBg: 'bg-amber-50',
          borderColor: 'border-amber-200',
          textColor: 'text-amber-700',
          iconColor: 'text-amber-500'
        };
      default:
        return {
          icon: Bell,
          bgColor: 'bg-indigo-500',
          lightBg: 'bg-indigo-50',
          borderColor: 'border-indigo-200',
          textColor: 'text-indigo-700',
          iconColor: 'text-indigo-500'
        };
    }
  };

  const config = getTypeConfig(wakeup.type);
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -2 }}
      className={`group relative overflow-hidden rounded-2xl border-2 ${config.borderColor} ${config.lightBg} p-5 transition-shadow hover:shadow-lg`}
    >
      {/* 背景装饰 */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/50" />
      
      <div className="relative flex items-start gap-4">
        {/* 图标 */}
        <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${config.bgColor} text-white shadow-lg`}>
          <Icon className="h-6 w-6" />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h3 className={`text-base font-semibold ${config.textColor}`}>
            {wakeup.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            {wakeup.description}
          </p>

          {/* 相关商品预览 */}
          {wakeup.related_product_image && (
            <div className="mt-3 flex items-center gap-2">
              <img
                src={wakeup.related_product_image}
                alt="Related product"
                className="h-10 w-10 rounded-lg object-cover"
              />
            </div>
          )}

          {/* CTA 按钮 */}
          <Link
            href={wakeup.cta_link}
            className={`mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium ${config.textColor} shadow-sm transition-all hover:shadow-md`}
          >
            {wakeup.cta_text}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* AI 标识 */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 backdrop-blur-sm">
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500">
          <span className="text-[8px] font-bold text-white">AI</span>
        </div>
        <span className="text-[10px] text-slate-500">Smart Alert</span>
      </div>
    </motion.div>
  );
}
