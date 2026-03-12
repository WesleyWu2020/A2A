'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Check, Sparkles, ArrowRight, Package, TrendingDown, X, Star, Tag } from 'lucide-react';
import { Scheme } from '@/types';
import { PriceDisplay } from './PriceDisplay';
import { ProductCard } from './ProductCard';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface SchemeCardProps {
  scheme: Scheme;
  isSelected?: boolean;
  onSelect?: () => void;
  onViewNegotiation?: () => void;
  className?: string;
  variant?: 'default' | 'compact';
}

export function SchemeCard({
  scheme,
  isSelected = false,
  onSelect,
  onViewNegotiation,
  className,
  variant = 'default',
}: SchemeCardProps) {
  const [showProducts, setShowProducts] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const totalSavings = scheme.originalTotal - scheme.finalTotal;
  const savingsPercentage = Math.round((totalSavings / scheme.originalTotal) * 100);

  const selectedItem = selectedProductIndex !== null ? scheme.products[selectedProductIndex] : null;
  const selectedProduct = selectedItem?.product;
  const selectedImages = selectedProduct?.images || [];
  const itemSavings = selectedItem ? Math.max(selectedItem.originalPrice - selectedItem.finalPrice, 0) : 0;
  const itemSavingsPercent = selectedItem && selectedItem.originalPrice > 0
    ? Math.round((itemSavings / selectedItem.originalPrice) * 100)
    : 0;
  const attributeEntries = selectedProduct?.attributes
    ? Object.entries(selectedProduct.attributes).filter(([, value]) => Boolean(value))
    : [];

  if (variant === 'compact') {
    return (
      <motion.div
        whileHover={{ scale: 1.01 }}
        className={cn(
          'rounded-xl border-2 p-4 transition-all cursor-pointer',
          isSelected
            ? 'border-indigo-500 bg-indigo-50/50'
            : 'border-slate-200 bg-white hover:border-indigo-200'
        )}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full',
              isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
            )}>
              {isSelected ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{scheme.name}</h3>
              <p className="text-sm text-slate-500">{scheme.style} · {scheme.products.length} items</p>
            </div>
          </div>
          <div className="text-right">
            <PriceDisplay price={scheme.finalTotal} originalPrice={scheme.originalTotal} size="sm" />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={cn(
        'overflow-hidden rounded-2xl border-2 bg-white transition-all',
        isSelected
          ? 'border-indigo-500 shadow-xl shadow-indigo-500/10'
          : 'border-slate-200 shadow-lg hover:border-indigo-200',
        className
      )}
    >
      {/* Header */}
      <div className="relative">
        {/* Cover Image */}
        <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600">
          {scheme.coverImage ? (
            <Image
              src={scheme.coverImage}
              alt={scheme.name}
              fill
              className="object-cover opacity-80"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="h-20 w-20 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          
          {/* Savings Badge */}
          {savingsPercentage > 0 && (
            <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-sm font-bold text-white shadow-lg">
              <TrendingDown className="h-4 w-4" />
              Save {savingsPercentage}%
            </div>
          )}

          {/* Title Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex items-center gap-2">
              {isSelected && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-indigo-600">
                  <Check className="h-4 w-4" />
                </div>
              )}
              <h3 className="text-2xl font-bold text-white">{scheme.name}</h3>
            </div>
            <p className="mt-1 text-white/80">{scheme.style}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Price Summary */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
          <div>
            <p className="text-sm text-slate-500">Package Total</p>
            <PriceDisplay
              price={scheme.finalTotal}
              originalPrice={scheme.originalTotal}
              size="lg"
            />
          </div>
          {totalSavings > 0 && (
            <div className="text-right">
              <p className="text-sm text-slate-500">AI Negotiated Savings</p>
              <p className="text-lg font-semibold text-emerald-600">
                ${totalSavings.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Recommendation Reason */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-slate-900">Why We Recommend This</h4>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            {scheme.recommendationReason}
          </p>
        </div>

        {/* Products Toggle */}
        <button
          onClick={() => setShowProducts(!showProducts)}
          className="mt-4 flex w-full items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
        >
          <span>View Items ({scheme.products.length})</span>
          <motion.span
            animate={{ rotate: showProducts ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ArrowRight className="h-4 w-4 rotate-90" />
          </motion.span>
        </button>

        {/* Products List */}
        <motion.div
          initial={false}
          animate={{ height: showProducts ? 'auto' : 0, opacity: showProducts ? 1 : 0 }}
          className="overflow-hidden"
        >
          <div className="mt-4 space-y-3">
            {scheme.products.map((item) => (
              <ProductCard
                key={item.product.id}
                product={item.product}
                variant="compact"
                finalPrice={item.finalPrice}
                showNegotiation={item.finalPrice < item.originalPrice}
                onClick={() => {
                  const idx = scheme.products.findIndex((p) => p.product.id === item.product.id);
                  setSelectedProductIndex(idx >= 0 ? idx : 0);
                  setActiveImageIndex(0);
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {onViewNegotiation && (
            <button
              onClick={onViewNegotiation}
              className="flex-1 rounded-xl border-2 border-indigo-100 bg-white px-4 py-3 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              View Negotiation
            </button>
          )}
          {onSelect && (
            <button
              onClick={onSelect}
              className={cn(
                'flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                isSelected
                  ? 'bg-slate-100 text-slate-500 cursor-default'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40'
              )}
              disabled={isSelected}
            >
              {isSelected ? 'Selected' : 'Choose This Package'}
            </button>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedProductIndex(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
              <h3 className="text-lg font-semibold text-slate-900">Product Details</h3>
              <button
                onClick={() => setSelectedProductIndex(null)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close product details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-2">
              <div>
                <div className="relative h-72 w-full overflow-hidden rounded-xl bg-slate-100 md:h-96">
                  {selectedImages[activeImageIndex] ? (
                    <Image
                      src={selectedImages[activeImageIndex]}
                      alt={selectedProduct.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-10 w-10 text-slate-400" />
                    </div>
                  )}
                </div>
                {selectedImages.length > 1 && (
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {selectedImages.slice(0, 10).map((img, i) => (
                      <button
                        key={`${img}-${i}`}
                        onClick={() => setActiveImageIndex(i)}
                        className={cn(
                          'relative h-14 overflow-hidden rounded-lg border-2',
                          activeImageIndex === i ? 'border-indigo-500' : 'border-slate-200'
                        )}
                      >
                        <Image src={img} alt={`${selectedProduct.name} ${i + 1}`} fill className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xl font-semibold text-slate-900">{selectedProduct.name}</h4>
                <p className="mt-1 text-sm text-slate-500">{selectedProduct.category || 'Furniture'}</p>

                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>{selectedProduct.rating}</span>
                  <span>({selectedProduct.reviewCount} reviews)</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">SKU</p>
                    <p className="mt-1 font-medium text-slate-800">{selectedProduct.sku || selectedProduct.id}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Stock</p>
                    <p className="mt-1 font-medium text-slate-800">{selectedProduct.inStock ? 'In stock' : 'Out of stock'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Quantity in package</p>
                    <p className="mt-1 font-medium text-slate-800">{selectedItem.quantity}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Item savings</p>
                    <p className="mt-1 font-medium text-emerald-600">
                      {itemSavings > 0 ? `$${itemSavings.toFixed(2)} (${itemSavingsPercent}%)` : 'No discount'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <PriceDisplay
                    price={selectedItem.finalPrice}
                    originalPrice={selectedItem.originalPrice}
                    size="lg"
                  />
                  {selectedItem.originalPrice > selectedItem.finalPrice && (
                    <p className="mt-1 text-sm font-medium text-emerald-600">
                      You save ${(selectedItem.originalPrice - selectedItem.finalPrice).toFixed(2)}
                    </p>
                  )}
                </div>

                {selectedProduct.description && (
                  <div className="mt-5">
                    <h5 className="text-sm font-semibold text-slate-900">Description</h5>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{selectedProduct.description}</p>
                  </div>
                )}

                {selectedProduct.tags?.length > 0 && (
                  <div className="mt-5">
                    <h5 className="text-sm font-semibold text-slate-900">Style Tags</h5>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedProduct.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {attributeEntries.length > 0 && (
                  <div className="mt-5">
                    <h5 className="text-sm font-semibold text-slate-900">Specifications</h5>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      {attributeEntries.slice(0, 8).map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-slate-200 px-3 py-2">
                          <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
                          <p className="mt-1 line-clamp-2 text-slate-800">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
