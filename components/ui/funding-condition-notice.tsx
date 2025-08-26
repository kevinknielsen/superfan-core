'use client';

import React from 'react';
import { InfoIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FundingConditionNoticeProps {
  ticker?: string;
  className?: string;
  isVisible?: boolean;
}

export function FundingConditionNotice({
  ticker = 'TOKENS',
  className,
  isVisible = false,
}: FundingConditionNoticeProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
          className={cn(
            'flex items-start gap-2.5 px-3 py-2.5 rounded-lg overflow-hidden mb-3',
            'bg-primary/10 border border-primary/20',
            'text-xs text-gray-300',
            className
          )}
        >
          <InfoIcon className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="leading-relaxed text-gray-300">
              <span className="font-medium text-white">Note:</span>{' '}
              You'll receive <span className="font-semibold text-primary">${ticker}</span> tokens if the presale reaches its goal. If it isn't met, you will be refunded.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
} 