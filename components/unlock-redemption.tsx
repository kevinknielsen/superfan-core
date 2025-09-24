"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ExternalLink,
  Zap
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
import { STATUS_COLORS, STATUS_ICONS } from "@/types/club.types";
import { getAccessToken } from "@privy-io/react-auth";
import { getStatusTextColor, getStatusBgColor, getStatusBorderColor } from "@/lib/status-colors";
import type { Unlock as BaseUnlock } from "@/types/club.types";
import type { TierRewardsResponse, PurchaseResponse, TierReward, ClaimedReward } from "@/types/campaign.types";
import TicketBalance from "./ticket-balance";

// Helper to get current quarter end date in UTC
const getQuarterEndDate = () => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-based
  const currentQuarter = Math.floor(currentMonth / 3) + 1; // 1-4
  
  // Calculate last day of current quarter
  const quarterEndMonth = currentQuarter * 3; // 3, 6, 9, 12
  // Create date using UTC - day 0 means last day of previous month
  const quarterEndDate = new Date(Date.UTC(currentYear, quarterEndMonth, 0));
  
  return quarterEndDate;
};

// Helper to format quarter end date consistently in UTC
const formatQuarterEnd = () => {
  const quarterEnd = getQuarterEndDate();
  const now = new Date();
  return quarterEnd.toLocaleDateString('en-US', { 
    timeZone: 'UTC',
    month: 'short', 
    day: 'numeric',
    year: quarterEnd.getUTCFullYear() !== now.getUTCFullYear() ? 'numeric' : undefined 
  });
};

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
  } | null;
  
  // Enhanced with campaign and discount fields
  campaign_id?: string;
  campaign_title?: string;
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
  
  // NEW: Ticket campaign fields
  ticket_cost?: number;
  is_ticket_campaign?: boolean;
  cogs_cents?: number;
  user_ticket_balance?: number;
}

type Unlock = BaseUnlock & TierRewardFields;

interface UnlockRedemptionProps {
  clubId: string;
  clubName: string;
  userStatus: string;
  userPoints: number;
  onRedemption?: () => void;
  onShowRedemptionConfirmation?: (redemption: any, unlock: Unlock) => void;
  onShowPerkDetails?: (unlock: Unlock, redemption: any) => void;
  onCampaignDataChange?: (campaignData: any) => void;
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
  onRedemption,
  onShowRedemptionConfirmation,
  onShowPerkDetails,
  onCampaignDataChange
}: UnlockRedemptionProps) {
  const { toast } = useToast();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUnlock, setSelectedUnlock] = useState<Unlock | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    loadData(ac.signal).catch((error) => {
      if (error.name !== 'AbortError') {
        console.error('Error loading data:', error);
      }
    });
    return () => ac.abort();
  }, [clubId]);

  const loadData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      // Get auth token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      // Load tier rewards data using new API
      const response = await fetch(`/api/clubs/${clubId}/tier-rewards`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        signal
      });

      if (response.ok) {
        const tierRewardsData = await response.json() as TierRewardsResponse;
        
        // Convert tier rewards to unlock format for existing UI + campaign fields
        const convertedUnlocks = (tierRewardsData.available_rewards || []).map((reward: TierReward) => ({
          id: reward.id,
          club_id: clubId,
          title: reward.title,
          description: reward.description,
          type: reward.reward_type,
          min_status: reward.tier,
          is_active: reward.current_status === 'available',
          metadata: {
            ...(reward.metadata ?? {}),
            redemption_instructions: reward.metadata?.instructions
          },
          
          // Enhanced with campaign and discount fields
          campaign_id: reward.campaign_id,
          campaign_title: reward.campaign_title,
          campaign_status: reward.campaign_status,
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
            city: reward.clubs.city
          } : null,
          // Add tier rewards specific fields
          user_can_claim_free: reward.user_can_claim_free,
          claim_options: reward.claim_options,
          tier_boost_price_cents: reward.tier_boost_price_cents,
          direct_unlock_price_cents: reward.direct_unlock_price_cents,
          inventory_status: reward.inventory_status,
          
          // NEW: Ticket campaign fields
          ticket_cost: reward.ticket_cost,
          is_ticket_campaign: reward.is_ticket_campaign,
          cogs_cents: reward.cogs_cents,
          user_ticket_balance: tierRewardsData.user_ticket_balances?.[reward.campaign_id] || 0
        }));
        
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

        setUnlocks(sortedUnlocks);
        setRedemptions(convertedRedemptions);
        
        // Extract campaign data for parent component (support both tier campaigns and ticket campaigns)
        const campaignTier = convertedUnlocks.find((unlock: Unlock) => 
          (unlock.is_campaign_tier || unlock.is_ticket_campaign) && unlock.campaign_progress
        );
        
        if (campaignTier && onCampaignDataChange) {
          onCampaignDataChange({
            campaign_id: campaignTier.campaign_id,
            campaign_title: campaignTier.campaign_title,
            campaign_status: campaignTier.campaign_status,
            campaign_progress: {
              funding_percentage: campaignTier.campaign_progress?.funding_percentage || 0,
              seconds_remaining: campaignTier.campaign_progress?.seconds_remaining || 0,
              current_funding_cents: campaignTier.campaign_progress?.current_funding_cents || 0,
              goal_funding_cents: campaignTier.campaign_progress?.funding_goal_cents || 0
            }
          });
        }
      } else {
        console.error('Failed to fetch tier rewards:', response.status);
        setUnlocks([]);
        setRedemptions([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setUnlocks([]);
      setRedemptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const isUnlockAvailable = (unlock: Unlock) => {
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
    return !!getUnlockRedemption(unlock);
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
      // Get auth token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/clubs/${clubId}/tier-rewards/${unlock.id}/claim`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const result = await response.json();
        
        // Close current modal
        setSelectedUnlock(null);
        
        // Reload data to update UI state
        await loadData();
        
        // Show full-screen confirmation
        const payload = (result && typeof result === 'object' && 'redemption' in result)
          ? (result as any).redemption
          : result;
        onShowRedemptionConfirmation?.(payload, unlock);
        
        // Callback for parent component
        onRedemption?.();
      } else {
        const errorData = await response.json() as { error?: string };
        
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
        
        throw new Error(errorData.error || 'Failed to redeem unlock');
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

  // NEW: Handle ticket redemption for campaign items
  const handleTicketRedemption = async (unlock: Unlock) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      setIsRedeeming(true);

      // Redeem tickets for the item
      const response = await fetch(`/api/campaigns/${unlock.campaign_id}/items/${unlock.id}/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          tickets_to_spend: unlock.ticket_cost
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        toast({
          title: "Item Redeemed! 🎉",
          description: result.message || `Successfully redeemed ${unlock.title}`,
        });

        // Reload data to update ticket balances and claimed status
        await loadData();
        onRedemption?.();
        
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to redeem tickets');
      }

    } catch (error) {
      console.error('Error redeeming tickets:', error);
      toast({
        title: "Redemption Failed",
        description: error instanceof Error ? error.message : "Failed to redeem tickets",
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleUpgradePurchase = async (reward: Unlock) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      // Use new campaign-aware purchase endpoint if available, fallback to existing
      const useNewPurchaseEndpoint = reward.user_discount_eligible !== undefined;
      
      if (useNewPurchaseEndpoint) {
        // New campaign purchase endpoint with instant discounts
        const response = await fetch(`/api/tier-rewards/${reward.id}/purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const result = await response.json() as PurchaseResponse;
          const url = result?.stripe_session_url;
          if (!url || typeof url !== 'string') {
            throw new Error('Missing checkout URL');
          }
          
          // Show discount confirmation if applicable
          if ((result?.discount_applied_cents ?? 0) > 0) {
            toast({
              title: "Discount Applied!",
              description: `You're saving $${(result.discount_applied_cents/100).toFixed(0)} with your ${userStatus} status`,
            });
          }
          
          window.location.href = url;
        } else {
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error || 'Failed to start purchase');
        }
      } else {
        // Existing upgrade endpoint for backward compatibility
        const purchaseType = getClaimOptionsPurchaseType(reward) || 'tier_boost';

        const response = await fetch(`/api/clubs/${clubId}/tier-rewards/${reward.id}/upgrade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            purchase_type: purchaseType,
            success_url: `${window.location.origin}${window.location.pathname === '/' ? '/dashboard' : window.location.pathname}?upgrade_success=true`,
            cancel_url: `${window.location.origin}${window.location.pathname === '/' ? '/dashboard' : window.location.pathname}?upgrade_cancelled=true`
          })
        });

        if (response.ok) {
          const result = await response.json() as { stripe_session_url?: string };
          const url = result?.stripe_session_url;
          if (!url || typeof url !== 'string') {
            throw new Error('Missing checkout URL');
          }
          window.location.href = url;
        } else {
          const errorData = await response.json() as { error?: string };
          throw new Error(errorData.error || 'Failed to start upgrade purchase');
        }
      }
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to start purchase",
        variant: "destructive",
      });
    }
  };

  // NEW: Get unique campaigns with ticket balances
  const ticketCampaigns = unlocks
    .filter(unlock => unlock.is_ticket_campaign && unlock.campaign_id)
    .reduce((campaigns, unlock) => {
      const campaignId = unlock.campaign_id!;
      if (!campaigns[campaignId]) {
        const ticket_cost_safe = Number(unlock.ticket_cost) || 0;
        const upgrade_price_cents_safe = Number(unlock.upgrade_price_cents) || 0;
        const ticket_price = ticket_cost_safe > 0 ? upgrade_price_cents_safe / ticket_cost_safe : 0;
        
        campaigns[campaignId] = {
          campaign_id: campaignId,
          campaign_title: unlock.campaign_title || 'Campaign',
          ticket_balance: unlock.user_ticket_balance || 0,
          ticket_price: ticket_price // Price per ticket
        };
      }
      return campaigns;
    }, {} as Record<string, any>);

  return (
    <>
      {/* NEW: Show ticket balances for campaigns */}
      {Object.values(ticketCampaigns).map((campaign: any) => (
        <TicketBalance
          key={campaign.campaign_id}
          campaignId={campaign.campaign_id}
          campaignTitle={campaign.campaign_title}
          ticketBalance={campaign.ticket_balance}
          ticketPrice={campaign.ticket_price}
        />
      ))}
      
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
                className={`relative w-48 rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-700/50 cursor-pointer transition-all hover:border-gray-600 shadow-xl backdrop-blur-sm ${
                  !isAvailable ? 'opacity-75' : ''
                }`}
                onClick={() => {
                  const redemption = getUnlockRedemption(unlock);
                  if (redemption) {
                    // Already redeemed - show persistent details modal
                    onShowPerkDetails?.(unlock, redemption);
                  } else if (unlock.is_ticket_campaign) {
                    // NEW: For ticket campaigns, show preview modal even if not redeemed
                    onShowPerkDetails?.(unlock, null); // null = preview mode
                  } else {
                    // Regular tier reward - show redemption modal
                    setSelectedUnlock(unlock);
                  }
                }}
                style={{ aspectRatio: '3/4' }} // Tall poster aspect ratio like screenshot
              >
                {/* Background Image/Icon Area */}
                <div className="absolute inset-0">
                  <div className="relative w-full h-full bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-500/30 flex items-center justify-center">
                    <IconComponent className={`h-20 w-20 ${isAvailable ? 'text-white/90' : 'text-gray-400'}`} />
                    
                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  </div>
                  
                  {/* Top badges */}
                  <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                    
                    {/* Status badge */}
                    <div className="flex flex-col gap-1 items-end">
                      {isUnlockRedeemed(unlock) ? (
                        <Badge variant="default" className="bg-blue-600/90 backdrop-blur-sm">Redeemed</Badge>
                      ) : (
                        <Badge 
                          variant="secondary" 
                          className={`${getStatusBgColor(unlock.min_status as any)} ${getStatusBorderColor(unlock.min_status as any)} ${getStatusTextColor(unlock.min_status as any)} backdrop-blur-sm border font-medium ${!isAvailable ? 'opacity-75' : ''} flex items-center gap-1`}
                        >
                          {!isAvailable && <Lock className="h-3 w-3" />}
                          {unlock.min_status.charAt(0).toUpperCase() + unlock.min_status.slice(1)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress bar for locked items */}
                  {!isAvailable && (
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
                  
                  {/* Enhanced info - Support both tier rewards and ticket campaigns */}
                  <div className={`text-sm font-medium mb-2 ${getStatusTextColor(unlock.min_status as any)}`}>
                    {unlock.is_ticket_campaign ? (
                      // Ticket campaign display
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400">🎟️ {unlock.ticket_cost} Ticket{unlock.ticket_cost > 1 ? 's' : ''}</span>
                        {unlock.user_discount_eligible && unlock.user_discount_percentage > 0 && (
                          <span className="text-green-400 text-xs">{unlock.user_discount_percentage}% off</span>
                        )}
                      </div>
                    ) : (
                      // Regular tier reward display
                      unlock.user_discount_eligible && (unlock.user_discount_amount_cents ?? 0) > 0
                        ? `${unlock.user_discount_percentage}% Discount`
                        : `Requires ${unlock.min_status.charAt(0).toUpperCase() + unlock.min_status.slice(1)}`
                    )}
                  </div>
                  
                  {/* Discount pricing display */}
                  {unlock.user_discount_eligible && unlock.user_discount_amount_cents && unlock.user_discount_amount_cents > 0 && (
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
                        : isAvailable 
                          ? 'bg-white text-gray-900 hover:bg-gray-100' 
                          : 'bg-gray-700/80 text-gray-400 cursor-not-allowed'
                    }`}
                    disabled={!isAvailable && !isUnlockRedeemed(unlock)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const redemption = getUnlockRedemption(unlock);
                      
                      if (redemption) {
                        // Already redeemed - show details
                        onShowPerkDetails?.(unlock, redemption);
                      } else if (unlock.is_ticket_campaign) {
                        // NEW: Ticket campaign logic
                        const userTickets = (unlock as any).user_ticket_balance || 0;
                        if (userTickets >= unlock.ticket_cost) {
                          // User has enough tickets - handle redemption
                          handleTicketRedemption(unlock);
                        } else {
                          // User needs more tickets - show purchase flow
                          setSelectedUnlock(unlock);
                        }
                      } else if (isAvailable) {
                        // Regular tier reward flow
                        setSelectedUnlock(unlock);
                      }
                    }}
                  >
                    {isUnlockRedeemed(unlock) 
                      ? 'Open Details' 
                      : isAvailable 
                        ? (() => {
                            // NEW: Ticket campaign button text
                            if (unlock.is_ticket_campaign) {
                              const userTickets = (unlock as any).user_ticket_balance || 0;
                              if (userTickets >= unlock.ticket_cost) {
                                return `Redeem ${unlock.ticket_cost} Ticket${unlock.ticket_cost > 1 ? 's' : ''}`;
                              } else {
                                const finalPrice = unlock.user_final_price_cents || unlock.upgrade_price_cents || 0;
                                return `Buy ${unlock.ticket_cost} Ticket${unlock.ticket_cost > 1 ? 's' : ''} - ${formatCurrency(finalPrice)}`;
                              }
                            }
                            
                            // Regular tier reward pricing (unchanged)
                            if (unlock.user_discount_eligible && unlock.user_final_price_cents !== undefined) {
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

      {/* Redemption Modal */}
      <Dialog open={!!selectedUnlock} onOpenChange={(open) => { if (!open) setSelectedUnlock(null); }}>
        {selectedUnlock && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(getUnlockIcon(selectedUnlock.type), { 
                  className: "h-5 w-5 text-primary" 
                })}
                {selectedUnlock.title}
              </DialogTitle>
            </DialogHeader>
            
              <div className="space-y-4">
              <p className="text-muted-foreground">
                {selectedUnlock.description}
              </p>
              
              
              {/* Discount information for earned tiers */}
              {selectedUnlock.user_discount_eligible && selectedUnlock.user_discount_amount_cents && selectedUnlock.user_discount_amount_cents > 0 && (
                <div className="p-4 rounded-xl border border-green-200 bg-green-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    <span className="font-medium text-green-900">Your Status Discount</span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-lg font-bold text-green-600">
                      ${(selectedUnlock.user_final_price_cents! / 100).toFixed(0)}
                    </div>
                    <div className="text-sm text-green-600">
                      {selectedUnlock.discount_description}
                    </div>
                    {selectedUnlock.campaign_id && (
                      <div className="text-xs text-green-700">
                        Your ${(selectedUnlock.user_final_price_cents! / 100).toFixed(0)} payment adds ${((selectedUnlock.upgrade_price_cents || 0) / 100).toFixed(0)} to campaign progress
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Boost explanation for non-qualified users (legacy) */}
              {!selectedUnlock.user_can_claim_free && !selectedUnlock.user_discount_eligible && isUnlockAvailable(selectedUnlock) && (
                <div className={`p-4 rounded-xl border ${getStatusBgColor(selectedUnlock.min_status as any)} ${getStatusBorderColor(selectedUnlock.min_status as any)} backdrop-blur-sm`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${getStatusBgColor(selectedUnlock.min_status as any)} ${getStatusTextColor(selectedUnlock.min_status as any)}`}>
                      <Lock className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium mb-1 ${getStatusTextColor(selectedUnlock.min_status as any)}`}>
                        Boost to {selectedUnlock.min_status.charAt(0).toUpperCase() + selectedUnlock.min_status.slice(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Get temporary access until <strong>{formatQuarterEnd()}</strong> to claim this perk for free.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Only show redemption instructions if user has already redeemed */}
              {selectedUnlock.metadata?.redemption_instructions && isUnlockRedeemed(selectedUnlock) && (
                <div className="bg-muted p-3 rounded-lg">
                  <h4 className="font-medium mb-2">How to Redeem:</h4>
                  <p className="text-sm">
                    {selectedUnlock.metadata.redemption_instructions}
                  </p>
                </div>
              )}
              
              <div className="space-y-2 text-sm">
                {selectedUnlock.metadata?.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedUnlock.metadata.location}</span>
                  </div>
                )}
                
                {selectedUnlock.metadata?.expiry_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Valid until {
                        (() => {
                          try {
                            return new Date(selectedUnlock.metadata.expiry_date).toLocaleDateString();
                          } catch {
                            return selectedUnlock.metadata.expiry_date;
                          }
                        })()
                      }
                    </span>
                  </div>
                )}
                
                {selectedUnlock.metadata?.capacity && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Limited to {selectedUnlock.metadata.capacity} people</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedUnlock(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleRedeem(selectedUnlock)}
                  disabled={!isUnlockAvailable(selectedUnlock) || isRedeeming}
                >
                  {isRedeeming ? 'Processing...' : 
                   (() => {
                     // Campaign MVP: Always show discounted pricing, no free claims
                     if (selectedUnlock.user_discount_eligible && selectedUnlock.user_final_price_cents !== undefined) {
                       return `Commit ${formatCurrency(selectedUnlock.user_final_price_cents)}`;
                     } else {
                       // Fallback to upgrade pricing if no discount available
                       const purchaseType = getClaimOptionsPurchaseType(selectedUnlock);
                       const price = purchaseType === 'direct_unlock' 
                         ? selectedUnlock.direct_unlock_price_cents 
                         : selectedUnlock.tier_boost_price_cents;
                       const verb = purchaseType === 'direct_unlock' ? 'Commit' : 'Commit';
                       return `${verb} ${formatCurrencyOrFree(price)}`;
                     }
                   })()
                  }
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
