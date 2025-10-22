"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isAddress } from "viem";
import { 
  Gift, 
  Lock, 
  Check, 
  Crown, 
  Star, 
  Calendar,
  MapPin,
  Users,
  Ticket,
  Music,
  ShoppingBag,
  Award,
  Globe,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/points";
import { getStatusTextColor, getStatusBgColor, getStatusBorderColor } from "@/lib/status-colors";
import { useFarcaster } from "@/lib/farcaster-context";
import { navigateToCheckout } from "@/lib/navigation-utils";
import { useSendUSDC } from "@/hooks/use-usdc-payment";
import { useRef } from "react";
import { useMetalHolder, useBuyPresale } from "@/hooks/use-metal-holder";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import type { Unlock as BaseUnlock } from "@/types/club.types";
import type { TierRewardsResponse, PurchaseResponse, TierReward, ClaimedReward } from "@/types/campaign.types";

// Extended unlock type with tier reward specific fields
interface ClaimOption {
  upgrade?: {
    purchase_type: 'tier_boost' | 'direct_unlock';
    price_cents?: number;
  };
}

interface TierRewardFields {
  user_can_claim_free?: boolean;
  claim_options?: ClaimOption[];
  tier_boost_price_cents?: number;
  direct_unlock_price_cents?: number;
  upgrade_price_cents?: number;
  inventory_status?: string;
  metadata?: Record<string, any>;
  club_info?: {
    id: string;
    name: string;
    description?: string | null;
    city?: string | null;
    image_url?: string | null;
  } | null;
  
  // Enhanced with campaign and discount fields
  campaign_id?: string;
  campaign_title?: string;
  campaign_description?: string;
  campaign_status?: string;
  is_campaign_tier?: boolean;
  campaign_progress?: {
    funding_percentage: number;
    seconds_remaining: number;
    current_funding_cents: number;
    funding_goal_cents: number;
  };
  user_discount_eligible?: boolean;
  user_discount_amount_cents?: number;
  user_discount_percentage?: number;
  user_final_price_cents?: number;
  discount_description?: string;
  
  // Credit campaign fields (1 credit = $1)
  credit_cost?: number;
  is_credit_campaign?: boolean;
  metal_presale_id?: string; // Metal presale ID for crypto purchases
  cogs_cents?: number;
  user_credit_balance?: number;
}

type Unlock = BaseUnlock & TierRewardFields;

interface UnlockRedemptionProps {
  clubId: string;
  clubName: string;
  userStatus: string;
  userPoints: number;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
  onRedemption?: () => void;
  onShowRedemptionConfirmation?: (redemption: any, unlock: Unlock) => void;
  onShowPerkDetails?: (unlock: Unlock, redemption: any, onPurchase?: () => void) => void;
  onCampaignDataChange?: (campaignData: any) => void;
  onCreditBalancesChange?: (creditBalances: Record<string, { campaign_title: string; balance: number }>) => void;
  onAddToCart?: (item: {
    id: string;
    title: string;
    isCreditCampaign?: boolean;
    creditCost?: number;
    campaignId?: string;
    metalPresaleId?: string; // CRITICAL: Metal presale ID for crypto purchases
    finalPriceCents?: number;
    upgradePriceCents?: number;
    discountCents?: number;
  }) => void;
  cart?: Array<{ id: string; quantity: number }>;
  onRefetchReady?: (refetch: () => Promise<void>) => void; // Expose refetch to parent
}

const UNLOCK_TYPE_ICONS: Record<string, any> = {
  presale_access: Ticket,
  line_skip: Users,
  backstage_pass: Star,
  studio_visit: Music,
  vinyl_lottery: Award,
  merch_discount: ShoppingBag,
  meet_greet: Crown,
  exclusive_content: Globe,
};

import { STATUS_THRESHOLDS } from "@/lib/status";
import type { ClubStatus } from "@/types/club.types";
// Prevent mutation and improve inference
const STATUS_POINTS = Object.freeze(STATUS_THRESHOLDS) as Readonly<Record<ClubStatus, number>>;

// Helper function to get effective price for sorting
const getEffectivePrice = (unlock: Unlock): number => {
  // For credit campaigns: 1 credit = $1 = 100 cents
  if (unlock.is_credit_campaign && unlock.credit_cost) {
    return unlock.credit_cost * 100; // Convert credits to cents
  }
  
  // For regular tier rewards: use existing pricing
  const v =
    unlock.user_final_price_cents ??
    unlock.upgrade_price_cents ??
    unlock.tier_boost_price_cents ??
    unlock.direct_unlock_price_cents ??
    0;
  return Number.isFinite(v) ? v : 0;
};

// Helper function to sort unlocks by price (cheapest first)
const sortUnlocksByPrice = (unlocks: Unlock[]): Unlock[] =>
  [...unlocks].sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));


export default function UnlockRedemption({ 
  clubId, 
  clubName,
  userStatus, 
  userPoints,
  isAuthenticated = false,
  onLoginRequired,
  onRedemption,
  onShowRedemptionConfirmation,
  onShowPerkDetails,
  onCampaignDataChange,
  onCreditBalancesChange,
  onAddToCart,
  cart = [],
  onRefetchReady
}: UnlockRedemptionProps) {
  const { toast } = useToast();
  const { isInWalletApp, openUrl } = useFarcaster();
  const { sendUSDC, hash: usdcTxHash, isLoading: isUSDCLoading, isSuccess: isUSDCSuccess, error: usdcError } = useSendUSDC();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUnlock, setSelectedUnlock] = useState<Unlock | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const processedTxRef = useRef<string | null>(null);
  const [pendingItemPurchase, setPendingItemPurchase] = useState<Unlock | null>(null);
  
  const { user } = useUnifiedAuth();
  const metalHolder = useMetalHolder();
  const { mutateAsync: buyPresaleAsync, isPending: isBuyingPresale } = useBuyPresale();

  // Credit balances effect - always declare, but conditionally execute
  useEffect(() => {
    if (!onCreditBalancesChange) return;
    
    const creditBalances = unlocks
      .filter(u => u.is_credit_campaign && u.campaign_id)
      .reduce((balances, u) => {
        const id = u.campaign_id!;
        const title = balances[id]?.campaign_title || u.campaign_title || 'Campaign';
        const balance = Math.max(balances[id]?.balance ?? 0, u.user_credit_balance ?? 0);
        balances[id] = { campaign_title: title, balance };
        return balances;
      }, {} as Record<string, { campaign_title: string; balance: number }>);
    
    // Pass credit balances to parent (will be shown in wallet modal)
    onCreditBalancesChange(creditBalances);
  }, [unlocks, onCreditBalancesChange]);

  // Monitor Metal Presale purchase completion for wallet users
  useEffect(() => {
    if (!isUSDCSuccess || !usdcTxHash || !pendingItemPurchase || !user) return;
    
    // Prevent duplicate processing of same transaction
    if (processedTxRef.current === usdcTxHash) {
      return;
    }
    
    // Mark as processed immediately to prevent duplicate calls
    processedTxRef.current = usdcTxHash;
    
    const processMetalPurchase = async () => {
      try {
        // Validate campaign_id before processing
        if (!pendingItemPurchase.campaign_id) {
          throw new Error('Missing campaign ID for purchase');
        }
        
        // Step 1: Buy presale with Metal
        // Use metal_presale_id (the actual Metal presale), not campaign_id
        const presaleId = pendingItemPurchase.metal_presale_id || pendingItemPurchase.campaign_id;
        
        console.log('[Unlock] Calling buyPresale with:', {
          presaleId,
          metal_presale_id: pendingItemPurchase.metal_presale_id,
          campaign_id: pendingItemPurchase.campaign_id,
          usingCorrectId: !!pendingItemPurchase.metal_presale_id,
          fullItem: pendingItemPurchase
        });
        
        await buyPresaleAsync({
          user,
          campaignId: presaleId,
          amount: pendingItemPurchase.is_credit_campaign 
            ? (pendingItemPurchase.credit_cost || 0)
            : ((pendingItemPurchase.user_final_price_cents || pendingItemPurchase.upgrade_price_cents || 0) / 100)
        });

        // Step 2: Record purchase in our database
        const { getAuthHeaders } = await import('@/app/api/sdk');
        const authHeaders = await getAuthHeaders();
        
        // Different endpoints for credits vs items
        const endpoint = pendingItemPurchase.is_credit_campaign
          ? '/api/metal/record-purchase'
          : '/api/metal/purchase-item';
        
        // Validate pricing ONLY for item purchases (not credit campaigns)
        let amountPaidCents = 0;
        let originalPriceCents = 0;
        let discountCents = 0;
        
        if (!pendingItemPurchase.is_credit_campaign) {
          // Assert required fields exist for item purchases
          if (pendingItemPurchase.upgrade_price_cents === undefined || pendingItemPurchase.upgrade_price_cents === null) {
            throw new Error('Missing upgrade_price_cents for item purchase');
          }
          if (pendingItemPurchase.user_final_price_cents === undefined || pendingItemPurchase.user_final_price_cents === null) {
            throw new Error('Missing user_final_price_cents for item purchase');
          }
          
          amountPaidCents = pendingItemPurchase.user_final_price_cents;
          originalPriceCents = pendingItemPurchase.upgrade_price_cents;
          discountCents = pendingItemPurchase.user_discount_amount_cents || 0;
          
          // Ensure valid integers
          if (!Number.isInteger(amountPaidCents) || amountPaidCents < 0) {
            throw new Error('Invalid amount_paid_cents');
          }
          if (!Number.isInteger(originalPriceCents) || originalPriceCents < 0) {
            throw new Error('Invalid original_price_cents');
          }
          if (!Number.isInteger(discountCents) || discountCents < 0) {
            throw new Error('Invalid discount_applied_cents');
          }
          // Ensure original >= paid (after discount)
          if (originalPriceCents < amountPaidCents) {
            throw new Error('Invalid pricing: original_price cannot be less than amount_paid');
          }
        }
        
        const requestBody = pendingItemPurchase.is_credit_campaign
          ? {
              club_id: clubId,
              campaign_id: pendingItemPurchase.campaign_id,
              credit_amount: pendingItemPurchase.credit_cost || 0,
              tx_hash: usdcTxHash,
              metal_holder_id: metalHolder.data?.id,
              metal_holder_address: metalHolder.data?.address,
            }
          : {
              tier_reward_id: pendingItemPurchase.id,
              club_id: clubId,
              campaign_id: pendingItemPurchase.campaign_id,
              amount_paid_cents: amountPaidCents,
              original_price_cents: originalPriceCents,
              discount_applied_cents: discountCents,
              tx_hash: usdcTxHash,
              metal_holder_id: metalHolder.data?.id,
              metal_holder_address: metalHolder.data?.address,
              user_tier: userStatus
            };

        // Add timeout to prevent indefinite hangs
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 15_000);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify(requestBody),
          signal: ac.signal
        }).finally(() => clearTimeout(t));

        if (!response.ok) {
          const errorData = await response.json() as any;
          throw new Error(errorData.error || 'Failed to record purchase');
        }

        // Success!
        const result = await response.json() as any;
        toast({
          title: "Purchase Successful! 🎉",
          description: pendingItemPurchase.is_credit_campaign
            ? `${pendingItemPurchase.credit_cost} credits added to your account`
            : `${pendingItemPurchase.title} unlocked!`,
        });
        
        // Close modal and reload data
        setPendingItemPurchase(null);
        setSelectedUnlock(null);
        await loadData();
        onRedemption?.();
      } catch (error) {
        // Reset transaction tracking to allow retry
        processedTxRef.current = null;
        
        console.error('Metal purchase error:', error);
        
        // Persist failed transaction for recovery (with error handling)
        try {
          if (typeof window !== 'undefined' && usdcTxHash) {
            const failedTx = {
              txHash: usdcTxHash,
              itemId: pendingItemPurchase?.id,
              itemTitle: pendingItemPurchase?.title,
              timestamp: Date.now(),
              error: error instanceof Error ? error.message : 'Unknown error'
            };
            localStorage.setItem(`failed_metal_tx_${usdcTxHash}`, JSON.stringify(failedTx));
          }
        } catch (storageError) {
          console.error('Failed to persist transaction to localStorage:', storageError);
        }
        
        toast({
          title: "Purchase Failed",
          description: error instanceof Error 
            ? error.message 
            : `Failed to process purchase. Transaction hash: ${usdcTxHash}. Please contact support.`,
          variant: "destructive",
        });
        setPendingItemPurchase(null);
      } finally {
        setIsRedeeming(false);
      }
    };
    
    processMetalPurchase();
  }, [isUSDCSuccess, usdcTxHash, pendingItemPurchase, user, clubId, metalHolder.data, buyPresaleAsync, userStatus, onRedemption, toast]);

  // Reset state on USDC errors (user rejection, RPC/contract errors)
  useEffect(() => {
    if (!usdcError) return;
    toast({
      title: 'USDC Transfer Failed',
      description: usdcError instanceof Error ? usdcError.message : 'Transaction was not sent',
      variant: 'destructive',
    });
    setSelectedUnlock(null);
    setIsRedeeming(false);
    processedTxRef.current = null;
  }, [usdcError, toast]);

  const loadData = useCallback(async (signal?: AbortSignal, isMounted?: () => boolean) => {
    try {
      if (!isMounted || isMounted()) setIsLoading(true);
      
      // Get unified auth headers (supports both Privy and Farcaster)
      let headers: HeadersInit = {};
      
      if (isAuthenticated) {
        try {
          const { getAuthHeaders } = await import('@/app/api/sdk');
          const authHeaders = await getAuthHeaders();
          headers = authHeaders;
        } catch (error) {
          console.warn('[UnlockRedemption] Auth failed, loading in public mode:', error);
        }
      }
      
      const response = await fetch(`/api/clubs/${clubId}/tier-rewards`, {
        headers,
        signal
      });

      if (response.ok) {
        const tierRewardsData = await response.json() as TierRewardsResponse;
        
        // Convert tier rewards to unlock format for existing UI + campaign fields
        const convertedUnlocks: Unlock[] = (tierRewardsData.available_rewards || []).map((reward: TierReward) => ({
          id: reward.id,
          club_id: clubId,
          title: reward.title,
          description: reward.description,
          type: reward.reward_type,
          min_status: reward.tier,
          is_active: reward.current_status === 'available',
          metadata: {
            ...(reward.metadata ?? {}),
            redemption_instructions: reward.metadata?.instructions,
            // Add credit campaign metadata for perk-details-modal
            is_credit_campaign: reward.is_credit_campaign,
            credit_cost: reward.credit_cost
            // Note: cogs_cents excluded - sensitive commercial data
          },
          
          // Enhanced with campaign and discount fields
          campaign_id: reward.campaign_id,
          campaign_title: reward.campaign_title,
          campaign_description: reward.campaign_description,
          campaign_status: reward.campaign_status,
          metal_presale_id: reward.metal_presale_id, // CRITICAL: Metal presale ID
          is_campaign_tier: reward.is_campaign_tier,
          campaign_progress: reward.campaign_progress,
          user_discount_eligible: reward.user_discount_eligible,
          user_discount_amount_cents: reward.user_discount_amount_cents,
          user_discount_percentage: reward.user_discount_percentage,
          user_final_price_cents: reward.user_final_price_cents,
          discount_description: reward.discount_description,
          
          // Add club information for details modal
          club_info: reward.clubs ? {
            id: reward.clubs.id,
            name: reward.clubs.name,
            description: reward.clubs.description,
            city: reward.clubs.city,
            image_url: reward.clubs.image_url
          } : null,
          // Add tier rewards specific fields
          user_can_claim_free: reward.user_can_claim_free,
          claim_options: reward.claim_options,
          tier_boost_price_cents: reward.tier_boost_price_cents,
          direct_unlock_price_cents: reward.direct_unlock_price_cents,
          inventory_status: reward.inventory_status,
          
          // Credit campaign fields
          credit_cost: reward.credit_cost,
          is_credit_campaign: reward.is_credit_campaign,
          user_credit_balance: reward.campaign_id ? (tierRewardsData.user_credit_balances?.[reward.campaign_id] || 0) : 0
          // Note: cogs_cents excluded - sensitive commercial data
        }) as any as Unlock);
        
        // Convert claimed rewards to redemption format
        const convertedRedemptions = (tierRewardsData.claimed_rewards || []).map((claim: ClaimedReward) => ({
          id: claim.id,
          unlock_id: claim.reward_id,
          user_id: 'current_user',
          status: 
            claim.access_status === 'granted' ? 'confirmed' :
            claim.access_status === 'pending' ? 'pending' :
            'cancelled',
          metadata: {
            access_code: claim.access_code
          },
          redeemed_at: claim.claimed_at
        }));

        // Sort unlocks by price (cheapest first) - Campaign MVP: no free claims, only discounts
        const sortedUnlocks = sortUnlocksByPrice(convertedUnlocks);

        if (!isMounted || isMounted()) setUnlocks(sortedUnlocks);
        if (!isMounted || isMounted()) setRedemptions(convertedRedemptions);
        
        // Extract campaign data for parent component (support both tier campaigns and credit campaigns)
        const campaignTier = convertedUnlocks.find((unlock: any) => 
          (unlock.is_campaign_tier || unlock.is_credit_campaign) && unlock.campaign_progress
        );
        
        // Defer campaign data update to avoid setState during render
        if (campaignTier && onCampaignDataChange && campaignTier.campaign_progress) {
          queueMicrotask(() => {
            // Check if still mounted before updating state
            // Allow callback when isMounted guard not provided (initial load, manual reloads)
            if (!isMounted || isMounted()) {
              const campaignData = {
                campaign_id: campaignTier.campaign_id,
                campaign_title: campaignTier.campaign_title,
                campaign_description: campaignTier.campaign_description,
                campaign_status: campaignTier.campaign_status,
                metal_presale_id: campaignTier.metal_presale_id, // CRITICAL: Include Metal presale ID
                campaign_progress: campaignTier.campaign_progress
              };
              
              onCampaignDataChange(campaignData);
            }
          });
        }
      } else {
        console.error('Failed to fetch tier rewards:', response.status);
        if (!isMounted || isMounted()) setUnlocks([]);
        if (!isMounted || isMounted()) setRedemptions([]);
      }
    } catch (error) {
      // Ignore AbortError - it's expected when component unmounts
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error loading data:', error);
      if (!isMounted || isMounted()) setUnlocks([]);
      if (!isMounted || isMounted()) setRedemptions([]);
    } finally {
      if (!isMounted || isMounted()) setIsLoading(false);
    }
  }, [clubId, isAuthenticated, onCampaignDataChange]);

  // Load data on mount
  useEffect(() => {
    const ac = new AbortController();
    let mounted = true;
    
    loadData(ac.signal, () => mounted).catch((error: unknown) => {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error loading data:', error);
      }
    });
    
    return () => { 
      mounted = false; 
      ac.abort(); 
    };
  }, [clubId, loadData]);

  // Expose stable refetch function to parent
  const refetch = useCallback(() => loadData(), [loadData]);
  useEffect(() => {
    onRefetchReady?.(refetch);
  }, [onRefetchReady, refetch]);

  const isUnlockAvailable = (unlock: Unlock) => {
    // Campaign items are ALWAYS available (never locked)
    if (unlock.is_credit_campaign) {
      const notSoldOut = unlock.inventory_status !== 'sold_out' && unlock.inventory_status !== 'unavailable';
      const isActive = unlock.is_active !== false;
      return isActive && notSoldOut;
    }
    
    // Campaign MVP: Check if user has upgrade options (no free claims)
    if (unlock.user_can_claim_free !== undefined) {
      const notSoldOut = unlock.inventory_status !== 'sold_out' && unlock.inventory_status !== 'unavailable';
      const isActive = unlock.is_active !== false;
      // Only available if has claim options (discounted pricing)
      return isActive && notSoldOut && hasClaimOptions(unlock);
    }
    
    // Fallback to original logic for backward compatibility
    const requiredPoints = STATUS_POINTS[unlock.min_status as ClubStatus] ?? 0;
    return userPoints >= requiredPoints;
  };

  const getUnlockRedemption = (unlock: Unlock) => {
    return redemptions.find(redemption => redemption.unlock_id === unlock.id);
  };

  const isUnlockRedeemed = (unlock: Unlock) => {
    const redemption = getUnlockRedemption(unlock);
    if (!redemption) return false;
    
    // For campaign items, only show as "redeemed" if campaign is funded AND access granted
    // Having a purchase record doesn't mean it's redeemed yet
    if (unlock.is_credit_campaign) {
      const isCampaignFunded = unlock.campaign_status === 'funded' || 
        (unlock.campaign_progress?.funding_percentage || 0) >= 100;
      return isCampaignFunded && redemption.status === 'confirmed';
    }
    
    // For regular tier rewards, having a confirmed claim means it's redeemed
    return redemption.status === 'confirmed';
  };

  const getStatusProgress = (requiredStatus: string) => {
    const requiredPoints = STATUS_POINTS[requiredStatus as ClubStatus] ?? 0;
    const progress = requiredPoints > 0
      ? Math.min((userPoints / requiredPoints) * 100, 100)
      : 100;
    return progress;
  };

  const formatCurrencyOrFree = (cents?: number) =>
    cents ? formatCurrency(cents) : 'Free';

  // Helper to normalize claim_options (handle array and object shapes)
  const getClaimOptionsPurchaseType = (unlock: Unlock): 'tier_boost' | 'direct_unlock' | null => {
    if (!unlock.claim_options) return null;
    
    // Handle array shape
    if (Array.isArray(unlock.claim_options)) {
      const option = unlock.claim_options[0];
      return option?.upgrade?.purchase_type || null;
    }
    
    // Handle object shape
    if (typeof unlock.claim_options === 'object') {
      const claimObj = unlock.claim_options as any;
      // Try multiple possible paths for purchase_type
      return claimObj.upgrade?.purchase_type || 
             claimObj.purchase_type || 
             claimObj.type || 
             null;
    }
    
    return null;
  };

  // Helper to check if claim_options is available (array or object)
  const hasClaimOptions = (unlock: Unlock): boolean => {
    if (!unlock.claim_options) return false;
    
    if (Array.isArray(unlock.claim_options)) {
      return unlock.claim_options.length > 0;
    }
    
    if (typeof unlock.claim_options === 'object') {
      return Object.keys(unlock.claim_options).length > 0;
    }
    
    return false;
  };


  const handleRedeem = async (unlock: Unlock) => {
    // Campaign MVP: Always handle as upgrade purchase (no free claims)
    if (hasClaimOptions(unlock)) {
      // Handle upgrade purchase flow
      handleUpgradePurchase(unlock);
      return;
    }

    if (!isUnlockAvailable(unlock)) {
      toast({
        title: "Unlock Not Available",
        description: `You need ${unlock.min_status} status to access this perk`,
        variant: "destructive",
      });
      return;
    }

    setIsRedeeming(true);

    try {
      // Get unified auth headers
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`/api/clubs/${clubId}/tier-rewards/${unlock.id}/claim`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const resultData = await response.json() as any;
        
        // Close current modal
        setSelectedUnlock(null);
        
        // Reload data to update UI state
        await loadData();
        
        // Show full-screen confirmation
        const payload = (resultData && typeof resultData === 'object' && 'redemption' in resultData)
          ? resultData.redemption
          : resultData;
        onShowRedemptionConfirmation?.(payload, unlock);
        
        // Callback for parent component
        onRedemption?.();
      } else {
        const errorData = await response.json();
        const errorMsg = errorData as { error?: string };
        
        // Handle specific error cases
        if (response.status === 409) {
          // Conflict - already redeemed, reload data to sync UI
          await loadData();
          toast({
            title: "Already Redeemed",
            description: "You've already redeemed this perk. Check your email for details.",
            variant: "default",
          });
          return;
        }
        
        throw new Error(errorMsg.error || 'Failed to redeem unlock');
      }
    } catch (error) {
      toast({
        title: "Redemption Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const getUnlockIcon = (type: string) => {
    const IconComponent = UNLOCK_TYPE_ICONS[type] || Gift;
    return IconComponent;
  };

  // getStatusColor removed - unused helper

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className="flex-shrink-0 w-48 rounded-3xl overflow-hidden bg-gray-900/40 animate-pulse"
            style={{ aspectRatio: '3/4' }}
          >
            <div className="h-full bg-muted"></div>
          </div>
        ))}
      </div>
    );
  }

  if (unlocks.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Campaigns Coming Soon</h3>
          <p className="text-muted-foreground">
            Your status sets your discount. Earn points now and get ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Handle credit redemption for campaign items (1 credit = $1)
  const handleCreditRedemption = async (unlock: Unlock) => {
    // Double-submit protection: check and set flag atomically
    if (isRedeeming) {
      return;
    }
    setIsRedeeming(true);

    try {
      // Input validation
      if (!unlock.campaign_id) {
        throw new Error('Campaign ID is required for credit redemption');
      }

      // Validate and coerce credit_cost to positive integer
      const creditCost = typeof unlock.credit_cost === 'number' ? unlock.credit_cost : Number(unlock.credit_cost);
      if (!Number.isInteger(creditCost) || creditCost <= 0) {
        throw new Error('Invalid credit cost: must be a positive integer');
      }

      // Get unified auth headers
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();

      // Redeem credits for the item using validated integer value
      const response = await fetch(`/api/campaigns/${unlock.campaign_id}/items/${unlock.id}/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          credits_to_spend: creditCost
        })
      });

      if (response.ok) {
        const result = await response.json() as { message?: string };
        
        toast({
          title: "Item Redeemed! 🎉",
          description: result.message || `Successfully redeemed ${unlock.title}`,
        });

        // Reload data to update credit balances and claimed status
        await loadData();
        onRedemption?.();
        
      } else if (response.status === 409) {
        // Handle 409 Conflict - reload data to sync UI with server state
        toast({
          title: "Redemption Conflict",
          description: "Item already claimed or conflicting request. Please refresh and try again.",
          variant: "destructive",
        });
        // Reload data to reflect server state
        await loadData();
        return; // Exit early after reload
      } else {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to redeem credits');
      }

    } catch (error) {
      console.error('Error redeeming credits:', error);
      toast({
        title: "Redemption Failed",
        description: error instanceof Error ? error.message : "Failed to redeem credits",
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleStripeCheckout = async (url: string) => {
    await navigateToCheckout(url, isInWalletApp, openUrl);
  };

  const handleNewPurchaseEndpoint = async (reward: Unlock, authHeaders: HeadersInit) => {
    const response = await fetch(`/api/tier-rewards/${reward.id}/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });

    if (response.ok) {
      const result = await response.json();
      const url = (result as PurchaseResponse)?.stripe_session_url;
      if (!url || typeof url !== 'string') {
        throw new Error('Missing checkout URL');
      }
      
      // Show discount confirmation if applicable
      const purchaseResult = result as PurchaseResponse;
      if ((purchaseResult?.discount_applied_cents ?? 0) > 0) {
        toast({
          title: "Discount Applied!",
          description: `You're saving $${(purchaseResult.discount_applied_cents/100).toFixed(0)} with your ${userStatus} status`,
        });
      }
      
      await handleStripeCheckout(url);
    } else {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to start purchase');
    }
  };

  const handleLegacyUpgrade = async (reward: Unlock, authHeaders: HeadersInit) => {
    const purchaseType = getClaimOptionsPurchaseType(reward) || 'tier_boost';

    const response = await fetch(`/api/clubs/${clubId}/tier-rewards/${reward.id}/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        purchase_type: purchaseType,
        success_url: `${window.location.origin}${window.location.pathname}?upgrade_success=true`,
        cancel_url: `${window.location.origin}${window.location.pathname}?upgrade_cancelled=true`
      })
    });

    if (response.ok) {
      const result = await response.json() as { stripe_session_url?: string };
      const url = result?.stripe_session_url;
      if (!url || typeof url !== 'string') {
        throw new Error('Missing checkout URL');
      }
      
      await handleStripeCheckout(url);
    } else {
      const errorData = await response.json() as { error?: string };
      throw new Error(errorData.error || 'Failed to start upgrade purchase');
    }
  };

  const handleUpgradePurchase = async (reward: Unlock) => {
    // If cart mode is enabled, add to cart instead of immediate purchase
    if (onAddToCart) {
      onAddToCart({
        id: reward.id,
        title: reward.title,
        isCreditCampaign: reward.is_credit_campaign,
        creditCost: reward.credit_cost,
        campaignId: reward.campaign_id,
        finalPriceCents: reward.user_final_price_cents,
        upgradePriceCents: reward.upgrade_price_cents,
        discountCents: reward.user_discount_amount_cents
      });
      setSelectedUnlock(null); // Close the confirmation dialog
      return;
    }
    
    try {
      // Wallet app users: Metal Presale flow with USDC (matches campaign-progress-card.tsx)
      if (isInWalletApp) {
        if (!metalHolder.data?.address) {
          throw new Error("Metal holder address not available");
        }
        
        // Validate Metal holder address
        if (!isAddress(metalHolder.data.address)) {
          throw new Error("Invalid Metal holder address");
        }

        // Determine the amount to pay (credit cost or regular price)
        const amountUSDC = reward.is_credit_campaign 
          ? (reward.credit_cost || 0)
          : ((reward.user_final_price_cents || reward.upgrade_price_cents || 0) / 100);
        
        // Validate amount
        if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
          throw new Error("Invalid purchase amount");
        }

        // Store pending purchase for processing after confirmation
        setPendingItemPurchase(reward);
        
        // Lock UI
        setIsRedeeming(true);

        // Send USDC to Metal holder address (triggers Metal presale)
        sendUSDC({
          toAddress: metalHolder.data.address as `0x${string}`,
          amountUSDC: amountUSDC,
        });

        // Note: Processing continues in useEffect when isUSDCSuccess triggers
        return;
      }
      
      // Web users: Stripe checkout flow
      setIsRedeeming(true);
      
      // Get auth headers (supports both Privy and Farcaster)
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();

      // Use new campaign-aware purchase endpoint if available, fallback to legacy
      const useNewPurchaseEndpoint = reward.user_discount_eligible !== undefined;
      
      if (useNewPurchaseEndpoint) {
        await handleNewPurchaseEndpoint(reward, authHeaders);
      } else {
        await handleLegacyUpgrade(reward, authHeaders);
      }
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to start purchase",
        variant: "destructive",
      });
      setIsRedeeming(false);
      setPendingItemPurchase(null);
    } finally {
      // Reset state for web users OR if wallet checkout failed before sending USDC
      // For successful wallet flows, state is reset in the USDC success useEffect
      if (!isInWalletApp || !pendingItemPurchase) {
        setIsRedeeming(false);
      }
    }
  };


  return (
    <>
      
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {unlocks.map((unlock, index) => {
          const IconComponent = getUnlockIcon(unlock.type);
          const isAvailable = isUnlockAvailable(unlock);
          const progress = getStatusProgress(unlock.min_status);

          return (
            <motion.div
              key={unlock.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex-shrink-0"
            >
              <div 
                className={`relative w-48 rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-900/40 border-2 cursor-pointer transition-all shadow-xl backdrop-blur-sm ${
                  !isAvailable 
                    ? 'opacity-75 border-gray-700/50' 
                    : !isAuthenticated
                      ? 'border-primary/30 hover:border-primary/50 animate-pulse-border'
                      : 'border-gray-700/50 hover:border-gray-600'
                }`}
                onClick={() => {
                  // Prompt login if not authenticated
                  if (!isAuthenticated && onLoginRequired) {
                    onLoginRequired();
                    return;
                  }
                  
                  const redemption = getUnlockRedemption(unlock);
                  
                  // For campaign items, only show details if actually redeemed (access granted)
                  // Having a purchase doesn't prevent buying more!
                  const showDetails = redemption && (
                    !unlock.is_credit_campaign || 
                    redemption.status === 'confirmed'
                  );
                  
                  if (showDetails) {
                    // Actually redeemed - show details modal
                    onShowPerkDetails?.(unlock, redemption);
                  } else if (unlock.is_credit_campaign) {
                    // For credit campaigns, show preview modal with purchase handler
                    onShowPerkDetails?.(unlock, null, () => handleUpgradePurchase(unlock));
                  } else {
                    // Regular tier reward - show redemption modal
                    setSelectedUnlock(unlock);
                  }
                }}
                style={{ aspectRatio: '3/4' }} // Tall poster aspect ratio like screenshot
              >
                {/* Background Image/Icon Area */}
                <div className="absolute inset-0">
                  {unlock.metadata?.image_url ? (
                    // Campaign item with image (no icon overlay)
                    <div className="relative w-full h-full">
                      <img 
                        src={unlock.metadata.image_url} 
                        alt={unlock.metadata?.image_alt || unlock.title}
                        className="w-full h-full object-cover opacity-60"
                      />
                      {/* Gradient overlay for text readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
                    </div>
                  ) : (
                    // Fallback to gradient + icon
                    <div className="relative w-full h-full bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-500/30 flex items-center justify-center">
                      <IconComponent className={`h-20 w-20 ${isAvailable ? 'text-white/90' : 'text-gray-400'}`} />
                      {/* Gradient overlay for text readability */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    </div>
                  )}
                  
                  {/* Top badges */}
                  <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                    
                    {/* Top left badge */}
                    <div className="flex flex-col gap-1 items-start">
                      {unlock.is_credit_campaign ? (
                        // Campaign items - show ownership count (number of times purchased)
                        (() => {
                          // Count how many times user purchased this specific item
                          const purchaseCount = redemptions.filter(r => r.unlock_id === unlock.id).length;
                          
                          if (purchaseCount > 0) {
                            return <Badge variant="default" className="bg-blue-600/90 backdrop-blur-sm">🎁 You own {purchaseCount}</Badge>;
                          }
                          return null;
                        })()
                      ) : (
                        // Regular tier rewards - show tier badge or redeemed status
                        isUnlockRedeemed(unlock) ? (
                          <Badge variant="default" className="bg-blue-600/90 backdrop-blur-sm">Redeemed</Badge>
                        ) : (
                          <Badge 
                            variant="secondary" 
                            className={`${getStatusBgColor(unlock.min_status as any)} ${getStatusBorderColor(unlock.min_status as any)} ${getStatusTextColor(unlock.min_status as any)} backdrop-blur-sm border font-medium ${!isAvailable ? 'opacity-75' : ''} flex items-center gap-1`}
                          >
                            {!isAvailable && <Lock className="h-3 w-3" />}
                            {unlock.min_status.charAt(0).toUpperCase() + unlock.min_status.slice(1)}
                          </Badge>
                        )
                      )}
                    </div>
                    
                    {/* Top right cart indicator */}
                    {cart.find(item => item.id === `item-${unlock.id}`)?.quantity && (
                      <div className="bg-primary text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shadow-lg">
                        {cart.find(item => item.id === `item-${unlock.id}`)!.quantity}
                      </div>
                    )}
                  </div>
                  
                  {/* Progress bar for locked items - not shown for campaign items */}
                  {!unlock.is_credit_campaign && !isAvailable && (
                    <div className="absolute top-14 left-3 right-3">
                      <div className="w-full bg-gray-800/70 rounded-full h-1">
                        <div 
                          className="bg-primary h-1 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                
                {/* Bottom Content - Enhanced with discount pricing */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                  <h4 className="font-bold text-white text-lg mb-1 line-clamp-2">
                    {unlock.title}
                  </h4>
                  
                  {/* Enhanced info - Support both tier rewards and credit campaigns */}
                  <div className={`text-sm font-medium mb-2 ${getStatusTextColor(unlock.min_status as any)}`}>
                    {unlock.is_credit_campaign ? (
                      // Credit campaign display - always show credit cost
                      <span className="text-green-400">💵 {unlock.credit_cost || 0} Credit{(unlock.credit_cost || 0) > 1 ? 's' : ''}</span>
                    ) : (
                      // Regular tier reward display
                      unlock.user_discount_eligible && (unlock.user_discount_amount_cents ?? 0) > 0
                        ? `${unlock.user_discount_percentage}% Discount`
                        : `Requires ${unlock.min_status.charAt(0).toUpperCase() + unlock.min_status.slice(1)}`
                    )}
                  </div>
                  
              {/* Pricing display - Show credit count for campaigns, USD for tier rewards */}
              {unlock.is_credit_campaign ? (
                <div className="mb-2">
                  <div className="text-green-400 font-bold text-lg">
                    {unlock.credit_cost || 0} Credit{(unlock.credit_cost || 0) !== 1 ? 's' : ''}
                  </div>
                </div>
              ) : unlock.user_discount_eligible && unlock.user_discount_amount_cents && unlock.user_discount_amount_cents > 0 && (
                    <div className="mb-2 text-xs">
                      <div className="flex items-center justify-between text-white/60">
                        <span className="line-through">${((unlock.upgrade_price_cents || 0) / 100).toFixed(0)}</span>
                        <span className="text-green-400 font-medium">Save ${(unlock.user_discount_amount_cents / 100).toFixed(0)}</span>
                      </div>
                      <div className="text-green-400 font-bold text-sm">
                        ${(((unlock.upgrade_price_cents || 0) - unlock.user_discount_amount_cents) / 100).toFixed(0)}
                      </div>
                    </div>
                  )}
                  
                  {/* Action Button - Enhanced with discount info */}
                  <button
                    className={`w-full py-2.5 px-4 rounded-full text-sm font-semibold transition-colors ${
                      isUnlockRedeemed(unlock)
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : !isAuthenticated
                          ? 'bg-primary text-white hover:bg-primary/90'
                        : isAvailable 
                          ? 'bg-white text-gray-900 hover:bg-gray-100' 
                          : 'bg-gray-700/80 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={isAuthenticated && !isAvailable && !isUnlockRedeemed(unlock)}
                    onClick={(e) => {
                      e.stopPropagation();
                      
                      // Prompt login if not authenticated
                      if (!isAuthenticated && onLoginRequired) {
                        onLoginRequired();
                        return;
                      }
                      
                      const redemption = getUnlockRedemption(unlock);
                      
                      // For campaign items, only show details if actually redeemed (access granted)
                      // Having a purchase doesn't prevent buying more!
                      const showDetails = redemption && (
                        !unlock.is_credit_campaign || 
                        redemption.status === 'confirmed'
                      );
                      
                      if (showDetails) {
                        // Actually redeemed - show details
                        onShowPerkDetails?.(unlock, redemption);
                      } else if (unlock.is_credit_campaign) {
                        // Credit campaign logic (1 credit = $1)
                        const userCredits = (unlock as any).user_credit_balance || 0;
                        const isCampaignFunded = unlock.campaign_status === 'funded' || 
                          (unlock.campaign_progress?.funding_percentage || 0) >= 100;
                        
                        // Only allow redemption if campaign is funded
                        if (isCampaignFunded && userCredits >= (unlock.credit_cost || 0)) {
                          // Campaign funded AND user has enough credits - handle redemption
                          handleCreditRedemption(unlock);
                        } else {
                          // Campaign not funded OR user needs more credits - show purchase flow
                          setSelectedUnlock(unlock);
                        }
                      } else if (isAvailable) {
                        // Regular tier reward flow
                        setSelectedUnlock(unlock);
                      }
                    }}
                  >
                    {!isAuthenticated
                      ? 'Log In to Preorder'
                      : isUnlockRedeemed(unlock) 
                      ? 'Open Details' 
                      : isAvailable 
                        ? (() => {
                            // Credit campaign button text (1 credit = $1)
                            if (unlock.is_credit_campaign) {
                              const userCredits = (unlock as any).user_credit_balance || 0;
                              const creditCost = unlock.credit_cost || 0;
                              const isCampaignFunded = unlock.campaign_status === 'funded' || 
                                (unlock.campaign_progress?.funding_percentage || 0) >= 100;
                              
                              // Only show "Redeem" if campaign is funded AND user has credits
                              if (isCampaignFunded && userCredits >= creditCost) {
                                return 'Redeem';
                              } else {
                                // Show "Add to Cart" when cart mode enabled, else "Commit Credits"
                                return onAddToCart ? 'Add to Cart' : 'Commit Credits';
                              }
                            }
                            
                            // Regular tier reward pricing
                            if (onAddToCart) {
                              return 'Add to Cart';
                            } else if (unlock.user_discount_eligible && unlock.user_final_price_cents !== undefined) {
                              return `Commit ${formatCurrency(unlock.user_final_price_cents)}`;
                            } else {
                              // Fallback to upgrade pricing if no discount available
                              const purchaseType = getClaimOptionsPurchaseType(unlock);
                              const price = purchaseType === 'direct_unlock' 
                                ? unlock.direct_unlock_price_cents 
                                : unlock.tier_boost_price_cents;
                              const verb = purchaseType === 'direct_unlock' ? 'Commit' : 'Commit';
                              return `${verb} ${formatCurrencyOrFree(price)}`;
                            }
                          })()
                        : 'Locked'
                    }
                  </button>
                </div>
                
                {/* Subtle glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none"></div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pre-Purchase Confirmation Modal */}
      <Dialog open={!!selectedUnlock} onOpenChange={(open) => { if (!open) setSelectedUnlock(null); }}>
        {selectedUnlock && (
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(getUnlockIcon(selectedUnlock.type), { 
                  className: "h-5 w-5 text-primary" 
                })}
                Confirm Your Purchase
              </DialogTitle>
              <div className="text-sm text-muted-foreground">
                Review the details before proceeding to checkout
              </div>
            </DialogHeader>
            
            <div className="px-4 py-4 space-y-4">
              {/* Item Image and Basic Info */}
              <div className="flex gap-4">
                {selectedUnlock.metadata?.image_url && (
                  <img
                    src={selectedUnlock.metadata.image_url}
                    alt={selectedUnlock.title}
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{selectedUnlock.title}</h3>
                  {selectedUnlock.campaign_title && (
                    <Badge variant="secondary" className="mt-1 bg-primary/10 text-primary border-primary/20">
                      {selectedUnlock.campaign_title}
                    </Badge>
                  )}
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {selectedUnlock.description}
                  </p>
                </div>
              </div>

              <div className="h-[1px] w-full bg-border" />
              
              
              {/* Pricing - Clean display */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-muted-foreground">Price</span>
                <div className="text-right">
                  <div className="text-3xl font-bold text-foreground">
                    {selectedUnlock.is_credit_campaign
                      ? `${selectedUnlock.credit_cost || 0} Credit${(selectedUnlock.credit_cost || 0) !== 1 ? 's' : ''}`
                      : formatCurrency(
                          (selectedUnlock.user_final_price_cents ??
                           selectedUnlock.upgrade_price_cents ?? 0)
                        )}
                  </div>
                </div>
              </div>

              <div className="h-[1px] w-full bg-border" />

              {/* Delivery Information */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Delivery & Fulfillment
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium">Estimated Delivery</span>
                    <Badge variant="outline" className="font-normal">
                      2 months
                    </Badge>
                  </div>
                  
                  <div>
                    <h5 className="text-xs font-medium mb-2 text-muted-foreground">Fulfillment Instructions:</h5>
                    <ul className="space-y-1.5">
                      <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        Your commitment helps reach the funding goal
                      </li>
                      <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        Items are ordered after campaign succeeds
                      </li>
                      <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        Full refund if goal isn't met by deadline
                      </li>
                      <li className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        You'll receive claim details via email
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer Actions */}
            <div className="flex flex-col gap-2 rounded-b-lg border-t px-4 py-3 sm:flex-row sm:justify-end bg-muted/30">
              <Button
                onClick={() => {
                  // Credit campaigns use purchase flow, regular tiers use redeem flow
                  if (selectedUnlock.is_credit_campaign) {
                    handleUpgradePurchase(selectedUnlock);
                  } else {
                    handleRedeem(selectedUnlock);
                  }
                }}
                disabled={isRedeeming || !isUnlockAvailable(selectedUnlock) || isUSDCLoading || (isInWalletApp && metalHolder.isLoading)}
                className="min-w-[140px] sm:w-auto w-full"
              >
                {(isInWalletApp && metalHolder.isLoading)
                  ? 'Initializing Wallet...'
                  : isUSDCLoading 
                    ? 'Confirming Transaction...'
                    : isRedeeming 
                      ? 'Processing...' 
                      : onAddToCart
                        ? 'Add to Cart'
                        : (isInWalletApp && metalHolder.data?.address)
                          ? selectedUnlock.is_credit_campaign 
                            ? `Send ${selectedUnlock.credit_cost} USDC`
                            : `Pay ${((selectedUnlock.user_final_price_cents || selectedUnlock.upgrade_price_cents || 0) / 100).toFixed(0)} USDC`
                          : 'Proceed to Checkout'
                }
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedUnlock(null)}
                className="sm:w-auto w-full"
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
