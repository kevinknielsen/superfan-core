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
  CreditCard,
  Gift
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useUnifiedPoints, useStatusInfo, type PointsBreakdown } from '@/hooks/unified-economy/use-unified-points';
import { formatPoints, STATUS_THRESHOLDS } from '@/lib/points';
import { useFarcaster } from '@/lib/farcaster-context';
import { navigateToCheckout } from '@/lib/navigation-utils';
import { useSendUSDC } from '@/hooks/use-usdc-payment';
import { useToast } from '@/hooks/use-toast';
import { getStatusTextColor, getStatusBgColor, getStatusGradientClass } from '@/lib/status-colors';
import SpendPointsModal from './spend-points-modal';

interface UnifiedPointsWalletProps {
  clubId: string;
  clubName: string;
  showPurchaseOptions?: boolean;
  showTransferOptions?: boolean;
  className?: string;
  creditBalances?: Record<string, { campaign_title: string; balance: number }>; // Campaign credits
  onCloseWallet?: () => void; // Callback to close wallet and navigate to redemption
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
  showPurchaseOptions = false,
  showTransferOptions = false,
  className = "",
  creditBalances = {},
  onCloseWallet
}: UnifiedPointsWalletProps) {
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const { isInWalletApp, openUrl } = useFarcaster();
  const { sendUSDC, hash: usdcTxHash, isLoading: isUSDCLoading, isSuccess: isUSDCSuccess, error: usdcError } = useSendUSDC();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [clubWalletAddress, setClubWalletAddress] = useState<string | null>(null);
  const [pendingCreditAmount, setPendingCreditAmount] = useState<number | null>(null);
  const processedUsdcTxRef = useRef<string | null>(null);
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

  const { getStatusInfo } = useStatusInfo();
  
  // Calculate total campaign credits (memoized for performance) - MUST be before early returns
  const totalCampaignCredits = useMemo(
    () => Object.values(creditBalances).reduce((sum, d) => sum + d.balance, 0),
    [creditBalances]
  );

  // Fetch club USDC wallet for wallet app users
  useEffect(() => {
    if (!isInWalletApp || !clubId) return;
    
    const controller = new AbortController();
    
    const fetchClubWallet = async () => {
      try {
        const response = await fetch(`/api/clubs/${clubId}`, { signal: controller.signal });
        if (response.ok) {
          interface ClubResponse {
            usdc_wallet_address?: string | null;
          }
          const clubData = await response.json() as ClubResponse;
          setClubWalletAddress(clubData.usdc_wallet_address || null);
        } else if (response.status === 404) {
          setClubWalletAddress(null);
        } else {
          const errorText = await response.text().catch(() => '');
          console.error('Error fetching club wallet:', errorText);
          setClubWalletAddress(null);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error fetching club wallet:', error);
          setClubWalletAddress(null);
        }
      }
    };
    
    fetchClubWallet();
    return () => controller.abort();
  }, [clubId, isInWalletApp]);

  // Process USDC transaction when confirmed
  useEffect(() => {
    if (!isUSDCSuccess || !usdcTxHash || !pendingCreditAmount) return;
    
    // Prevent duplicate processing
    if (processedUsdcTxRef.current === usdcTxHash) {
      return;
    }
    
    const processUSDCPurchase = async () => {
      try {
        const { getAuthHeaders } = await import('@/app/api/sdk');
        const authHeaders = await getAuthHeaders();
        
        const response = await fetch('/api/campaigns/usdc-purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify({
            tx_hash: usdcTxHash,
            club_id: clubId,
            credit_amount: pendingCreditAmount,
            campaign_id: null // Direct credit purchase, not tied to specific campaign
          })
        });

        if (response.ok) {
          // Mark as processed only after successful API call
          processedUsdcTxRef.current = usdcTxHash;
          
          toast({
            title: "Purchase Successful! 🎉",
            description: `${pendingCreditAmount} credits added to your account`,
          });
          setPendingCreditAmount(null);
          refetch(); // Reload wallet data
        } else {
          interface ApiErrorResponse {
            error?: string;
          }
          const errorData = await response.json() as ApiErrorResponse;
          throw new Error(errorData.error || 'Failed to process purchase');
        }
      } catch (error) {
        toast({
          title: "Purchase Failed",
          description: error instanceof Error ? error.message : "Failed to process purchase",
          variant: "destructive",
        });
      } finally {
        setIsPurchasing(false);
      }
    };
    
    processUSDCPurchase();
  }, [isUSDCSuccess, usdcTxHash, pendingCreditAmount, clubId, toast, refetch]);

  // Reset state on USDC errors (user rejection, RPC/contract errors)
  useEffect(() => {
    if (!usdcError) return;
    toast({
      title: 'USDC Transfer Failed',
      description: usdcError instanceof Error ? usdcError.message : 'Transaction was not sent',
      variant: 'destructive',
    });
    setPendingCreditAmount(null);
    setIsPurchasing(false);
    processedUsdcTxRef.current = null;
  }, [usdcError, toast]);

  // Handle credit purchase flow
  const handleCreditPurchase = async (creditAmount: number) => {
    try {
      if (isPurchasing) return;
      setIsPurchasing(true);
      
      console.log('Starting credit purchase flow for amount:', creditAmount);
      
      // Wallet app users: Send USDC directly (instant)
      if (isInWalletApp && clubWalletAddress) {
        // Validate wallet address using viem (safer than regex)
        const { isAddress } = await import('viem');
        if (!isAddress(clubWalletAddress)) {
          throw new Error('Invalid club wallet address');
        }
        
        // Validate amount
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
          throw new Error('Invalid credit amount');
        }
        
        // Store pending amount for processing after confirmation
        setPendingCreditAmount(creditAmount);
        
        // Trigger USDC transaction (wallet popup will appear instantly)
        sendUSDC({
          toAddress: clubWalletAddress as `0x${string}`,
          amountUSDC: creditAmount
        });
        
        // Note: isPurchasing will be reset after transaction completes or fails (see useEffect handlers)
        return; // Transaction monitoring handled by useEffect
      }
      
      // Web users: Stripe checkout flow
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      // Create direct credit purchase via a dedicated endpoint
      const purchaseResponse = await fetch(`/api/campaigns/credit-purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          club_id: clubId,
          credit_amount: creditAmount, // Number of credits to purchase
          success_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&purchase_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&credit_purchase_cancelled=true`
        })
      });

      if (purchaseResponse.ok) {
        const result = await purchaseResponse.json() as any;
        const url = result?.stripe_session_url;
        if (!url || typeof url !== 'string') {
          throw new Error('Missing checkout URL');
        }
        
        await navigateToCheckout(url, isInWalletApp, openUrl);
      } else {
        const errorData = await purchaseResponse.json() as any;
        throw new Error(errorData.error || 'Failed to start credit purchase');
      }
    } catch (error) {
      console.error('Credit purchase error:', error);
      toast({ title: 'Purchase Failed', description: error instanceof Error ? error.message : 'Failed to start credit purchase', variant: 'destructive' });
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

            {/* Credit Purchase Buttons */}
            <div className="space-y-3">
              <div className="text-sm text-slate-300 text-center mb-3">Purchase Credits</div>
              <div className="grid grid-cols-3 gap-2">
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    onClick={() => handleCreditPurchase(25)}
                    disabled={isPurchasing || isUSDCLoading}
                    className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-sm py-3"
                  >
                    <CreditCard className="w-3 h-3 mr-1" />
                    {isUSDCLoading && pendingCreditAmount === 25
                      ? 'Sending...'
                      : isPurchasing && pendingCreditAmount === 25
                        ? 'Processing...'
                        : '25'}
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    onClick={() => handleCreditPurchase(100)}
                    disabled={isPurchasing || isUSDCLoading}
                    className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-sm py-3"
                  >
                    <CreditCard className="w-3 h-3 mr-1" />
                    {isUSDCLoading && pendingCreditAmount === 100
                      ? 'Sending...'
                      : isPurchasing && pendingCreditAmount === 100
                        ? 'Processing...'
                        : '100'}
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    onClick={() => handleCreditPurchase(250)}
                    disabled={isPurchasing || isUSDCLoading}
                    className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-sm py-3"
                  >
                    <CreditCard className="w-3 h-3 mr-1" />
                    {isUSDCLoading && pendingCreditAmount === 250
                      ? 'Sending...'
                      : isPurchasing && pendingCreditAmount === 250
                        ? 'Processing...'
                        : '250'}
                  </Button>
                </motion.div>
              </div>
              
              {/* Credit Information */}
              <div className="text-xs text-slate-400 text-center px-2 py-2 bg-white/5 rounded-lg">
                ✨ Credits never expire and can be used to claim future drops and items
              </div>
              
              {totalCampaignCredits > 0 && (
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-3">
                  <Button 
                    variant="outline" 
                    className="w-full border-white/20 text-white hover:bg-white/10 bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Close wallet and scroll to campaign items to redeem
                      onCloseWallet?.();
                      toast({
                        title: "View Items",
                        description: "You can claim items when the campaign reaches its goal",
                      });
                    }}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    Redeem Items
                  </Button>
                </motion.div>
              )}
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
      {false && Object.keys(creditBalances).length > 0 && (
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
                {Object.entries(creditBalances).map(([campaignId, data]) => (
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
