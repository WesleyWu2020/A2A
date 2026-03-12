'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, TrendingDown, CheckCircle2, Zap, ArrowRight } from 'lucide-react';

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

interface AchievementCardProps {
  achievement: Achievement;
}

export function AchievementCard({ achievement }: AchievementCardProps) {
  // 根据动作类型选择图标和颜色
  const getIconConfig = (type: string) => {
    switch (type) {
      case 'save_money':
        return {
          icon: TrendingDown,
          bgColor: 'bg-emerald-100',
          textColor: 'text-emerald-600',
          label: 'Savings'
        };
      case 'complete_match':
        return {
          icon: CheckCircle2,
          bgColor: 'bg-indigo-100',
          textColor: 'text-indigo-600',
          label: 'Package Done'
        };
      case 'find_deal':
        return {
          icon: Zap,
          bgColor: 'bg-amber-100',
          textColor: 'text-amber-600',
          label: 'Deal Found'
        };
      default:
        return {
          icon: Sparkles,
          bgColor: 'bg-violet-100',
          textColor: 'text-violet-600',
          label: 'AI Pick'
        };
    }
  };

  const config = getIconConfig(achievement.action_type);
  const Icon = config.icon;

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // 导流链接
  const chatLink = `/chat?intent=generate_similar&style=${encodeURIComponent(achievement.style_tag || '')}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg"
    >
      {/* 顶部：用户信息和标签 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600 font-semibold">
            {achievement.user_name.charAt(0)}
          </div>
          
          <div>
            <p className="text-sm font-medium text-slate-900">
              {achievement.user_name}&apos;s Agent
            </p>
            <p className="text-xs text-slate-500">{formatTime(achievement.timestamp)}</p>
          </div>
        </div>

        {/* 类型标签 */}
        <div className={`flex items-center gap-1 rounded-full ${config.bgColor} px-2 py-1`}>
          <Icon className={`h-3 w-3 ${config.textColor}`} />
          <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
        </div>
      </div>

      {/* 内容描述 */}
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {achievement.action_desc}
        {achievement.save_amount && (
          <span className="font-semibold text-emerald-600">
            , saved ${achievement.save_amount}
          </span>
        )}
      </p>

      {/* 商品预览 */}
      {achievement.product_title && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          {achievement.product_image ? (
            <img
              src={achievement.product_image}
              alt={achievement.product_title}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100">
              <Sparkles className="h-5 w-5 text-indigo-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {achievement.product_title}
            </p>
            {achievement.style_tag && (
              <p className="text-xs text-slate-500">{achievement.style_tag}</p>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <Link
        href={chatLink}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-50 py-2.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-100 group-hover:bg-indigo-100"
      >
        Generate Similar Package
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}
