'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  MessageSquare, 
  Handshake, 
  FileCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Bot
} from 'lucide-react';
import { AgentStage, AgentStageInfo } from '@/types';
import { cn } from '@/lib/utils';

interface AgentTimelineProps {
  stages: AgentStageInfo[];
  currentStage: AgentStageInfo | null;
  isActive: boolean;
  className?: string;
  compact?: boolean;
}

const stageConfig: Record<AgentStage, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}> = {
  idle: {
    label: 'Waiting',
    description: 'Ready to start',
    icon: Bot,
    color: 'text-slate-500',
    bgColor: 'bg-slate-100',
  },
  retrieving: {
    label: 'Searching Catalog',
    description: 'AI Buyer searching 4,500+ products...',
    icon: Search,
    color: 'text-[#3730a3]',
    bgColor: 'bg-[#eef2ff]',
  },
  filtering: {
    label: 'Filtering Results',
    description: 'Matching products to your requirements...',
    icon: Filter,
    color: 'text-[#3730a3]',
    bgColor: 'bg-[#eef2ff]',
  },
  inquiring: {
    label: 'Checking Prices',
    description: 'Getting latest pricing from sellers...',
    icon: MessageSquare,
    color: 'text-[#3730a3]',
    bgColor: 'bg-[#eef2ff]',
  },
  negotiating: {
    label: 'Negotiating',
    description: 'AI Agent negotiating best prices for you...',
    icon: Handshake,
    color: 'text-[#b45309]',
    bgColor: 'bg-[#fef3c7]',
  },
  summarizing: {
    label: 'Curating Packages',
    description: 'Compiling 3 optimized packages for you...',
    icon: FileCheck,
    color: 'text-[#4f46e5]',
    bgColor: 'bg-[#eef2ff]',
  },
  completed: {
    label: 'Completed',
    description: 'All done! Your packages are ready.',
    icon: CheckCircle2,
    color: 'text-[#4f46e5]',
    bgColor: 'bg-[#eef2ff]',
  },
  error: {
    label: 'Error',
    description: 'Something went wrong during processing',
    icon: XCircle,
    color: 'text-[#e55b3c]',
    bgColor: 'bg-[#fdf0ec]',
  },
};

const allStages: AgentStage[] = [
  'retrieving',
  'filtering',
  'inquiring',
  'negotiating',
  'summarizing',
];

export function AgentTimeline({ 
  stages, 
  currentStage, 
  isActive,
  className,
  compact = false 
}: AgentTimelineProps) {
  if (!isActive && stages.length === 0) {
    return null;
  }

  const currentStageIndex = currentStage 
    ? allStages.indexOf(currentStage.stage)
    : -1;

  if (compact) {
    return (
      <div className={cn('rounded-xl bg-white p-4 shadow-sm border border-[#e0dbff]', className)}>
        <div className="flex items-center gap-3">
          {currentStage && currentStage.stage !== 'completed' && currentStage.stage !== 'error' ? (
            <>
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                stageConfig[currentStage.stage].bgColor,
                stageConfig[currentStage.stage].color
              )}>
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="flex-1">
                <p className={cn('font-medium', stageConfig[currentStage.stage].color)}>
                  {stageConfig[currentStage.stage].label}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${currentStage.progress}%` }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      'h-full rounded-full',
                      currentStage.stage === 'negotiating' ? 'bg-[#d97706]' : 'bg-[#6366f1]'
                    )}
                  />
                </div>
              </div>
              <span className="text-sm text-[#6e6b62]">{currentStage.progress}%</span>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef2ff] text-[#4f46e5]">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-[#4f46e5]">Done</p>
                <p className="text-sm text-[#6e6b62]">Packages ready to view</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl bg-white p-6 shadow-sm border border-[#e0dbff]', className)}>
      <h3 className="mb-6 text-lg font-semibold text-[#18170f]">AI Agent Activity Log</h3>
      
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-[#e9e7ff]">
          <motion.div
            className="absolute left-0 top-0 w-full bg-gradient-to-b from-[#4f46e5] to-[#a5b4fc]"
            initial={{ height: '0%' }}
            animate={{ 
              height: currentStageIndex >= 0 
                ? `${((currentStageIndex + 1) / allStages.length) * 100}%`
                : '0%'
            }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Stage Items */}
        <div className="space-y-6">
          {allStages.map((stage, index) => {
            const config = stageConfig[stage];
            const isCompleted = stages.some(s => s.stage === stage) && 
              allStages.indexOf(stage) < currentStageIndex;
            const isCurrent = currentStage?.stage === stage;
            const isPending = index > currentStageIndex;

            return (
              <motion.div
                key={stage}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  'relative flex items-start gap-4',
                  isPending && 'opacity-50'
                )}
              >
                {/* Icon */}
                <div className={cn(
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                  isCompleted
                    ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
                    : isCurrent
                    ? cn('border-current', config.bgColor, config.color)
                    : 'border-[#e6e0d8] bg-white text-[#c6c0b8]'
                )}>
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <config.icon className="h-5 w-5" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-1">
                  <div className="flex items-center justify-between">
                    <h4 className={cn(
                      'font-medium',
                      isCompleted || isCurrent ? 'text-[#18170f]' : 'text-[#afa9a0]'
                    )}>
                      {config.label}
                    </h4>
                    {isCurrent && (
                      <span className="text-sm font-medium text-[#4f46e5]">
                        {currentStage?.progress}%
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'mt-0.5 text-sm',
                    isCompleted || isCurrent ? 'text-[#6e6b62]' : 'text-[#afa9a0]'
                  )}>
                    {isCurrent && currentStage?.description 
                      ? currentStage.description 
                      : config.description}
                  </p>

                  {/* Progress Bar for Current Stage */}
                  {isCurrent && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${currentStage?.progress || 0}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full rounded-full bg-gradient-to-r from-[#4f46e5] to-[#a5b4fc]"
                      />
                    </div>
                  )}

                  {/* Timestamp */}
                  {isCompleted && (
                    <p className="mt-1 text-xs text-[#afa9a0]">
                      {new Date(stages.find(s => s.stage === stage)?.timestamp || '').toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Current Status */}
      <AnimatePresence mode="wait">
        {currentStage && (
          <motion.div
            key={currentStage.stage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              'mt-6 rounded-xl p-4',
              stageConfig[currentStage.stage].bgColor
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full bg-white',
                stageConfig[currentStage.stage].color
              )}>
                {currentStage.stage === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : currentStage.stage === 'error' ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              <div className="flex-1">
                <p className={cn('text-sm font-medium', stageConfig[currentStage.stage].color)}>
                  {currentStage.description || stageConfig[currentStage.stage].description}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
