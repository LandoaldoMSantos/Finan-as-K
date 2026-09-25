import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  secondaryAction?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  secondaryAction,
  compact = false,
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 ${
        compact ? 'py-8 px-4' : 'py-14 px-6'
      }`}
    >
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
          <Icon className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="absolute -inset-1 rounded-3xl bg-emerald-500/10 dark:bg-emerald-400/5 -z-10 blur-xs" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed">
          {description}
        </p>
      </div>

      {(actionLabel && onAction) && (
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onAction}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm shadow-emerald-600/10 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.98]"
          >
            {ActionIcon && <ActionIcon className="w-4 h-4" aria-hidden="true" />}
            <span>{actionLabel}</span>
          </motion.button>
          {secondaryAction}
        </div>
      )}
    </motion.div>
  );
};

