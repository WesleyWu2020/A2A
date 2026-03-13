'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Star, Package, Tag } from 'lucide-react';
import { Product } from '@/types';
import { PriceDisplay } from './PriceDisplay';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  variant?: 'default' | 'compact' | 'horizontal';
  className?: string;
  onClick?: () => void;
  showNegotiation?: boolean;
  finalPrice?: number;
}

export function ProductCard({
  product,
  variant = 'default',
  className,
  onClick,
  showNegotiation = false,
  finalPrice,
}: ProductCardProps) {
  const discount = product.originalPrice 
    ? Math.round(((product.originalPrice - (finalPrice || product.price)) / product.originalPrice) * 100)
    : 0;

  if (variant === 'compact') {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer',
          className
        )}
      >
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-6 w-6 text-slate-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="truncate text-sm font-medium text-slate-900">{product.name}</h4>
          <div className="mt-1 flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="text-xs text-slate-500">{product.rating}</span>
          </div>
          <div className="mt-1">
            <PriceDisplay
              price={finalPrice || product.price}
              originalPrice={product.originalPrice || product.price}
              size="sm"
            />
          </div>
        </div>
      </motion.div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <motion.div
        whileHover={{ scale: 1.01 }}
        onClick={onClick}
        className={cn(
          'flex gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer',
          className
        )}
      >
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-8 w-8 text-slate-400" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-slate-900 line-clamp-2">{product.name}</h3>
              {showNegotiation && discount > 0 && (
                <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  -{discount}%
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500 line-clamp-1">{product.category}</p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="text-sm text-slate-600">{product.rating}</span>
              <span className="text-xs text-slate-400">({product.reviewCount})</span>
            </div>
            <PriceDisplay
              price={finalPrice || product.price}
              originalPrice={product.originalPrice || product.price}
              size="md"
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_-8px_rgba(99,102,241,0.15)] cursor-pointer',
        className
      )}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-12 w-12 text-slate-400" />
          </div>
        )}
        
        {/* Discount Badge */}
        {showNegotiation && discount > 0 && (
          <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
            <Tag className="h-3 w-3" />
            -{discount}%
          </div>
        )}

        {/* In Stock Badge */}
        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-slate-900 line-clamp-2 flex-1">{product.name}</h3>
        </div>
        
        <p className="mt-1 text-sm text-slate-500 line-clamp-1">{product.category}</p>
        
        {/* Rating */}
        <div className="mt-2 flex items-center gap-1">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={cn(
                  'h-3.5 w-3.5',
                  i < Math.floor(product.rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-slate-200 text-slate-200'
                )}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500">({product.reviewCount})</span>
        </div>

        {/* Price */}
        <div className="mt-3">
          <PriceDisplay
            price={finalPrice || product.price}
            originalPrice={product.originalPrice || product.price}
            size="lg"
          />
        </div>

        {/* Tags */}
        {product.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {product.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
