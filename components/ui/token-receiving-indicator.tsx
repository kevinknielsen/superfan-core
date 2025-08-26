'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowDownIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenReceivingIndicatorProps {
  ticker?: string;
  className?: string;
  showShimmer?: boolean;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
  controlsId?: string;
}

export function TokenReceivingIndicator({
  ticker = 'USDC',
  className,
  showShimmer = false,
  onToggleExpand,
  isExpanded = false,
  controlsId,
}: TokenReceivingIndicatorProps) {
  const shimmerVariants = {
    initial: { backgroundPosition: '100% center' },
    animate: { backgroundPosition: '0% center' },
  };

  const baseClasses = cn(
    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg',
    'bg-background/30 border border-primary/20',
    'text-sm font-medium text-gray-300',
    'backdrop-blur-sm',
    className
  );

  const textClasses = cn(
    'relative',
    showShimmer && [
      'bg-[length:250%_100%,auto] bg-clip-text text-transparent',
      '[--base-color:theme(colors.zinc.400)] [--base-gradient-color:theme(colors.zinc.100)]',
      'dark:[--base-color:theme(colors.zinc.500)] dark:[--base-gradient-color:theme(colors.zinc.200)]',
      '[--bg:linear-gradient(90deg,#0000_calc(50%-20px),var(--base-gradient-color),#0000_calc(50%+20px))]',
      '[background-repeat:no-repeat,padding-box]'
    ]
  );

  const textStyle = showShimmer ? {
    backgroundImage: 'var(--bg), linear-gradient(var(--base-color), var(--base-color))'
  } : {};

  return (
    <div className="flex items-center gap-2">
      <div className={baseClasses}>
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.6, 1, 0.6]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          {showShimmer ? (
            <motion.span
              className={textClasses}
              style={textStyle}
              variants={shimmerVariants}
              initial="initial"
              animate="animate"
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: 'linear',
              }}
            >
              Receive <span className="font-bold">${ticker}</span>
            </motion.span>
          ) : (
            <span className={textClasses}>
              Receive <span className="font-bold">${ticker}</span>
            </span>
          )}
        </div>
      </div>
      
      {/* Expandable Arrow */}
      {onToggleExpand && (
        <button
          onClick={onToggleExpand}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
          aria-label="Toggle funding conditions"
          aria-expanded={isExpanded}
          aria-controls={controlsId}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDownIcon className="w-3 h-3 text-primary" />
          </motion.div>
        </button>
      )}
    </div>
  );
} 