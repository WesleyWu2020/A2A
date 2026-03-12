'use client';

import { X, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ContextPin } from '@/types';

interface ContextPinsProps {
  pins: ContextPin[];
  sessionId: string | null;
  onRemovePin: (sessionId: string, pinKey: string) => void;
  className?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  budget: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pet_friendly: 'bg-orange-50 text-orange-700 border-orange-200',
  eco_safe: 'bg-green-50 text-green-700 border-green-200',
  ergonomic: 'bg-blue-50 text-blue-700 border-blue-200',
  material_wood: 'bg-amber-50 text-amber-700 border-amber-200',
  room_type: 'bg-purple-50 text-purple-700 border-purple-200',
  default: 'bg-slate-50 text-slate-700 border-slate-200',
};

function getColor(key: string): string {
  for (const prefix of Object.keys(CATEGORY_COLORS)) {
    if (key === prefix || key.startsWith(prefix.split('_')[0])) {
      const color = CATEGORY_COLORS[prefix];
      if (color) return color;
    }
  }
  return CATEGORY_COLORS.default;
}

export function ContextPins({ pins, sessionId, onRemovePin, className }: ContextPinsProps) {
  if (pins.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 px-4 py-2', className)}>
      <Tag className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="text-xs text-slate-400 mr-0.5">Current requirements:</span>
      <AnimatePresence>
        {pins.map((pin) => (
          <motion.span
            key={pin.key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              getColor(pin.key),
            )}
          >
            {pin.label}
            {pin.removable !== false && sessionId && (
              <button
                onClick={() => onRemovePin(sessionId, pin.key)}
                className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${pin.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
