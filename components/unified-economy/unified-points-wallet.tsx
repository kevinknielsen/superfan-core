"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  TrendingUp, 
  ArrowUpRight, 
  Users,
  Crown,
  Star,
  Trophy,
  Shield,
  ArrowRight,
  Sparkles,
  Zap,
  CreditCard
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useUnifiedPoints, useStatusInfo, type PointsBreakdown } from '@/hooks/unified-economy/use-unified-points';
import { formatPoints, STATUS_THRESHOLDS } from '@/lib/points';
import { useFarcaster } from '@/lib/farcaster-context';
import { useToast } from '@/hooks/use-toast';
import { getStatusTextColor, getStatusBgColor, getStatusGradientClass } from '@/lib/status-colors';
import { useMetalHolder, useBuyTokens } from '@/hooks/use-metal-holder';
import { useUnifiedAuth } from '@/lib/unified-auth-context';
import SpendPointsModal from './spend-points-modal';

interface UnifiedPointsWalletProps {
  clubId: string;
  clubName: string;
  clubTokenAddress?: string; // Metal token address for the club (required for direct token purchases)
  className?: string;
  onCloseWallet?: () => void; // Callback to close wallet and navigate to redemption
  isAuthenticated?: boolean; // Whether the user is authenticated
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
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${getStatusBgColor(currentStatus as any)} ${getStatusTextColor(currentStatus as any)}`}
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
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${getStatusBgColor(nextStatus as any)} ${getStatusTextColor(nextStatus as any)}`}
            whileHover={{ scale: 1.05, opacity: 1 }}
          >
            <NextStatusIcon className="w-4 h-4" />
          </motion.div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
            </h4>
            <p className={`text-xs ${getStatusTextColor(nextStatus as any)}`}>
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
            className={`text-sm font-semibold ${getStatusTextColor(nextStatus as any)}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            {Math.round(progressPercentage)}%
          </motion.span>
        </div>

        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full bg-gradient-to-r ${getStatusGradientClass(nextStatus as any)} rounded-full relative`}
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
  clubTokenAddress, // Token address for direct token purchases
  className = "",
  onCloseWallet
}: UnifiedPointsWalletProps) {
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false); // For Metal purchase processing state
  const [directCreditBalances, setDirectCreditBalances] = useState<Record<string, { campaign_title: string; balance: number }>>({});
  const { toast } = useToast();
  
  const { user, isAuthenticated } = useUnifiedAuth();
  const metalHolder = useMetalHolder();
  const { mutateAsync: buyTokens, isPending: isBuyingTokens, data: buyTokensData, isSuccess: isBuyTokensSuccess } = useBuyTokens();

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

  const { getStatusInfo } = useStatusInfo();
  
  // Shared function to fetch credit balances
  const fetchCreditBalances = async (signal?: AbortSignal) => {
    if (!isAuthenticated || !user) {
      setDirectCreditBalances({});
      return;
    }
    
    try {
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch(`/api/clubs/${clubId}/credit-balances`, {
        headers: authHeaders,
        signal
      });
      
      if (response.ok) {
        const data = await response.json() as { balances: Record<string, { campaign_title: string; balance: number }> };
        setDirectCreditBalances(data.balances || {});
      } else {
        console.error('Failed to fetch credit balances:', response.status);
        setDirectCreditBalances({});
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return; // Ignore abort errors
      console.error('Error fetching credit balances:', error);
      setDirectCreditBalances({});
    }
  };
  
  // Fetch credit balances directly (independent of rewards)
  useEffect(() => {
    const controller = new AbortController();
    fetchCreditBalances(controller.signal);
    return () => controller.abort();
  }, [clubId, user, isAuthenticated]);
  
  // Calculate total campaign credits (memoized for performance) - MUST be before early returns
  const totalCampaignCredits = useMemo(
    () => Object.values(directCreditBalances).reduce((sum, d) => sum + d.balance, 0),
    [directCreditBalances]
  );

  // Process Metal token purchase success
  const processedTxRef = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    if (!isBuyTokensSuccess || !buyTokensData || !user || !clubId) return;
    
    const tokenData = buyTokensData as any; // Type assertion for Metal API response
    const txHash = tokenData.transactionHash;
    
    // Prevent duplicate processing of the same transaction
    if (!txHash || processedTxRef.current.has(txHash)) {
      return;
    }
    
    // Mark as processed immediately
    processedTxRef.current.add(txHash);
    
    const recordPurchase = async () => {
      try {
        // Record purchase in our database
        const { getAuthHeaders } = await import('@/app/api/sdk');
        const authHeaders = await getAuthHeaders();

        // Validate and extract USDC amount from Metal response
        const raw = Number(tokenData?.sellAmount ?? tokenData?.usdcAmount ?? 0);
        if (!Number.isFinite(raw) || raw <= 0) {
          throw new Error('Invalid purchase amount from Metal response');
        }
        const creditAmount = Math.round(raw * 100) / 100; // 2-decimal precision

        // Add timeout to prevent hanging UI
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        
        const response = await fetch('/api/metal/record-purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': txHash, // Prevent duplicate processing
            ...authHeaders,
          },
          body: JSON.stringify({
            club_id: clubId,
            // No campaign_id for direct token purchases
            credit_amount: creditAmount, // Actual USDC spent (accounts for slippage/fees)
            tx_hash: txHash,
            metal_holder_id: metalHolder.data?.id,
            metal_holder_address: metalHolder.data?.address,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        // Treat 409 Conflict as success (already recorded)
        if (response.status === 409) {
          toast({
            title: "Purchase Already Recorded",
            description: `${creditAmount.toFixed(2)} credits already in your account`,
          });
          setIsPurchasing(false);
          refetch();
          return;
        }

        if (!response.ok) {
          const errorData = await response.json() as any;
          throw new Error(errorData.error || 'Failed to record purchase');
        }

        // Success!
        toast({
          title: "Purchase Successful! 🎉",
          description: `${creditAmount.toFixed(2)} credits added to your account`,
        });
        setIsPurchasing(false);
        refetch(); // Reload wallet data
        fetchCreditBalances(); // Refetch credit balances directly
      } catch (error) {
        // Remove from processed set to allow retry
        processedTxRef.current.delete(txHash);
        
        console.error('[Metal Purchase] Error recording:', error);
        toast({
          title: "Purchase Completed",
          description: "Tokens purchased but recording failed. Please refresh.",
          variant: "destructive"
        });
        setIsPurchasing(false);
      }
    };

    recordPurchase();
  }, [isBuyTokensSuccess, buyTokensData, user, clubId, metalHolder.data, toast, refetch]);

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

  const { wallet, status } = breakdown;
  const statusInfo = getStatusInfo(status.current);

  // Calculate effective points when user has temporary boost
  const effectiveTotalBalance = (status as any)?.has_active_boost 
    ? (wallet?.status_points ?? 0) // Use status points when boosted
    : (wallet?.total_balance ?? 0); // Use actual balance when not boosted
  
  const effectiveEarnedPoints = (status as any)?.has_active_boost
    ? (wallet?.status_points ?? 0) // Use status points when boosted
    : (wallet?.earned_points ?? 0); // Use actual earned points when not boosted

  return (
    <>
      <div className={`${className} space-y-4`}>
        {/* Main Balance Card - Gradient Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700 text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent" />
          <div className="relative p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">My Wallet</h2>
                  <p className="text-sm text-slate-300">{clubName}</p>
                </div>
              </div>
              <CreditCard className="w-6 h-6 text-slate-400" />
            </div>

            {/* Balance Display - Side by Side */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300 mb-1">Credits</p>
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: totalCampaignCredits > 0 ? [0, 15, -15, 0] : 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <Sparkles className="w-5 h-5 text-green-400" />
                    </motion.div>
                    <span className="text-2xl font-bold text-white">
                      {totalCampaignCredits.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-300 mb-1">Status Points</p>
                  <div className="flex items-center gap-2 justify-end">
                    <Star className="w-5 h-5 text-purple-400" />
                    <span className="text-2xl font-bold text-white">
                      {formatPoints(wallet.status_points ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Card>
      </motion.div>

      {/* Status Progress Card - Hidden for now (will reactivate soon) */}
      {false && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="bg-background border-border">
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-4">Your Status</h3>
              <StatusProgressSection 
                currentStatus={status.current}
                currentPoints={wallet.status_points ?? 0}
                nextStatus={status.next_status}
                pointsToNext={status.points_to_next}
                progressPercentage={status.progress_to_next}
              />
              
            {/* Tier Boost Info */}
            {(status as any).has_active_boost && (
              <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
                <div className="text-sm text-blue-400 font-medium mb-1">
                  🚀 Active Tier Boost
                </div>
                <div className="text-xs text-blue-300/80">
                  Your status is temporarily boosted
                </div>
              </div>
            )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Campaign Credits Breakdown - Hidden for now */}
      {false && Object.keys(directCreditBalances).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="bg-background border-border">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Campaign Credits</h3>
              </div>
              <div className="space-y-3">
                {Object.entries(directCreditBalances).map(([campaignId, data]) => (
                  <motion.div
                    key={campaignId}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{data.campaign_title}</p>
                        <p className="text-sm text-muted-foreground">Available to redeem</p>
                      </div>
                    </div>
                    <div className="font-semibold text-green-600 dark:text-green-400 text-xl">
                      {data.balance}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
      </div>

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
    </>
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
