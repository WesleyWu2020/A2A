'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MessageCircle, Heart, Star } from 'lucide-react';

interface Product {
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

interface ProductCardProps {
  product: Product;
  index: number;
  onOpenDetails?: (product: Product) => void;
}

export function ProductCard({ product, index, onOpenDetails }: ProductCardProps) {
  // 计算折扣
  const discount = product.price_original 
    ? Math.round((1 - product.price_current / product.price_original) * 100)
    : 0;

  // 生成导流链接
  const chatLink = `/chat?product_id=${product.spu_id}&intent=discuss_product&title=${encodeURIComponent(product.title)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-md shadow-slate-200/50 transition-shadow hover:shadow-xl"
      onClick={() => onOpenDetails?.(product)}
    >
      {/* 图片区域 */}
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-300" />
              <p className="mt-2 text-xs text-slate-500">{product.category}</p>
            </div>
          </div>
        )}

        {/* 标签 */}
        {product.tags.length > 0 && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
            {product.tags.map((tag, idx) => {
              // 根据标签类型设置颜色
              let bgColor = 'bg-slate-900/70';
              let textColor = 'text-white';
              
              if (tag === 'New') {
                bgColor = 'bg-emerald-500';
                textColor = 'text-white';
              } else if (tag === 'Hot') {
                bgColor = 'bg-rose-500';
                textColor = 'text-white';
              } else if (tag === 'Deal') {
                bgColor = 'bg-amber-500';
                textColor = 'text-white';
              } else if (tag.includes('Agent')) {
                bgColor = 'bg-indigo-500';
                textColor = 'text-white';
              }
              
              return (
                <span
                  key={idx}
                  className={`rounded-full ${bgColor} ${textColor} px-2 py-1 text-xs font-medium backdrop-blur-sm`}
                >
                  {tag}
                </span>
              );
            })}
          </div>
        )}

        {/* 折扣标签 */}
        {discount > 0 && (
          <div className="absolute right-3 top-3 rounded-full bg-rose-500 px-2 py-1 text-xs font-bold text-white">
            -{discount}%
          </div>
        )}

        {/* 收藏按钮 */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 opacity-0 transition-all hover:bg-white hover:text-rose-500 group-hover:opacity-100"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex flex-1 flex-col p-4">
        {/* 类目 */}
        <p className="text-xs text-slate-500">{product.category}</p>
        
        {/* 标题 */}
        <h3 className="mt-1 line-clamp-2 text-sm font-medium text-slate-900 group-hover:text-indigo-600">
          {product.title}
        </h3>

        {/* 风格标签 */}
        {product.styles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {product.styles.slice(0, 2).map((style, idx) => (
              <span
                key={idx}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
              >
                {style}
              </span>
            ))}
          </div>
        )}

        {/* 评分 */}
        {product.rating && (
          <div className="mt-2 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium text-slate-700">{product.rating}</span>
          </div>
        )}

        {/* 价格和操作 */}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-baseline gap-1">
            <span className="text-xs text-slate-500">{product.currency}</span>
            <span className="text-lg font-bold text-slate-900">
              {product.price_current.toFixed(0)}
            </span>
            {product.price_original && (
              <span className="text-xs text-slate-400 line-through">
                {product.price_original.toFixed(0)}
              </span>
            )}
          </div>
          
          <Link
            href={chatLink}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100"
          >
            <MessageCircle className="h-3 w-3" />
            Chat
          </Link>
        </div>
      </div>

      {/* 底部导流条 */}
      <Link
        href={chatLink}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <MessageCircle className="h-4 w-4" />
        Ask AI About This Product
      </Link>
    </motion.div>
  );
}
