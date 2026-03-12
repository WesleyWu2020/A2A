'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, X } from 'lucide-react';
import { ImplicitPreferencePrompt } from '@/types';

interface ImplicitPreferenceCardProps {
  prompt: ImplicitPreferencePrompt;
  onConfirm: (prompt: ImplicitPreferencePrompt) => void;
  onDismiss: () => void;
}

export function ImplicitPreferenceCard({ prompt, onConfirm, onDismiss }: ImplicitPreferenceCardProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        className="mx-4 mb-2 rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-sm"
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-800">Smart preference detected</p>
            <p className="mt-0.5 text-xs text-violet-700 leading-relaxed">{prompt.confirmation_prompt}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => onConfirm(prompt)}
                className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-colors"
              >
                <Check className="h-3 w-3" />
                Yes, remember this
              </button>
              <button
                onClick={onDismiss}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="h-3 w-3" />
                Skip
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
