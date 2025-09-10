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
import type { Unlock as BaseUnlock } from "@/types/club.types";

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
  inventory_status?: string;
  metadata?: Record<string, any>;
  club_info?: {
    id: string;
    name: string;
    description?: string | null;
    city?: string | null;
  } | null;
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

export default function UnlockRedemption({ 
  clubId, 
  clubName,
  userStatus, 
  userPoints, 
  onRedemption,
  onShowRedemptionConfirmation,
  onShowPerkDetails
}: UnlockRedemptionProps) {
  const { toast } = useToast();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUnlock, setSelectedUnlock] = useState<Unlock | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    loadData();
  }, [clubId]);

  const loadData = async () => {
    try {
      // Get auth token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      // Load tier rewards data using new API
      const response = await fetch(`/api/clubs/${clubId}/tier-rewards`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const tierRewardsData = await response.json();
        
        // Convert tier rewards to unlock format for existing UI
        const convertedUnlocks = (tierRewardsData.available_rewards || []).map((reward: any) => ({
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
          inventory_status: reward.inventory_status
        }));
        
        // Convert claimed rewards to redemption format
        const convertedRedemptions = (tierRewardsData.claimed_rewards || []).map((claim: any) => ({
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

        setUnlocks(convertedUnlocks);
        setRedemptions(convertedRedemptions);
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
    // For tier rewards, check if user can claim free or has upgrade options
    if (unlock.user_can_claim_free !== undefined) {
      const notSoldOut = unlock.inventory_status !== 'sold_out' && unlock.inventory_status !== 'unavailable';
      const isActive = unlock.is_active !== false;
      return isActive && notSoldOut && (unlock.user_can_claim_free || hasClaimOptions(unlock));
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
      return claimObj.upgrade?.purchase_type || null;
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
    // Check if this is a tier reward with upgrade options
    if (!unlock.user_can_claim_free && hasClaimOptions(unlock)) {
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
        onShowRedemptionConfirmation?.(
          'redemption' in result ? result.redemption : result,
          unlock
        );
        
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

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "text-gray-400";
  };

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
          <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Unlocks Available</h3>
          <p className="text-muted-foreground">
            This club doesn't have any unlocks configured yet. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleUpgradePurchase = async (reward: Unlock) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      // Determine the correct purchase type from reward's claim options
      const purchaseType = getClaimOptionsPurchaseType(reward);
      
      if (!purchaseType) {
        throw new Error('No valid purchase type found in reward claim options');
      }

      const response = await fetch(`/api/clubs/${clubId}/tier-rewards/${reward.id}/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          purchase_type: purchaseType,
          success_url: `${window.location.origin}/dashboard?upgrade_success=true`,
          cancel_url: `${window.location.origin}/dashboard?upgrade_cancelled=true`
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Redirect to Stripe checkout
        window.location.href = result.stripe_session_url;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start upgrade purchase');
      }
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to start purchase",
        variant: "destructive",
      });
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
                className={`relative w-48 rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-700/50 cursor-pointer transition-all hover:border-gray-600 shadow-xl backdrop-blur-sm ${
                  !isAvailable ? 'opacity-75' : ''
                }`}
                onClick={() => {
                  const redemption = getUnlockRedemption(unlock);
                  if (redemption) {
                    // Already redeemed - show persistent details modal
                    onShowPerkDetails?.(unlock, redemption);
                  } else {
                    // Not redeemed - show redemption modal
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
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {isUnlockRedeemed(unlock) ? (
                      <Badge variant="default" className="bg-blue-600/90 backdrop-blur-sm">Redeemed</Badge>
                    ) : isAvailable ? (
                      <Badge variant="default" className="bg-green-600/90 backdrop-blur-sm">Available</Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1 bg-gray-800/90 backdrop-blur-sm">
                        <Lock className="h-3 w-3" />
                        Locked
                      </Badge>
                    )}
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
                
                {/* Bottom Content - Like poster titles */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                  <h4 className="font-bold text-white text-lg mb-1 line-clamp-2">
                    {unlock.title}
                  </h4>
                  
                  {/* Requirements info */}
                  <div className="text-xs text-gray-300 mb-3">
                    Requires {unlock.min_status} • {(STATUS_POINTS[unlock.min_status as ClubStatus] ?? 0)}+ pts
                  </div>
                  
                  {/* Action Button - Like screenshot */}
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
                        onShowPerkDetails?.(unlock, redemption);
                      } else if (isAvailable) {
                        setSelectedUnlock(unlock);
                      }
                    }}
                  >
                    {isUnlockRedeemed(unlock) 
                      ? 'Open Details' 
                      : isAvailable 
                        ? unlock.user_can_claim_free 
                          ? 'Claim Free'
                          : (() => {
                              const purchaseType = getClaimOptionsPurchaseType(unlock);
                              const price = purchaseType === 'direct_unlock' 
                                ? unlock.direct_unlock_price_cents 
                                : unlock.tier_boost_price_cents;
                              const verb = purchaseType === 'direct_unlock' ? 'Buy' : 'Boost';
                              return `${verb} for ${formatCurrencyOrFree(price)}`;
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
      <Dialog open={!!selectedUnlock} onOpenChange={() => setSelectedUnlock(null)}>
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
              
              {/* Boost explanation for non-qualified users */}
              {!selectedUnlock.user_can_claim_free && isUnlockAvailable(selectedUnlock) && (
                <div className="p-3 bg-muted/50 rounded-lg border border-muted">
                  <p className="text-sm text-muted-foreground">
                    Boost your status to <strong>{selectedUnlock.min_status}</strong> temporarily to claim and redeem this item for free.
                  </p>
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
                   selectedUnlock.user_can_claim_free ? 'Claim Free' :
                   (() => {
                     const purchaseType = getClaimOptionsPurchaseType(selectedUnlock);
                     const price = purchaseType === 'direct_unlock' 
                       ? selectedUnlock.direct_unlock_price_cents 
                       : selectedUnlock.tier_boost_price_cents;
                     const verb = purchaseType === 'direct_unlock' ? 'Buy' : 'Boost';
                     return `${verb} for ${formatCurrencyOrFree(price)}`;
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
