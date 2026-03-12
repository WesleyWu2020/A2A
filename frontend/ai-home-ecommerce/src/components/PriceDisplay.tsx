'use client';

import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  size?: 'sm' | 'md' | 'lg';
  showDiscount?: boolean;
  className?: string;
  currency?: string;
}

export function PriceDisplay({
  price,
  originalPrice,
  size = 'md',
  showDiscount = true,
  className,
  currency = '$',
}: PriceDisplayProps) {
  const discount = originalPrice && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const sizeClasses = {
    sm: {
      price: 'text-sm font-semibold',
      original: 'text-xs',
      discount: 'text-[10px]',
    },
    md: {
      price: 'text-base font-semibold',
      original: 'text-sm',
      discount: 'text-xs',
    },
    lg: {
      price: 'text-xl font-bold',
      original: 'text-sm',
      discount: 'text-xs',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Current Price */}
      <span className={cn('text-indigo-600', classes.price)}>
        {currency}{price.toLocaleString()}
      </span>

      {/* Original Price */}
      {originalPrice && originalPrice > price && (
        <span className={cn('text-slate-400 line-through', classes.original)}>
          {currency}{originalPrice.toLocaleString()}
        </span>
      )}

      {/* Discount Badge */}
      {showDiscount && discount > 0 && (
        <span className={cn(
          'rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 font-medium text-white',
          classes.discount
        )}>
          -{discount}%
        </span>
      )}
    </div>
  );
}
