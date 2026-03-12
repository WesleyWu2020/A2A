'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Check,
  ArrowRight,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { Header } from '@/components/Header';
import { SchemeCard } from '@/components/SchemeCard';
import { NegotiationDialog } from '@/components/NegotiationDialog';
import { PageLoading } from '@/components/LoadingSpinner';
import { useSchemeStore, useOrderStore } from '@/store';
import { Scheme, NegotiationRecord } from '@/types';
import { API_BASE_URL } from '@/lib/api';

// Real product shape returned by /api/products/featured
interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  images: string[];
  category: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
}

// Enrich existing schemes (from chat AI) with real product images
function enrichSchemesWithImages(schemes: Scheme[], fp: FeaturedProduct[]): Scheme[] {
  if (fp.length === 0) return schemes;
  let imgIdx = 0;
  return schemes.map((scheme, si) => ({
    ...scheme,
    coverImage: scheme.coverImage || fp[si % fp.length]?.image,
    products: scheme.products.map((item) => {
      const hasImage = item.product.images && item.product.images.length > 0 && item.product.images[0];
      if (hasImage) return item;
      const real = fp[imgIdx % fp.length];
      imgIdx++;
      return {
        ...item,
        product: {
          ...item.product,
          images: real ? [real.image, ...real.images.slice(1, 3)] : [],
        },
      };
    }),
  }));
}

// Build a mock scheme injecting real product images
function buildMockSchemes(fp: FeaturedProduct[]): Scheme[] {
  // Spread real products across 3 schemes (4-5 each); fall back to empty images if not enough
  const get = (i: number) => fp[i] ?? null;

  const makeProduct = (
    i: number,
    id: string,
    name: string,
    desc: string,
    price: number,
    origPrice: number,
    category: string,
    tags: string[],
    rating: number,
    reviewCount: number,
    negRecord?: Scheme['products'][0]['negotiationRecord']
  ): Scheme['products'][0] => {
    const real = get(i);
    return {
      product: {
        id,
        name,
        description: desc,
        price,
        originalPrice: origPrice,
        images: real ? [real.image, ...real.images.slice(1, 3)] : [],
        category,
        tags,
        rating,
        reviewCount,
        inStock: true,
        sku: id,
        attributes: {},
      },
      quantity: 1,
      originalPrice: origPrice,
      finalPrice: price,
      negotiationRecord: negRecord,
    };
  };

  return [
    {
      id: 'scheme-1',
      name: 'Budget-Friendly Living Room Set',
      style: 'Modern Minimalist · Warm Tones',
      description: 'A functional, cozy setup that maximizes value without compromising style.',
      coverImage: get(0)?.image,
      products: [
        makeProduct(0, 'mock-sf-01', 'Modern Fabric Sofa 3-Seater', 'High-density foam cushions, easy-clean fabric, solid wood legs', 649, 849, 'Sofas', ['modern', 'fabric'], 4.8, 256, {
          id: 'neg-mock-01', productId: 'mock-sf-01', productName: 'Modern Fabric Sofa 3-Seater',
          originalPrice: 849, finalPrice: 649, discount: 24,
          strategy: 'Bulk purchase intent + New customer incentive',
          reason: 'Seller agreed to discount in exchange for a positive review commitment.',
          rounds: [
            { round: 1, buyerOffer: 599, sellerResponse: 789, sellerMessage: 'This is already our promotional price, very hard to go lower.' },
            { round: 2, buyerOffer: 649, sellerResponse: 669, sellerMessage: 'OK, $669 is our floor price — we\'ll throw in free white-glove delivery.' },
            { round: 3, buyerOffer: 649, sellerResponse: 649, sellerMessage: 'Deal! Please leave us a 5-star review!' },
          ],
          timestamp: new Date().toISOString(),
        }),
        makeProduct(1, 'mock-ct-01', 'Minimalist Coffee Table', 'Tempered glass top, powder-coated steel frame, hidden shelf', 179, 229, 'Tables', ['minimalist'], 4.6, 128),
        makeProduct(2, 'mock-lp-01', 'Arc Floor Lamp — Matte Black', 'Adjustable arc arm, 3-way dimmable, LED bulb included', 119, 159, 'Lighting', ['modern'], 4.7, 89),
      ],
      originalTotal: 1237,
      finalTotal: 947,
      totalDiscount: 290,
      recommendationReason: 'Best value package — every item AI-negotiated for 20-25% off list price. Clean modern aesthetic that works with any decor.',
    },
    {
      id: 'scheme-2',
      name: 'Mid-Century Modern Collection',
      style: 'Mid-Century · Walnut & Cognac',
      description: 'Timeless design meets modern comfort — curated pieces with lasting appeal.',
      coverImage: get(3)?.image,
      products: [
        makeProduct(3, 'mock-sf-02', 'Mid-Century Velvet Sectional Sofa', 'Premium velvet upholstery, solid walnut legs, L-shape', 1099, 1499, 'Sofas', ['mid-century', 'velvet'], 4.9, 312, {
          id: 'neg-mock-02', productId: 'mock-sf-02', productName: 'Mid-Century Velvet Sectional Sofa',
          originalPrice: 1499, finalPrice: 1099, discount: 27,
          strategy: 'Seasonal clearance + loyalty bundle',
          reason: 'Seller offered 27% off to clear inventory before new season arrivals.',
          rounds: [
            { round: 1, buyerOffer: 950, sellerResponse: 1350, sellerMessage: 'This premium velvet collection rarely goes on discount.' },
            { round: 2, buyerOffer: 1099, sellerResponse: 1150, sellerMessage: 'I can do $1,150 with free throw pillows included.' },
            { round: 3, buyerOffer: 1099, sellerResponse: 1099, sellerMessage: 'Alright, $1,099 it is! You\'re getting a steal.' },
          ],
          timestamp: new Date().toISOString(),
        }),
        makeProduct(4, 'mock-ct-02', 'Solid Walnut Coffee Table', 'Hand-finished solid walnut, tapered brass legs', 389, 529, 'Tables', ['mid-century', 'walnut'], 4.7, 156),
        makeProduct(5, 'mock-sc-01', 'Cognac Leather Accent Chair', 'Top-grain leather, swivel base, memory foam cushion', 499, 649, 'Chairs', ['mid-century', 'leather'], 4.8, 201),
        makeProduct(6, 'mock-lp-02', 'Tripod Floor Lamp — Walnut & Brass', 'Walnut tripod base, aged brass fittings, linen shade', 169, 229, 'Lighting', ['mid-century'], 4.8, 67),
      ],
      originalTotal: 2906,
      finalTotal: 2156,
      totalDiscount: 750,
      recommendationReason: 'Premium mid-century collection with the highest total savings. AI secured near-wholesale pricing through multi-round negotiation.',
    },
    {
      id: 'scheme-3',
      name: 'Scandinavian Premium Package',
      style: 'Scandinavian · Natural Oak',
      description: 'Nordic-inspired artisan craftsmanship with timeless elegance.',
      coverImage: get(7)?.image,
      products: [
        makeProduct(7, 'mock-sf-03', 'Italian Leather Modular Sofa', 'Full-grain Italian leather, customizable modules, 10-year warranty', 2499, 3299, 'Sofas', ['luxury', 'leather'], 4.9, 145, {
          id: 'neg-mock-03', productId: 'mock-sf-03', productName: 'Italian Leather Modular Sofa',
          originalPrice: 3299, finalPrice: 2499, discount: 24,
          strategy: 'VIP wholesale access + showroom floor model',
          reason: 'AI Buyer Agent accessed wholesale pricing reserved for interior designers.',
          rounds: [
            { round: 1, buyerOffer: 2200, sellerResponse: 3100, sellerMessage: 'Italian leather at this quality is rarely discounted.' },
            { round: 2, buyerOffer: 2499, sellerResponse: 2700, sellerMessage: 'We can offer the floor model at $2,700 — same quality, in stock now.' },
            { round: 3, buyerOffer: 2499, sellerResponse: 2499, sellerMessage: 'You drive a hard bargain! $2,499 and we\'ll include a leather care kit.' },
          ],
          timestamp: new Date().toISOString(),
        }),
        makeProduct(8, 'mock-ct-03', 'Carrara Marble & Brass Coffee Table', 'Genuine Carrara marble top, brushed brass base', 899, 1199, 'Tables', ['luxury', 'marble'], 4.8, 93),
        makeProduct(9, 'mock-bk-01', 'Solid White Oak Bookshelf 6-Tier', 'Solid white oak, dovetail joinery, natural wax finish', 749, 999, 'Storage', ['scandinavian', 'oak'], 4.9, 178),
        makeProduct(10, 'mock-lp-03', 'Designer Pendant Cluster Light', 'Hand-blown glass globes, aged brass, dimmable LED', 579, 779, 'Lighting', ['luxury', 'pendant'], 4.7, 54),
      ],
      originalTotal: 6276,
      finalTotal: 4726,
      totalDiscount: 1550,
      recommendationReason: 'Top-tier Scandinavian collection with premium materials. AI accessed exclusive wholesale pricing channels.',
    },
  ];
}

export default function SchemesPage() {
  const router = useRouter();
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [negotiationRecord, setNegotiationRecord] = useState<NegotiationRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { schemes, setSchemes, selectScheme, selectedScheme } = useSchemeStore();
  const { setCurrentOrder } = useOrderStore();

  // Load schemes: always fetch real product images to populate/enrich scheme cards.
  // If AI schemes are already in the store, enrich their product images.
  // Otherwise build demo mock schemes with real product images.
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/products/featured?limit=12`)
      .then(r => r.json())
      .then(res => {
        const fp: FeaturedProduct[] = (res.code === 200 && res.data?.products)
          ? res.data.products
          : [];
        if (schemes.length > 0) {
          setSchemes(enrichSchemesWithImages(schemes, fp));
        } else {
          setSchemes(buildMockSchemes(fp));
        }
      })
      .catch(() => {
        if (schemes.length === 0) setSchemes(buildMockSchemes([]));
      })
      .finally(() => {
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选择方案
  const handleSelectScheme = (scheme: Scheme) => {
    setSelectedSchemeId(scheme.id);
    selectScheme(scheme);
  };

  // 查看议价记录
  const handleViewNegotiation = (scheme: Scheme) => {
    // 找到第一个有议价记录的商品
    const productWithNegotiation = scheme.products.find(p => p.negotiationRecord);
    if (productWithNegotiation?.negotiationRecord) {
      setNegotiationRecord(productWithNegotiation.negotiationRecord);
      setIsDialogOpen(true);
    }
  };

  // 确认下单
  const handleConfirmOrder = () => {
    if (selectedScheme) {
      // 创建临时订单数据
      const mockOrder = {
        id: `order-${Date.now()}`,
        userId: 'user-1',
        items: selectedScheme.products.map(p => ({
          productId: p.product.id,
          productName: p.product.name,
          productImage: p.product.images[0] || '',
          price: p.finalPrice,
          quantity: p.quantity,
        })),
        status: 'pending' as const,
        totalAmount: selectedScheme.finalTotal,
        shippingAddress: {
          id: 'addr-1',
          name: '',
          phone: '',
          province: '',
          city: '',
          district: '',
          detail: '',
          isDefault: true,
        },
        paymentMethod: 'alipay',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      setCurrentOrder(mockOrder);
      router.push('/order');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-bold text-slate-900"
              >
                Your AI-Curated Packages
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-2 text-slate-600"
              >
                AI generated {schemes.length} packages, saving you{' '}
                <span className="font-semibold text-emerald-600">
                  ${schemes.reduce((sum, s) => sum + s.totalDiscount, 0).toLocaleString()}
                </span>
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex gap-3"
            >
              <button
                onClick={() => router.push('/chat')}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                New Chat
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </motion.div>
          </div>

          {/* Schemes Grid */}
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {schemes.map((scheme, index) => (
              <motion.div
                key={scheme.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <SchemeCard
                  scheme={scheme}
                  isSelected={selectedSchemeId === scheme.id}
                  onSelect={() => handleSelectScheme(scheme)}
                  onViewNegotiation={() => handleViewNegotiation(scheme)}
                />
              </motion.div>
            ))}
          </div>

          {/* Summary & Action */}
          {selectedScheme && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 rounded-2xl bg-white p-6 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Selected: {selectedScheme.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      Total ${selectedScheme.finalTotal.toLocaleString()} ·
                      Saved ${selectedScheme.totalDiscount.toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleConfirmOrder}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-105"
                >
                  Confirm Order
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Tips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 rounded-xl bg-indigo-50 p-4"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 flex-shrink-0 text-indigo-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-indigo-900">AI Tip</h4>
                <p className="mt-1 text-sm text-indigo-700">
                  Every item in these packages has been negotiated by your AI Buyer Agent.
                  Click &ldquo;View Negotiation&rdquo; to see the full price negotiation history.
                  You can also click &ldquo;New Chat&rdquo; to refine your requirements.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Negotiation Dialog */}
      <NegotiationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        record={negotiationRecord}
      />
    </div>
  );
}
