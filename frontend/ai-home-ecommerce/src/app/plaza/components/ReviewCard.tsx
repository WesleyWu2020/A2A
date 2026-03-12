'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Star, 
  Box, 
  Palette, 
  Truck, 
  Home, 
  Sparkles, 
  Leaf,
  MessageCircle,
  ArrowRight
} from 'lucide-react';

interface Highlight {
  icon: string;
  label: string;
  value: string;
}

interface Review {
  id: string;
  product_id: string;
  product_title: string;
  product_image?: string;
  highlights: Highlight[];
  agent_summary?: string;
  rating: number;
}

interface ReviewCardProps {
  review: Review;
}

// 图标映射
const iconMap: Record<string, React.ElementType> = {
  material: Box,
  style: Palette,
  delivery: Truck,
  space: Home,
  feature: Sparkles,
  eco: Leaf,
};

export function ReviewCard({ review }: ReviewCardProps) {
  // 导流链接
  const chatLink = `/chat?product_id=${review.product_id}&intent=discuss_product`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -2 }}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg"
    >
      {/* 商品信息头部 */}
      <div className="flex items-start gap-3 p-4">
        {review.product_image ? (
          <img
            src={review.product_image}
            alt={review.product_title}
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
            <Box className="h-7 w-7 text-emerald-500" />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="line-clamp-2 text-sm font-medium text-slate-900">
            {review.product_title}
          </h3>
          
          {/* 评分 */}
          <div className="mt-1 flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${
                  i < Math.floor(review.rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-slate-200 text-slate-200'
                }`}
              />
            ))}
            <span className="ml-1 text-xs font-medium text-slate-700">
              {review.rating.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* 结构化亮点 */}
      <div className="flex-1 px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {review.highlights.map((highlight, idx) => {
            const Icon = iconMap[highlight.icon] || Sparkles;
            
            // 根据类型选择颜色
            let bgColor = 'bg-slate-50';
            let textColor = 'text-slate-700';
            let iconColor = 'text-slate-500';
            
            if (highlight.icon === 'material') {
              bgColor = 'bg-amber-50';
              textColor = 'text-amber-700';
              iconColor = 'text-amber-500';
            } else if (highlight.icon === 'style') {
              bgColor = 'bg-indigo-50';
              textColor = 'text-indigo-700';
              iconColor = 'text-indigo-500';
            } else if (highlight.icon === 'delivery') {
              bgColor = 'bg-emerald-50';
              textColor = 'text-emerald-700';
              iconColor = 'text-emerald-500';
            } else if (highlight.icon === 'eco') {
              bgColor = 'bg-green-50';
              textColor = 'text-green-700';
              iconColor = 'text-green-500';
            }
            
            return (
              <div
                key={idx}
                className={`flex items-center gap-1.5 rounded-lg ${bgColor} px-2.5 py-1.5`}
              >
                <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500">{highlight.label}</span>
                  <span className={`text-xs font-medium ${textColor}`}>{highlight.value}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Agent 总结 */}
        {review.agent_summary && (
          <div className="mt-3 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 p-3">
            <div className="flex items-start gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100">
                <Sparkles className="h-3 w-3 text-indigo-600" />
              </div>
              <p className="text-xs leading-relaxed text-indigo-800">
                {review.agent_summary}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 底部 CTA */}
      <Link
        href={chatLink}
        className="flex items-center justify-center gap-2 border-t border-slate-100 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
      >
        <MessageCircle className="h-4 w-4" />
        Learn About This Product
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}
