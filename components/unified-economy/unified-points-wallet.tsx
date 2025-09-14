"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users,
  Crown,
  Star,
  Trophy,
  Shield,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useUnifiedPoints, useStatusInfo, type PointsBreakdown } from '@/hooks/unified-economy/use-unified-points';
import { formatPoints, STATUS_THRESHOLDS } from '@/lib/points';
import { getAccessToken } from '@privy-io/react-auth';
import { useToast } from '@/hooks/use-toast';
import SpendPointsModal from './spend-points-modal';

interface UnifiedPointsWalletProps {
  clubId: string;
  clubName: string;
  showPurchaseOptions?: boolean;
  showTransferOptions?: boolean;
  className?: string;
}

// Enhanced status icons mapping
const ENHANCED_STATUS_ICONS = {
  cadet: Shield,
  resident: Star,
  headliner: Trophy,
  superfan: Crown,
};


// Status Progress Section Component (matching Your Status design)
function StatusProgressSection({ 
  currentStatus, 
  currentPoints, 
  nextStatus, 
  pointsToNext, 
  progressPercentage 
}: {
  currentStatus: string;
  currentPoints: number;
  nextStatus: string | null;
  pointsToNext: number | null;
  progressPercentage: number;
}) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [showSparkles, setShowSparkles] = useState(false);
  
  // Generate sparkle positions once on client-side to avoid SSR hydration mismatch
  const sparklePositions = useMemo(() => {
    if (typeof window === 'undefined') {
      // Return default positions for SSR
      return Array.from({ length: 4 }, (_, i) => ({ x: i * 25 + '%', y: i * 25 + '%' }));
    }
    // Generate random positions on client
    return Array.from({ length: 4 }, () => ({
      x: Math.random() * 100 + '%',
      y: Math.random() * 100 + '%'
    }));
  }, []);

  const CurrentStatusIcon = ENHANCED_STATUS_ICONS[currentStatus as keyof typeof ENHANCED_STATUS_ICONS] || Shield;
  const NextStatusIcon = nextStatus ? ENHANCED_STATUS_ICONS[nextStatus as keyof typeof ENHANCED_STATUS_ICONS] : Crown;

  // Animate progress bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progressPercentage);
    }, 300);
    return () => clearTimeout(timer);
  }, [progressPercentage]);

  // Sparkle animation when near completion
  useEffect(() => {
    if (progressPercentage > 80) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const interval = setInterval(() => {
        setShowSparkles(true);
        timeout = setTimeout(() => setShowSparkles(false), 1000);
      }, 3000);
      return () => {
        clearInterval(interval);
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [progressPercentage]);

  // Status-specific gradient colors
  const getStatusGradient = (status: string) => {
    switch (status) {
      case 'cadet': return 'from-blue-500 to-blue-400';
      case 'resident': return 'from-green-500 to-green-400';
      case 'headliner': return 'from-purple-500 to-purple-400';
      case 'superfan': return 'from-yellow-500 to-yellow-400';
      default: return 'from-gray-500 to-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cadet': return 'text-blue-400';
      case 'resident': return 'text-green-400';
      case 'headliner': return 'text-purple-400';
      case 'superfan': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'cadet': return 'bg-blue-900/30';
      case 'resident': return 'bg-green-900/30';
      case 'headliner': return 'bg-purple-900/30';
      case 'superfan': return 'bg-yellow-900/30';
      default: return 'bg-gray-800';
    }
  };

  if (!nextStatus) {
    return (
      <div className="text-center p-4 rounded-xl bg-gradient-to-r from-yellow-500/20 to-yellow-400/20 border border-yellow-500/30">
        <Crown className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
        <h5 className="text-yellow-400 font-bold mb-1">Maximum Status!</h5>
        <p className="text-yellow-300/80 text-sm">All benefits unlocked</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Animated background sparkles */}
      <AnimatePresence>
        {showSparkles && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {sparklePositions.map((position, i) => (
              <motion.div
                key={i}
                className="absolute"
                initial={{ 
                  opacity: 0, 
                  scale: 0,
                  x: position.x,
                  y: position.y
                }}
                animate={{ 
                  opacity: [0, 1, 0], 
                  scale: [0, 1, 0],
                  rotate: 360
                }}
                transition={{ 
                  duration: 2, 
                  delay: i * 0.2,
                  repeat: Infinity,
                  repeatDelay: 3
                }}
              >
                <Sparkles className="w-3 h-3 text-yellow-400" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side-by-side tier comparison */}
      <div className="flex items-center justify-between mb-4">
        {/* Current Tier */}
        <motion.div 
          className="flex items-center gap-2"
          initial={{ x: -10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <motion.div 
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${getStatusBgColor(currentStatus)} ${getStatusColor(currentStatus)}`}
            whileHover={{ scale: 1.05 }}
          >
            <CurrentStatusIcon className="w-4 h-4" />
          </motion.div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
            </h4>
            <p className="text-xs text-muted-foreground">{formatPoints(currentPoints)} points</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </motion.div>

        {/* Next Tier */}
        <motion.div 
          className="flex items-center gap-2 opacity-60"
          initial={{ x: 10, opacity: 0 }}
          animate={{ x: 0, opacity: 0.6 }}
          transition={{ delay: 0.15 }}
        >
          <motion.div 
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${getStatusBgColor(nextStatus)} ${getStatusColor(nextStatus)}`}
            whileHover={{ scale: 1.05, opacity: 1 }}
          >
            <NextStatusIcon className="w-4 h-4" />
          </motion.div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
            </h4>
            <p className={`text-xs ${getStatusColor(nextStatus)}`}>
              {STATUS_THRESHOLDS[nextStatus as keyof typeof STATUS_THRESHOLDS]?.toLocaleString()} points
            </p>
          </div>
        </motion.div>
      </div>

      {/* Progress section */}
      <motion.div 
        className="space-y-2"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {formatPoints(pointsToNext ?? 0)} points to go
          </span>
          <motion.span 
            className={`text-sm font-semibold ${getStatusColor(nextStatus)}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            {Math.round(progressPercentage)}%
          </motion.span>
        </div>

        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full bg-gradient-to-r ${getStatusGradient(nextStatus)} rounded-full relative`}
            initial={{ width: 0 }}
            animate={{ width: `${animatedProgress}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            {/* Animated shine effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}





export default function UnifiedPointsWallet({ 
  clubId, 
  clubName, 
  showPurchaseOptions = false,
  showTransferOptions = false,
  className = ""
}: UnifiedPointsWalletProps) {
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const { toast } = useToast();

  // Use the hook instead of manual fetch
  const { 
    breakdown, 
    isLoading, 
    error,
    refetch,
    spendPoints,
    transferPoints,
    isSpending,
    isTransferring,
    totalBalance
  } = useUnifiedPoints(clubId);

  // Debug logging to compare with global balance
  console.log(`[UnifiedPointsWallet] Club ${clubName} (${clubId}) breakdown:`, {
    isLoading,
    error: error?.message,
    totalBalance,
    breakdown: breakdown ? {
      wallet: breakdown.wallet,
      status: breakdown.status,
      spending_power: breakdown.spending_power
    } : 'No breakdown data'
  });

  const { getStatusInfo } = useStatusInfo();

  // Handle buy points flow
  const handleBuyPoints = async () => {
    try {
      if (isPurchasing) return;
      setIsPurchasing(true);
      
      console.log('Starting buy points flow for club:', clubId);
      const token = await getAccessToken();
      if (!token) {
        toast({ title: 'Sign in required', description: 'Please sign in to purchase points.', variant: 'destructive' });
        return;
      }
      
      // For now, redirect to 1000 point bundle (smallest option)
      const response = await fetch('/api/points/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          communityId: clubId,
          bundleId: '1000' // Default to 1000 point bundle
        }),
      });

      console.log('Purchase API response status:', response.status);

      if (response.ok) {
        const data = await response.json() as { url: string };
        const { url } = data;
        // Redirect to Stripe checkout
        window.location.href = url;
      } else {
        const error = await response.json().catch(() => ({})) as any;
        console.error('Purchase API error:', error, 'Status:', response.status);
        throw new Error(error.error || `HTTP ${response.status}: Failed to create checkout session`);
      }
    } catch (error) {
      console.error('Buy points error:', error);
      toast({ title: 'Purchase failed', description: error instanceof Error ? error.message : 'Failed to start purchase', variant: 'destructive' });
    } finally {
      setIsPurchasing(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback if unified system is not ready yet
  if (!breakdown) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-6 text-center">
          <div className="space-y-3">
            <Wallet className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-medium">Unified Points System</h3>
              <p className="text-sm text-muted-foreground">
                Coming soon! Enhanced points system with spending breakdown.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { wallet, status, spending_power } = breakdown;
  const statusInfo = getStatusInfo(status.current);

  return (
    <Card className={`${className} overflow-hidden`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5" />
          {clubName}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Balance Display */}
        <div className="text-center space-y-2">
          <div className="text-3xl font-bold text-foreground">
            {formatPoints(wallet.total_balance ?? 0)}
          </div>
          <div className="text-sm text-muted-foreground">Total Points</div>
          
          {/* Quick breakdown */}
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {formatPoints(wallet.earned_points ?? 0)} earned
            </span>
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              {formatPoints(wallet.purchased_points ?? 0)} purchased
            </span>
          </div>
        </div>

        {/* Enhanced Status Progress - Matching Your Status Design */}
        <StatusProgressSection 
          currentStatus={status.current}
          currentPoints={wallet.status_points ?? 0}
          nextStatus={status.next_status}
          pointsToNext={status.points_to_next}
          progressPercentage={status.progress_to_next}
        />

        {/* Action Button - Full Width */}
        <div className="space-y-3">
          {showPurchaseOptions && (
            <Button
              type="button"
              variant="default"
              className="w-full"
              disabled={isPurchasing}
              onClick={(e) => {
                e.stopPropagation();
                handleBuyPoints();
              }}
            >
              <ArrowDownRight className="h-4 w-4 mr-2" />
              Buy Points to Boost Status
            </Button>
          )}
          
          {/* Spend Points button hidden for now - doesn't work yet */}
          {false && (
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setShowSpendModal(true);
              }}
              disabled={(wallet.total_balance ?? 0) <= 0}
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Spend Points
            </Button>
          )}

          {showTransferOptions && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                setShowTransferModal(true);
              }}
              disabled={(spending_power.purchased_available ?? 0) <= 0}
            >
              <Users className="h-4 w-4 mr-2" />
              Transfer
            </Button>
          )}
        </div>
      </CardContent>

      {/* Spend Points Modal */}
      <SpendPointsModal
        clubId={clubId}
        clubName={clubName}
        isOpen={showSpendModal}
        onClose={() => setShowSpendModal(false)}
        onSuccess={() => {
          refetch();
          setShowSpendModal(false);
        }}
      />

      {/* Transfer Points Modal */}
      <TransferPointsModal
        clubId={clubId}
        clubName={clubName}
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {
          refetch();
          setShowTransferModal(false);
        }}
      />
    </Card>
  );
}

// Placeholder for Transfer Modal (to be implemented in Phase 2)
function TransferPointsModal({
  isOpen, onClose, onSuccess, clubId, clubName
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  clubId: string;
  clubName: string;
}) {
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" 
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-modal="transfer-points"
    >
      <div 
        className="bg-white p-6 rounded-lg max-w-md w-full mx-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Transfer Points</h3>
        <p className="text-muted-foreground mb-4">Point transfer modal coming soon in Phase 2...</p>
        <p className="text-sm text-gray-600 mb-4">Club: {clubName}</p>
        <Button onClick={(e) => { e.stopPropagation(); onClose(); }}>Close</Button>
      </div>
    </div>
  );
}
