'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  TrendingDown, 
  MessageCircle, 
  User, 
  Store,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { NegotiationRecord } from '@/types';

interface NegotiationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  record: NegotiationRecord | null;
}

export function NegotiationDialog({ isOpen, onClose, record }: NegotiationDialogProps) {
  if (!record) return null;

  const discount = Math.round(((record.originalPrice - record.finalPrice) / record.originalPrice) * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />

          {/* Dialog — flex column so header+footer stay fixed while content scrolls */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex flex-col max-h-[88vh] overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <HandshakeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Negotiation Record</h2>
                  <p className="text-sm text-slate-500">{record.productName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content — scrolls independently */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {/* Price Summary */}
              <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Original Price</p>
                    <p className="mt-1 text-lg font-semibold text-slate-600 line-through">
                      ${record.originalPrice.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    <span className="mt-1 text-sm font-medium text-amber-600">-{discount}%</span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Final Price</p>
                    <p className="mt-1 text-xl font-bold text-emerald-600">
                      ${record.finalPrice.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Savings */}
                <div className="mt-4 rounded-lg bg-white p-3 text-center">
                  <p className="text-sm text-slate-600">
                    Your AI Buyer Agent saved you{' '}
                    <span className="font-bold text-emerald-600">
                      ${(record.originalPrice - record.finalPrice).toLocaleString()}
                    </span>
                  </p>
                </div>
              </div>

              {/* Strategy */}
              <div className="mt-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  Negotiation Strategy
                </h3>
                <p className="mt-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
                  {record.strategy}
                </p>
              </div>

              {/* Reason */}
              <div className="mt-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Store className="h-4 w-4 text-violet-600" />
                  Why Seller Agreed
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {record.reason}
                </p>
              </div>

              {/* Negotiation Rounds */}
              {record.rounds.length > 0 && (
                <div className="mt-6">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MessageCircle className="h-4 w-4 text-amber-600" />
                    Negotiation Rounds
                  </h3>
                  <div className="mt-3 space-y-3">
                    {record.rounds.map((round, index) => (
                      <motion.div
                        key={round.round}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative rounded-lg border border-slate-100 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Round {round.round}
                          </span>
                          <span className="text-xs text-slate-400">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {record.timestamp}
                          </span>
                        </div>
                        
                        <div className="mt-3 space-y-2">
                          {/* Buyer Offer */}
                          <div className="flex items-start gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 flex-shrink-0">
                              <User className="h-3 w-3" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-slate-500">AI Buyer Offer</p>
                              <p className="text-sm font-medium text-slate-900">
                                ${round.buyerOffer.toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {/* Seller Response */}
                          <div className="flex items-start gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 flex-shrink-0">
                              <Store className="h-3 w-3" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-slate-500">Seller Counter</p>
                              <p className="text-sm font-medium text-slate-900">
                                ${round.sellerResponse.toLocaleString()}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 italic">
                                &ldquo;{round.sellerMessage}&rdquo;
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — always visible at bottom */}
            <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40"
              >
                Got It
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// 议价图标组件
function HandshakeIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2" />
      <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
      <path d="M3 4h8" />
    </svg>
  );
}
