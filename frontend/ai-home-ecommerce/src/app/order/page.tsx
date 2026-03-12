'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check,
  Package,
  Truck,
  Home,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  FileText,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Header } from '@/components/Header';
import { PriceDisplay } from '@/components/PriceDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useOrderStore, useSchemeStore } from '@/store';
import { OrderStatus, FulfillmentStatus } from '@/types';
import { cn } from '@/lib/utils';

// 履约状态配置
const fulfillmentStages: FulfillmentStatus[] = [
  { stage: 'ordered', label: 'Order Confirmed', description: 'Your order has been placed', completed: true },
  { stage: 'preparing', label: 'Preparing', description: 'Items being prepared for shipment', completed: false },
  { stage: 'shipped', label: 'Shipped', description: 'Package is on its way', completed: false },
  { stage: 'delivering', label: 'Out for Delivery', description: 'Arriving at your address soon', completed: false },
  { stage: 'delivered', label: 'Delivered', description: 'Order complete!', completed: false },
];

// 表单输入组件
function FormInput({
  label,
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: React.ElementType }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          {...props}
          className={cn(
            'w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm',
            'placeholder:text-slate-400',
            'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
            props.className
          )}
        />
      </div>
    </div>
  );
}

// 订单成功页面
function OrderSuccess({ order }: { order: { id: string; totalAmount: number } }) {
  const router = useRouter();
  const [currentStage, setCurrentStage] = useState(0);

  // 模拟履约状态更新
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev < fulfillmentStages.length - 1) {
          return prev + 1;
        }
        clearInterval(interval);
        return prev;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Success Header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-center text-white shadow-xl"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20"
        >
          <CheckCircle2 className="h-10 w-10 text-white" />
        </motion.div>
        <h2 className="mt-6 text-2xl font-bold">Order Placed Successfully!</h2>
        <p className="mt-2 text-emerald-100">
          Order ID: {order.id}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2">
          <span className="text-sm">Total Paid</span>
          <span className="text-xl font-bold">${order.totalAmount.toLocaleString()}</span>
        </div>
      </motion.div>

      {/* Fulfillment Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 rounded-2xl bg-white p-6 shadow-lg"
      >
        <h3 className="text-lg font-semibold text-slate-900">Order Status</h3>
        
        <div className="mt-6 relative">
          {/* Progress Line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-100">
            <motion.div
              className="absolute top-0 left-0 w-full bg-gradient-to-b from-emerald-500 to-teal-500"
              initial={{ height: '0%' }}
              animate={{ height: `${(currentStage / (fulfillmentStages.length - 1)) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>

          {/* Stages */}
          <div className="space-y-6">
            {fulfillmentStages.map((stage, index) => {
              const isCompleted = index <= currentStage;
              const isCurrent = index === currentStage;

              return (
                <motion.div
                  key={stage.stage}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="relative flex items-start gap-4"
                >
                  <div
                    className={cn(
                      'relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all',
                      isCompleted
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-200 bg-white text-slate-300'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <StageIcon stage={stage.stage} />
                    )}
                  </div>
                  <div className="flex-1 pt-2">
                    <h4 className={cn(
                      'font-medium',
                      isCompleted ? 'text-slate-900' : 'text-slate-400'
                    )}>
                      {stage.label}
                    </h4>
                    <p className={cn(
                      'text-sm',
                      isCompleted ? 'text-slate-600' : 'text-slate-400'
                    )}>
                      {stage.description}
                    </p>
                    {isCurrent && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        In Progress
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="mt-8 flex gap-4"
      >
        <button
          onClick={() => router.push('/')}
          className="flex-1 rounded-xl border-2 border-slate-200 bg-white py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Back to Home
        </button>
        <button
          onClick={() => router.push('/chat')}
          className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40"
        >
          Shop More
        </button>
      </motion.div>
    </div>
  );
}

// 履约状态图标
function StageIcon({ stage }: { stage: string }) {
  switch (stage) {
    case 'ordered':
      return <Check className="h-5 w-5" />;
    case 'preparing':
      return <Package className="h-5 w-5" />;
    case 'shipped':
      return <Truck className="h-5 w-5" />;
    case 'delivering':
      return <MapPin className="h-5 w-5" />;
    case 'delivered':
      return <Home className="h-5 w-5" />;
    default:
      return <Clock className="h-5 w-5" />;
  }
}

export default function OrderPage() {
  const router = useRouter();
  const { selectedScheme } = useSchemeStore();
  const {
    currentOrder,
    orderFormData,
    updateOrderFormData,
  } = useOrderStore();
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 如果没有选择方案，返回方案页
  useEffect(() => {
    if (!selectedScheme && !currentOrder) {
      router.push('/schemes');
    }
  }, [selectedScheme, currentOrder, router]);

  // 提交订单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheme) return;

    setIsSubmitting(true);
    
    // 模拟订单创建
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    const mockOrder = {
      id: `ORD${Date.now()}`,
      userId: 'user-1',
      items: selectedScheme.products.map(p => ({
        productId: p.product.id,
        productName: p.product.name,
        productImage: p.product.images[0] || '',
        price: p.finalPrice,
        quantity: p.quantity,
      })),
      status: 'pending' as OrderStatus,
      totalAmount: selectedScheme.finalTotal,
      shippingAddress: {
        id: 'addr-1',
        name: orderFormData.name,
        phone: orderFormData.phone,
        province: orderFormData.province,
        city: orderFormData.city,
        district: orderFormData.district,
        detail: orderFormData.address,
        isDefault: true,
      },
      paymentMethod: 'alipay',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useOrderStore.getState().setCurrentOrder(mockOrder);
    setIsSubmitting(false);
  };

  // 显示订单成功页面
  if (currentOrder) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <main className="px-4 py-8 sm:px-6 lg:px-8">
          <OrderSuccess order={currentOrder} />
        </main>
      </div>
    );
  }

  if (!selectedScheme) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex min-h-[50vh] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-2xl font-bold text-slate-900">Confirm Order</h1>
            <p className="mt-1 text-slate-600">Review your order and enter your shipping address</p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Left - Form */}
            <div className="lg:col-span-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl bg-white p-6 shadow-lg"
              >
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <MapPin className="h-5 w-5 text-indigo-600" />
                  Shipping Information
                </h2>

                <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormInput
                      label="Full Name"
                      icon={User}
                      placeholder="Enter your full name"
                      value={orderFormData.name}
                      onChange={(e) => updateOrderFormData({ name: e.target.value })}
                      required
                    />
                    <FormInput
                      label="Phone Number"
                      icon={Phone}
                      type="tel"
                      placeholder="Enter your phone number"
                      value={orderFormData.phone}
                      onChange={(e) => updateOrderFormData({ phone: e.target.value })}
                      required
                    />
                  </div>

                  <FormInput
                    label="Email Address"
                    icon={Mail}
                    type="email"
                    placeholder="For order notifications"
                    value={orderFormData.email}
                    onChange={(e) => updateOrderFormData({ email: e.target.value })}
                  />

                  <div className="grid gap-5 sm:grid-cols-3">
                    <FormInput
                      label="State"
                      icon={MapPin}
                      placeholder="e.g. CA"
                      value={orderFormData.province}
                      onChange={(e) => updateOrderFormData({ province: e.target.value })}
                      required
                    />
                    <FormInput
                      label="City"
                      icon={MapPin}
                      placeholder="e.g. Los Angeles"
                      value={orderFormData.city}
                      onChange={(e) => updateOrderFormData({ city: e.target.value })}
                      required
                    />
                    <FormInput
                      label="ZIP Code"
                      icon={MapPin}
                      placeholder="e.g. 90001"
                      value={orderFormData.district}
                      onChange={(e) => updateOrderFormData({ district: e.target.value })}
                      required
                    />
                  </div>

                  <FormInput
                    label="Street Address"
                    icon={Home}
                    placeholder="Street, apartment, suite, etc."
                    value={orderFormData.address}
                    onChange={(e) => updateOrderFormData({ address: e.target.value })}
                    required
                  />

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Order Notes (optional)
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                      <textarea
                        placeholder="Special delivery instructions or requests"
                        value={orderFormData.remark}
                        onChange={(e) => updateOrderFormData({ remark: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 min-h-[100px] resize-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Placing Order...
                      </>
                    ) : (
                      <>
                        Place Order
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </div>

            {/* Right - Order Summary */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl bg-white p-6 shadow-lg"
              >
                <h2 className="text-lg font-semibold text-slate-900">Order Summary</h2>
                
                {/* Selected Scheme */}
                <div className="mt-4 rounded-xl bg-indigo-50 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span className="font-medium text-indigo-900">{selectedScheme.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-indigo-700">{selectedScheme.style}</p>
                </div>

                {/* Products */}
                <div className="mt-4 space-y-3">
                  {selectedScheme.products.map((item) => (
                    <div key={item.product.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 line-clamp-1">{item.product.name}</span>
                        <span className="text-slate-400">x{item.quantity}</span>
                      </div>
                      <span className="font-medium text-slate-900">
                        ${item.finalPrice.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                <div className="my-4 h-px bg-slate-100" />

                {/* Price Breakdown */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="text-slate-900">${selectedScheme.originalTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">AI Negotiated Discount</span>
                    <span className="text-emerald-600">-${selectedScheme.totalDiscount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Shipping</span>
                    <span className="text-emerald-600">Free</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="my-4 h-px bg-slate-100" />

                {/* Total */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">Total Due</span>
                  <div className="text-right">
                    <PriceDisplay
                      price={selectedScheme.finalTotal}
                      originalPrice={selectedScheme.originalTotal}
                      size="lg"
                    />
                  </div>
                </div>

                {/* Savings */}
                <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-center">
                  <p className="text-sm text-emerald-700">
                    You saved{' '}
                    <span className="font-bold">${selectedScheme.totalDiscount.toLocaleString()}</span> with AI negotiation
                  </p>
                </div>
              </motion.div>

              {/* Security Note */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-4 rounded-xl bg-slate-100 p-4 text-center"
              >
                <p className="text-xs text-slate-500">
                  🔒 Your information is securely protected and used only for order delivery
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
