'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Calculator, Ruler } from 'lucide-react';
import { SkillInvocation } from '@/types';

interface SkillResultsBadgeProps {
  invocations: SkillInvocation[];
}

const SKILL_ICONS: Record<string, React.ReactNode> = {
  budget_check: <Calculator className="h-3.5 w-3.5" />,
  dimension_check: <Ruler className="h-3.5 w-3.5" />,
};

export function SkillResultsBadge({ invocations }: SkillResultsBadgeProps) {
  if (!invocations || invocations.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-2"
    >
      {invocations.map((inv, i) => (
        <div
          key={`${inv.skill_name}-${i}`}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
            inv.passed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {inv.passed ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {SKILL_ICONS[inv.skill_name] || null}
          <span className="capitalize">
            {inv.skill_name.replace('_', ' ')}
          </span>
          <span className="text-[10px] opacity-70">
            {inv.passed ? '✓' : '⚠'}
          </span>
        </div>
      ))}
    </motion.div>
  );
}
