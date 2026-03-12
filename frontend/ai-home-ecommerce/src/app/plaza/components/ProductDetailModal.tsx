'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, MessageCircle, Tag, Images } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

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

interface ProductDetailModalProps {
  product: PlazaProduct | null;
  onClose: () => void;
}

interface ProductDetailResponse {
  id: string;
  spu_id: string;
  title: string;
  category: { l1?: string; l2?: string; l3?: string };
  price: { current?: number; original?: number; currency?: string };
  attributes: {
    styles?: string[];
    materials?: string[];
    colors?: string[];
    scenes?: string[];
  };
  inventory?: number;
  images?: string[];
  description?: string;
  rating?: number;
  review_count?: number;
  source_url?: string;
}

function htmlToPlainText(input?: string): string {
  if (!input) return '';
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseDescriptionSections(raw?: string): {
  summary: string;
  highlights: Array<{ label: string; text: string }>;
  notes: string[];
} {
  const plain = htmlToPlainText(raw);
  if (!plain) {
    return { summary: '', highlights: [], notes: [] };
  }

  const paragraphs = plain
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const summary = paragraphs[0] || '';
  const highlights: Array<{ label: string; text: string }> = [];
  const notes: string[] = [];

  for (const p of paragraphs.slice(1)) {
    const match = p.match(/^【([^】]+)】\s*(.+)$/);
    if (match) {
      highlights.push({ label: match[1], text: match[2] });
    } else {
      notes.push(p);
    }
  }

  return { summary, highlights, notes };
}

export function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  const isOpen = !!product;
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryLoaded, setGalleryLoaded] = useState(false);

  useEffect(() => {
    if (!product) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }
    const spuId = product.spu_id;
    let cancelled = false;
    async function loadDetail() {
      setLoadingDetail(true);
      setDetail(null);
      try {
        const resp = await fetch(`${API_BASE_URL}/api/products/${spuId}`, { cache: 'no-store' });
        const raw = await resp.json();
        if (!cancelled && raw?.code === 200 && raw?.data) {
          setDetail(raw.data as ProductDetailResponse);
        }
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [product]);

  useEffect(() => {
    setActiveImageIndex(0);
    setGalleryLoaded(false);
  }, [product?.spu_id]);

  if (!product) return null;

  const chatLink = `/chat?product_id=${product.spu_id}&intent=discuss_product&title=${encodeURIComponent(product.title)}`;
  const currentPrice = detail?.price?.current ?? product.price_current;
  const originalPrice = detail?.price?.original ?? product.price_original;
  const currency = detail?.price?.currency ?? product.currency;
  const displayImages = detail?.images && detail.images.length > 0
    ? detail.images.slice(0, 8)
    : (product.image ? [product.image] : []);
  const discount = originalPrice
    ? Math.round((1 - currentPrice / originalPrice) * 100)
    : 0;
  const savingsAmount = originalPrice && originalPrice > currentPrice ? (originalPrice - currentPrice) : 0;
  const materials = detail?.attributes?.materials || [];
  const colors = detail?.attributes?.colors || [];
  const mergedStyles = detail?.attributes?.styles?.length ? detail.attributes.styles : product.styles;
  const mergedScenes = detail?.attributes?.scenes?.length ? detail.attributes.scenes : product.scenes;
  const parsedDescription = parseDescriptionSections(detail?.description);
  const reviewCount = detail?.review_count;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Product Details</h3>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-2">
              <div>
                <div className="relative h-72 overflow-hidden rounded-xl bg-slate-100 md:h-96">
                  {displayImages[activeImageIndex] ? (
                    <Image src={displayImages[activeImageIndex]} alt={product.title} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">No image</div>
                  )}
                </div>
                {displayImages.length > 1 && (
                  <div className="mt-3 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{displayImages.length} photos</p>
                      {!galleryLoaded ? (
                        <button
                          onClick={() => setGalleryLoaded(true)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          <Images className="h-3.5 w-3.5" />
                          Load gallery
                        </button>
                      ) : (
                        <button
                          onClick={() => setGalleryLoaded(false)}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          Hide gallery
                        </button>
                      )}
                    </div>

                    {galleryLoaded && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {displayImages.map((img, idx) => (
                          <button
                            key={`${img}-${idx}`}
                            onClick={() => setActiveImageIndex(idx)}
                            className={`relative h-14 overflow-hidden rounded-lg border-2 ${activeImageIndex === idx ? 'border-indigo-500' : 'border-slate-200'}`}
                          >
                            <Image src={img} alt={`${product.title} ${idx + 1}`} fill className="object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm text-slate-500">{detail?.category?.l1 || product.category}</p>
                <h4 className="mt-1 text-xl font-semibold text-slate-900">{product.title}</h4>
                <p className="mt-1 text-xs text-slate-500">Product ID: {product.spu_id}</p>

                {typeof product.rating === 'number' && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span>{product.rating.toFixed(1)}</span>
                    {typeof reviewCount === 'number' && <span>({reviewCount} reviews)</span>}
                  </div>
                )}

                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-slate-500">{currency}</span>
                    <span className="text-2xl font-bold text-slate-900">{currentPrice.toFixed(0)}</span>
                    {originalPrice && (
                      <span className="text-sm text-slate-400 line-through">{originalPrice.toFixed(0)}</span>
                    )}
                  </div>
                  {discount > 0 && (
                    <p className="mt-1 text-sm font-medium text-rose-600">Save {discount}%</p>
                  )}
                  {savingsAmount > 0 && (
                    <p className="text-sm text-emerald-600">You save {currency} {savingsAmount.toFixed(2)}</p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Availability</p>
                    <p className="mt-1 font-medium text-slate-800">
                      {typeof detail?.inventory === 'number' ? `${detail.inventory} in stock` : 'In stock'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Price tier</p>
                    <p className="mt-1 font-medium text-slate-800">
                      {currentPrice >= 1500 ? 'Premium' : currentPrice >= 500 ? 'Mid-range' : 'Value'}
                    </p>
                  </div>
                </div>

                {loadingDetail && (
                  <p className="mt-3 text-xs text-slate-500">Loading more product details...</p>
                )}

                {parsedDescription.summary && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
                    <p className="mt-2 line-clamp-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                      {parsedDescription.summary}
                    </p>
                  </div>
                )}

                {parsedDescription.highlights.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Highlights</p>
                    <div className="mt-2 space-y-2">
                      {parsedDescription.highlights.slice(0, 3).map((item) => (
                        <div key={item.label} className="rounded-lg border border-slate-200 p-3">
                          <p className="text-xs font-semibold text-indigo-700">{item.label}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-700">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(product.tags.length > 0 || mergedStyles.length > 0 || mergedScenes.length > 0 || materials.length > 0 || colors.length > 0) && (
                  <div className="mt-4 space-y-3">
                    {product.tags.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {product.tags.map((tag, idx) => (
                            <span key={`${tag}-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                              <Tag className="h-3 w-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {mergedStyles.length > 0 && (
                      <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Styles:</span> {mergedStyles.slice(0, 3).join(', ')}</p>
                    )}
                    {mergedScenes.length > 0 && (
                      <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Best for:</span> {mergedScenes.slice(0, 3).join(', ')}</p>
                    )}
                    {materials.length > 0 && (
                      <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Materials:</span> {materials.slice(0, 3).join(', ')}</p>
                    )}
                    {colors.length > 0 && (
                      <p className="text-sm text-slate-600"><span className="font-medium text-slate-800">Colors:</span> {colors.slice(0, 4).join(', ')}</p>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  <Link
                    href={chatLink}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-shadow hover:shadow-lg"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Ask AI About This Product
                  </Link>
                  {detail?.source_url && (
                    <a
                      href={detail.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-3 inline-flex items-center rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      View Source
                    </a>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
