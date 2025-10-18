"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Calendar,
  Users,
  Star,
  Crown,
  Trophy,
  Shield,
  Share2,
  MapPin,
  ChevronLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { usePrivy } from "@privy-io/react-auth";
import type { Club, ClubMembership, ClubStatus } from "@/types/club.types";
import type { CampaignData } from "@/types/campaign.types";
import { getNextStatus, getPointsToNext, STATUS_COLORS } from "@/types/club.types";
import { STATUS_THRESHOLDS } from "@/lib/status";
import { useUnifiedPoints } from "@/hooks/unified-economy/use-unified-points";
import { useClub, useUserClubData, useJoinClub } from "@/hooks/use-clubs";
import { ClubMediaDisplay } from "@/components/club-media-display";
import UnifiedPointsWallet from "./unified-economy/unified-points-wallet";
import UnlockRedemption from "./unlock-redemption";
import PerkRedemptionConfirmation from "./perk-redemption-confirmation";
import PerkDetailsModal from "./perk-details-modal";
import Spinner from "./ui/spinner";
import { formatDate } from "@/lib/utils";
import { CampaignProgressCard } from "./campaign-progress-card";
import { useFarcaster } from "@/lib/farcaster-context";
import { navigateToCheckout } from "@/lib/navigation-utils";
import { useSendUSDC } from "@/hooks/use-usdc-payment";
import { useMetalHolder, useBuyPresale } from "@/hooks/use-metal-holder";

// Use compatible types with existing components
type RedemptionData = any; // Keep flexible for now since it comes from API
type UnlockData = any;     // Keep flexible for now since it comes from API

// Cart item types
interface CartItem {
  id: string;
  type: 'credits' | 'item';
  amount: number; // For credits: number of credits; For items: price in cents
  quantity: number; // How many times added
  title: string;
  // For items only
  itemId?: string;
  isCreditCampaign?: boolean;
  creditCost?: number;
  campaignId?: string;
  finalPriceCents?: number;
  originalPriceCents?: number;
  discountCents?: number;
}

interface ClubDetailsModalProps {
  club: Club;
  membership?: ClubMembership | null;
  onClose: () => void;
  isOpen: boolean;
  scrollToRewards?: boolean;
}

// Status icon mapping
const STATUS_ICONS = {
  cadet: Users,
  resident: Star,
  headliner: Trophy,
  superfan: Crown,
};




// Helper function to render club cover image (from clubs table, not club_media)
function renderClubImages(club: Club) {
  return (
    <img
      width="600"
      height="400"
      loading="lazy"
      decoding="async"
      src={club.image_url || "/placeholder.svg?height=400&width=600&query=music club"}
      alt={club.name}
      className="h-full w-full object-cover"
    />
  );
}

export default function ClubDetailsModal({
  club,
  membership: propMembership,
  onClose,
  isOpen,
  scrollToRewards = false,
}: ClubDetailsModalProps) {
  const { user, isAuthenticated } = useUnifiedAuth();
  const { login } = usePrivy();
  const { toast } = useToast();
  const { isInWalletApp, openUrl } = useFarcaster();
  const { sendUSDC, hash: usdcTxHash, isLoading: isUSDCLoading, isSuccess: isUSDCSuccess } = useSendUSDC();
  const metalHolder = useMetalHolder();
  const { mutateAsync: buyPresaleAsync } = useBuyPresale();
  
  // Cart state management
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // Clear campaign data on club change to avoid stale UI
  const [campaignData, setCampaignData] = useState<CampaignData | null>(null);
  const [creditBalances, setCreditBalances] = useState<Record<string, { campaign_title: string; balance: number }>>({});
  
  const modalRef = useRef<HTMLDivElement>(null);
  const rewardsRef = useRef<HTMLDivElement>(null);
  const [redemptionConfirmation, setRedemptionConfirmation] = useState<{
    redemption: RedemptionData;
    unlock: UnlockData;
  } | null>(null);
  const [perkDetails, setPerkDetails] = useState<{
    isOpen: boolean;
    unlock: UnlockData | null;
    redemption: RedemptionData | null;
    onPurchase?: () => void;
  }>({
    isOpen: false,
    unlock: null,
    redemption: null,
    onPurchase: undefined
  });
  
  // Get complete club data including unlocks
  const { data: clubData } = useClub(club.id);
  const { data: userClubData, refetch: refetchUserClubData } = useUserClubData(isAuthenticated ? (user?.id || null) : null, club.id);
  
  const membership = propMembership || userClubData?.membership;
  const joinClubMutation = useJoinClub();

  // Get unified points data - only when authenticated and has membership
  const enabled = Boolean(club.id && membership && isAuthenticated);
  const { breakdown, refetch } = useUnifiedPoints(club.id, { enabled });

  // Status calculations - must be before useEffect that uses currentStatus
  const currentStatus = (breakdown?.status.current || membership?.current_status || 'cadet') as ClubStatus;
  const currentPoints = breakdown?.wallet.status_points || membership?.points || 0;
  const nextStatus = (breakdown?.status.next_status || getNextStatus(currentStatus)) as ClubStatus | null;
  const rawPointsToNext = breakdown?.status.points_to_next ?? getPointsToNext(currentPoints, currentStatus);
  const pointsToNext = rawPointsToNext != null ? Math.max(0, rawPointsToNext) : null;

  // Clear campaign data and cart when switching clubs
  useEffect(() => { 
    setCampaignData(null);
    setCart([]);
  }, [club.id]);
  
  // Clear cart on successful payment (URL parameter from Stripe redirect)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('purchase_success') === 'true' && params.get('club_id') === club.id) {
        // Clear cart on confirmed successful payment
        clearCart();
        
        // Clean up URL parameters to prevent repeated clears on refresh/back
        const newParams = new URLSearchParams(window.location.search);
        newParams.delete('purchase_success');
        newParams.delete('club_id');
        newParams.delete('session_id');
        
        const newSearch = newParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [club.id]);
  
  // Stale cart cleanup - clear cart after 24 hours of inactivity
  useEffect(() => {
    const CART_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    if (cart.length > 0) {
      const timer = setTimeout(() => {
        console.log('[ClubDetailsModal] Clearing stale cart after 24h');
        clearCart();
        toast({
          title: "Cart Cleared",
          description: "Your cart was cleared due to inactivity",
        });
      }, CART_EXPIRY_MS);
      
      return () => clearTimeout(timer);
    }
  }, [cart, toast]);
  
  // Monitor USDC transaction success and process all cart items
  const processedCartTxRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isUSDCSuccess || !usdcTxHash || cart.length === 0 || !user) return;
    
    // Prevent duplicate processing
    if (processedCartTxRef.current === usdcTxHash) {
      return;
    }
    
    processedCartTxRef.current = usdcTxHash;
    
    const processCartPurchases = async () => {
      try {
        // Process each cart item
        for (const cartItem of cart) {
          if (cartItem.type === 'credits') {
            // Buy presale for credits
            const totalCredits = cartItem.amount * cartItem.quantity;
            if (cartItem.campaignId) {
              await buyPresaleAsync({
                user,
                campaignId: cartItem.campaignId,
                amount: totalCredits
              });
            }
            
            // Record credit purchase with timeout protection
            const { getAuthHeaders } = await import('@/app/api/sdk');
            const authHeaders = await getAuthHeaders();
            
            const controller1 = new AbortController();
            const timeout1 = setTimeout(() => controller1.abort(), 15_000);
            
            try {
              const response = await fetch('/api/metal/record-purchase', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': usdcTxHash, // Prevent duplicate recording
                  ...authHeaders
                },
                body: JSON.stringify({
                  club_id: club.id,
                  campaign_id: cartItem.campaignId,
                  credit_amount: totalCredits,
                  tx_hash: usdcTxHash,
                  metal_holder_id: metalHolder.data?.id,
                  metal_holder_address: metalHolder.data?.address
                }),
                signal: controller1.signal
              });
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({})) as any;
                throw new Error(errorData.error || 'Failed to record credit purchase');
              }
            } finally {
              clearTimeout(timeout1);
            }
          } else if (cartItem.itemId) {
            // Buy presale for item
            if (cartItem.campaignId) {
              const amountUSDC = (cartItem.amount * cartItem.quantity) / 100;
              await buyPresaleAsync({
                user,
                campaignId: cartItem.campaignId,
                amount: amountUSDC
              });
            }
            
            // Record item purchase with timeout protection
            const { getAuthHeaders: getAuthHeaders2 } = await import('@/app/api/sdk');
            const authHeaders2 = await getAuthHeaders2();
            
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 15_000);
            
            try {
              const response = await fetch('/api/metal/purchase-item', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': `${usdcTxHash}-${cartItem.itemId}`, // Prevent duplicate recording
                  ...authHeaders2
                },
                body: JSON.stringify({
                  tier_reward_id: cartItem.itemId,
                  club_id: club.id,
                  campaign_id: cartItem.campaignId,
                  amount_paid_cents: cartItem.finalPriceCents || cartItem.originalPriceCents || 0,
                  original_price_cents: cartItem.originalPriceCents || 0,
                  discount_applied_cents: cartItem.discountCents || 0,
                  tx_hash: usdcTxHash,
                  metal_holder_id: metalHolder.data?.id,
                  metal_holder_address: metalHolder.data?.address,
                  user_tier: currentStatus
                }),
                signal: controller2.signal
              });
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({})) as any;
                throw new Error(errorData.error || 'Failed to record item purchase');
              }
            } finally {
              clearTimeout(timeout2);
            }
          }
        }
        
        // Success - clear cart and show confirmation
        toast({
          title: "Purchase Successful! 🎉",
          description: `${cart.length} item(s) purchased`,
        });
        clearCart();
        setIsCheckingOut(false);
        await refetch(); // Refresh points/wallet data
        
      } catch (error) {
        // Reset for retry
        processedCartTxRef.current = null;
        console.error('Cart processing error:', error);
        toast({
          title: "Processing Failed",
          description: error instanceof Error ? error.message : "Failed to process cart. Transaction hash: " + usdcTxHash,
          variant: "destructive",
        });
        setIsCheckingOut(false);
      }
    };
    
    processCartPurchases();
  }, [isUSDCSuccess, usdcTxHash, cart, user, club.id, metalHolder.data, buyPresaleAsync, currentStatus, toast, refetch]);
  
  // Cart helper functions
  const addToCart = (item: Omit<CartItem, 'quantity'>) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        // Increment quantity for existing item
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      // Add new item with quantity 1
      return [...prev, { ...item, quantity: 1 }];
    });
  };
  
  const getTotalItems = () => cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const getTotalAmount = () => {
    return cart.reduce((sum, item) => {
      if (item.type === 'credits') {
        return sum + (item.amount * item.quantity * 100); // Credits to cents
      } else {
        return sum + (item.amount * item.quantity); // Already in cents
      }
    }, 0);
  };
  
  const clearCart = () => setCart([]);


  // REMOVED: Auto-trigger login (we now only prompt on interaction)
  // Login is triggered when user clicks items or purchase buttons

  const StatusIcon = STATUS_ICONS[currentStatus as keyof typeof STATUS_ICONS] ?? Users;


  const handleJoinClub = async () => {
    if (!isAuthenticated || !user?.id) {
      // Open Privy login modal instead of showing error toast
      login();
      return;
    }

    try {
      await joinClubMutation.mutateAsync({
        clubId: club.id,
      });
      
      // Refresh membership and points state
      await Promise.all([
        refetchUserClubData(),
        refetch() // Refresh unified points
      ]);
      
      toast({
        title: "Membership added!",
        description: `You've successfully joined ${club.name}`,
      });
    } catch (error) {
      console.error('Error joining club:', error);
      toast({
        title: "Failed to add membership",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };
  
  // Handle checkout - process all cart items
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsCheckingOut(true);
    
    try {
      if (isInWalletApp) {
        // Wallet users: Process with USDC (sequential transactions)
        await handleWalletCheckout();
      } else {
        // Web users: Process with Stripe (sequential sessions)
        await handleStripeCheckout();
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: "Checkout Failed",
        description: error instanceof Error ? error.message : "Failed to process checkout",
        variant: "destructive",
      });
      setIsCheckingOut(false);
    }
  };
  
  // Wallet checkout: One USDC transaction for total cart amount
  const handleWalletCheckout = async () => {
    if (!metalHolder.data?.address) {
      throw new Error("Metal holder not initialized");
    }
    
    // Validate Metal holder address
    const { isAddress } = await import('viem');
    if (!isAddress(metalHolder.data.address)) {
      throw new Error("Invalid Metal holder address");
    }
    
    // Calculate total USDC using integer math (USDC has 6 decimals)
    // Convert everything to micro-USDC (smallest unit), sum, then convert back
    let totalMicroUSDC = BigInt(0);
    
    for (const item of cart) {
      if (item.type === 'credits') {
        // Credits: 1 credit = 1 USDC = 1,000,000 micro-USDC
        const itemMicroUSDC = BigInt(item.amount) * BigInt(item.quantity) * BigInt(1_000_000);
        totalMicroUSDC += itemMicroUSDC;
      } else {
        // Items: price in cents, convert to micro-USDC (cents * 10,000)
        const itemMicroUSDC = BigInt(item.amount) * BigInt(item.quantity) * BigInt(10_000);
        totalMicroUSDC += itemMicroUSDC;
      }
    }
    
    // Convert micro-USDC to USDC (divide by 1,000,000)
    const totalUSDC = Number(totalMicroUSDC) / 1_000_000;
    
    if (!Number.isFinite(totalUSDC) || totalUSDC <= 0) {
      throw new Error("Invalid total amount");
    }
    
    // Send ONE USDC transaction for the entire cart
    sendUSDC({
      toAddress: metalHolder.data.address as `0x${string}`,
      amountUSDC: totalUSDC,
    });
    
    // Transaction monitoring will happen in useEffect
    // Keep cart until transaction succeeds
  };
  
  // Stripe checkout: Create one unified checkout session for all cart items
  const handleStripeCheckout = async () => {
    const { getAuthHeaders } = await import('@/app/api/sdk');
    const authHeaders = await getAuthHeaders();
    
    // Combine all credits into total amount
    const totalCredits = cart
      .filter(item => item.type === 'credits')
      .reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    
    // Get all items
    const items = cart.filter(item => item.type === 'item');
    
    // Generate idempotency key for cart checkout
    const idempotencyKey = `cart:${club.id}:${getTotalItems()}:${getTotalAmount()}`;
    
    // Create unified cart checkout
    const response = await fetch(`/api/campaigns/cart-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey, // Prevent duplicate sessions on retries
        ...authHeaders
      },
      body: JSON.stringify({
        club_id: club.id,
        total_credits: totalCredits,
        items: items.map(item => ({
          tier_reward_id: item.itemId,
          quantity: item.quantity,
          final_price_cents: item.finalPriceCents,
          original_price_cents: item.originalPriceCents,
          discount_cents: item.discountCents,
          campaign_id: item.campaignId
        })),
        success_url: `${window.location.origin}${window.location.pathname}?club_id=${club.id}&purchase_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}${window.location.pathname}?club_id=${club.id}&purchase_cancelled=true`
      })
    });
    
    if (response.ok) {
      const result = await response.json() as any;
      const url = result?.stripe_session_url;
      if (url) {
        // DO NOT clear cart here - preserve until payment confirmation
        // Cart will be cleared by webhook on successful payment or by user on return
        // This allows retry if redirect fails or user backs out
        await navigateToCheckout(url, isInWalletApp, openUrl);
        // Note: navigateToCheckout redirects the page, so code after won't execute
      } else {
        throw new Error('Missing checkout URL from server');
      }
    } else {
      const errorData = await response.json() as any;
      throw new Error(errorData.error || 'Failed to create unified checkout session');
    }
    
    setIsCheckingOut(false);
  };



  const handleTapIn = async (source: string) => {
    if (!isAuthenticated || !user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to earn points",
        variant: "destructive",
      });
      return;
    }

    if (!membership) {
      toast({
        title: "Add membership first",
        description: "You need to be a member to earn points",
        variant: "destructive",
      });
      return;
    }

    try {
      // TODO: Implement tap-in API call
      console.log('Tap-in source:', source, 'Club:', club.id);
      
      // Show informative message until API is implemented
      toast({
        title: "Tap-in Coming Soon",
        description: "Point earning will be available once the tap-in system is live!",
        variant: "default",
      });
    } catch (error) {
      console.error('Error recording tap-in:', error);
      toast({
        title: "Failed to record tap-in",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  // Close modal when clicking outside (temporarily disabled for unified points testing)
  useEffect(() => {
    // TODO: Re-enable outside click handler after unified points modals are working
    // const handleClickOutside = (event: MouseEvent) => {
    //   const target = event.target as Node;
    //   
    //   // Check if click is outside the main modal
    //   if (modalRef.current && !modalRef.current.contains(target)) {
    //     onClose();
    //   }
    // };

    // if (isOpen) {
    //   document.addEventListener("mousedown", handleClickOutside);
    // }

    // return () => {
    //   document.removeEventListener("mousedown", handleClickOutside);
    // };
  }, [isOpen, onClose]);

  // Add Escape key handling for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open (matches project modal)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // Scroll to rewards section when modal opens with scrollToRewards prop
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isOpen && scrollToRewards && membership) {
      // Wait for modal animation to complete, then scroll
      timer = setTimeout(() => {
        // Verify rewardsRef.current still exists before scrolling
        if (rewardsRef.current) {
          try {
            rewardsRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start' 
            });
          } catch (error) {
            console.error('Failed to scroll to rewards section:', error);
          }
        }
      }, 400); // Wait for modal slide-in animation
    }
    
    // Always clear timer in cleanup
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOpen, scrollToRewards, membership]);

  // Smart auto-scroll: When campaign is active, auto-scroll everyone to purchase section
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isOpen && campaignData && !scrollToRewards) {
      // Auto-scroll to campaign section for everyone when campaign is active
      timer = setTimeout(() => {
        if (rewardsRef.current) {
          try {
            rewardsRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start' 
            });
          } catch (error) {
            console.error('Failed to auto-scroll to campaign:', error);
          }
        }
      }, 600); // Slightly delayed to let modal fully render
    }
    
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isOpen, campaignData, scrollToRewards]);

  // Early return after all hooks
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          ref={modalRef}
          className="relative w-full h-full max-w-[430px] bg-[#0E0E14] md:rounded-3xl md:shadow-2xl md:max-h-[932px] flex flex-col"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto">
          
          {/* Header with Blurred Background */}
          <div className="relative h-80 w-full overflow-hidden md:rounded-t-3xl">
            {/* Blurred background image */}
            <div className="absolute inset-0 scale-110 blur-lg opacity-95">
              {renderClubImages(club)}
            </div>
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/40" />

            {/* Back button */}
            <button
              aria-label="Close club details"
              onClick={onClose}
              className="absolute left-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors z-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Share button */}
            <button
              className="absolute right-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors z-30"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!club) return;
                const url = `${window.location.origin}/dashboard?club_id=${club.id}&view=details`;
                try {
                  if (navigator.share) {
                    await navigator.share({ url, title: club.name });
                  } else {
                    await navigator.clipboard.writeText(url);
                    toast({
                      title: "Link copied!",
                      description: "Share this club with others.",
                    });
                  }
                } catch (err) {
                  // User cancelled share - don't show error
                  if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
                    return;
                  }
                  // Real error - show toast
                  toast({
                    variant: "destructive",
                    title: "Could not share",
                    description: "Try again or copy the URL from the address bar.",
                  });
                }
              }}
              title="Share club link"
            >
              <Share2 className="h-5 w-5" />
            </button>

            {/* Centered Club Profile */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-10">
              {/* Circular Avatar */}
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">
                  {renderClubImages(club)}
                </div>
              </div>

              {/* Club Name */}
              <h1 className="text-3xl font-bold text-white mb-2">
                {club.name}
              </h1>

              {/* Location */}
              {club.city && (
                <p className="text-lg text-white/80 flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  {club.city}
                </p>
              )}
            </div>
          </div>


          {/* Club details */}
          <div className="px-6 py-6">
            {/* Description */}
            <div className="mb-8">
              <h3 className="mb-3 text-xl font-semibold">About</h3>
              <p className="text-gray-300 text-base leading-relaxed">
                {club.description ||
                  "Add membership to this exclusive club for unique music experiences and perks."}
              </p>
            </div>

            {/* Store Section - Always visible to everyone (login prompt on interaction) */}
            <div className="mb-8" ref={rewardsRef}>
                {/* Main Section Header with Live Indicator */}
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-xl font-semibold">Releases</h3>
                  {!isAuthenticated && campaignData && (
                    <div className="relative flex items-center">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Explanatory subtitle when campaign is active */}
                {campaignData && (
                  <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                    Pre-order items below using credits; if the funding goal isn't reached, you'll receive a full refund.
                  </p>
                )}
                
                {/* Always show items and campaign - no login wall */}
                <UnlockRedemption
                  clubId={club.id}
                  clubName={club.name}
                  userStatus={currentStatus}
                  userPoints={currentPoints}
                  isAuthenticated={isAuthenticated}
                  onLoginRequired={() => login()}
                  onCampaignDataChange={setCampaignData}
                  onCreditBalancesChange={setCreditBalances}
                  onRedemption={async () => {
                    await refetch();
                    toast({
                      title: "Perk Redeemed!",
                      description: "Wallet and status updated",
                    });
                  }}
                  onShowRedemptionConfirmation={(redemption, unlock) => {
                    setRedemptionConfirmation({ redemption, unlock });
                  }}
                  onShowPerkDetails={(unlock, redemption, onPurchase) => {
                    setPerkDetails({ isOpen: true, unlock, redemption, onPurchase });
                  }}
                  onAddToCart={(item) => {
                    // Calculate the actual price in cents with validation
                    const priceCents = item.isCreditCampaign 
                      ? (item.creditCost ?? 0) * 100 // 1 credit = $1 = 100 cents
                      : (item.finalPriceCents ?? item.upgradePriceCents ?? 0);
                    
                    // Validate price exists
                    if (!priceCents || priceCents <= 0) {
                      toast({
                        title: "Error",
                        description: "Item has invalid pricing",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    addToCart({
                      id: `item-${item.id}`,
                      type: 'item',
                      amount: priceCents,
                      title: item.title,
                      itemId: item.id,
                      isCreditCampaign: item.isCreditCampaign,
                      creditCost: item.creditCost ?? 0,
                      campaignId: item.campaignId,
                      finalPriceCents: priceCents, // Store the calculated price for Stripe
                      originalPriceCents: item.upgradePriceCents ?? (item.creditCost ?? 0) * 100,
                      discountCents: item.discountCents ?? 0
                    });
                    toast({
                      title: "Added to Cart",
                      description: `${item.title} added`,
                    });
                  }}
                  cart={cart}
                />
                
                {/* Campaign Name and Description */}
                {campaignData && (
                  <div className="mt-6 mb-4">
                    <h4 className="text-lg font-semibold text-white">{campaignData.campaign_title}</h4>
                    {campaignData.campaign_description && (
                      <p className="text-sm text-gray-400 mt-1">{campaignData.campaign_description}</p>
                    )}
                  </div>
                )}
                
                {/* Campaign Progress Card - Always visible to create urgency */}
                {campaignData && (
                  <CampaignProgressCard 
                    campaignData={campaignData} 
                    clubId={club.id}
                    isAuthenticated={isAuthenticated}
                    onLoginRequired={() => login()}
                    onAddToCart={(creditAmount) => {
                      addToCart({
                        id: `credits-${creditAmount}`,
                        type: 'credits',
                        amount: creditAmount,
                        title: `${creditAmount} Credits`
                      });
                      toast({
                        title: "Added to Cart",
                        description: `${creditAmount} credits added`,
                      });
                    }}
                    cart={cart}
                  />
                )}
              </div>

            {/* Wallet Section - Moved Below Campaign Rewards */}
            {membership != null ? (
              <div className="mb-8">
                <h3 className="mb-4 text-xl font-semibold">Wallet</h3>
                <UnifiedPointsWallet 
                  clubId={club.id}
                  clubName={club.name}
                  isAuthenticated={isAuthenticated}
                  creditBalances={creditBalances}
                  onCloseWallet={() => {
                    // Scroll to campaign items
                    setTimeout(() => {
                      rewardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 300);
                  }}
                />
              </div>
            ) : (
              <div className="mb-8">
                <h3 className="mb-4 text-xl font-semibold">Join Club</h3>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6 text-center">
                  <h4 className="font-semibold text-white mb-2">Add Membership</h4>
                  <p className="text-gray-400">
                    Join this club to start earning points and unlocking exclusive perks
                  </p>
                  <button
                    onClick={handleJoinClub}
                    disabled={joinClubMutation.isPending}
                    className="mt-4 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {joinClubMutation.isPending ? "Joining..." : "Join Club"}
                  </button>
                </div>
              </div>
            )}

            {/* Latest Section - Club Media */}
            <div className="mb-8">
              <h3 className="mb-4 text-xl font-semibold">Latest</h3>
              {/* Container with responsive sizing - Desktop: video left, Mobile: centered */}
              <div className="flex justify-center md:justify-start">
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-700/50 shadow-2xl backdrop-blur-sm w-full max-w-2xl md:max-w-lg">
                  <div className="relative aspect-video md:aspect-[4/3]">
                    <ClubMediaDisplay
                      clubId={club.id}
                      className="w-full h-full"
                      showControls={true}
                      autoPlay={false}
                      fallbackImage="/placeholder.svg?height=400&width=600&query=music club"
                    />
                  {/* Subtle overlay for better text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                </div>
                
                {/* Enhanced content section */}
                <div className="p-5 bg-gradient-to-r from-gray-900/90 to-gray-800/90 backdrop-blur-sm">
                  <h4 className="font-bold text-white text-lg mb-3">Recent Updates from {club.name}</h4>
                  
                  {/* Cool accent line */}
                  <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-purple-400 rounded-full"></div>
                </div>
                
                {/* Subtle glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 pointer-events-none"></div>
                </div>
              </div>
            </div>

            {/* Club Details Grid - Moved to Bottom */}
            <div className="mb-8">
              <h3 className="mb-4 text-xl font-semibold">Details</h3>
              <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Founded</span>
                </div>
                <div className="font-medium text-white">
                  {formatDate(club.created_at)}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Status</span>
                </div>
                <div className="font-medium text-white">
                  {membership ? (
                    <span className={STATUS_COLORS[currentStatus as ClubStatus]}>
                      {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                    </span>
                  ) : (
                    "Not a member"
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Location</span>
                </div>
                <div className="font-medium text-white">{club.city || "Everywhere"}</div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Club Type</span>
                </div>
                <div className="font-medium text-white">
                  <span className="text-green-400">Verified</span>
                </div>
              </div>
              </div>
            </div>

            {/* Bottom spacing for anchored button */}
            <div className="h-20" />
          </div>
          </div>

          {/* Anchored Action Button - Always Visible */}
          <div className="relative bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0E0E14] via-[#0E0E14]/95 to-transparent md:rounded-b-3xl flex-shrink-0">
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                {membership ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (cart.length === 0) {
                        toast({
                          title: "Cart is Empty",
                          description: "Add items or credits to checkout",
                        });
                        return;
                      }
                      handleCheckout();
                    }}
                    disabled={isCheckingOut || cart.length === 0}
                    className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingOut ? (
                      "Processing..."
                    ) : cart.length === 0 ? (
                      "Checkout"
                    ) : (
                      `Checkout (${getTotalItems()} ${getTotalItems() === 1 ? 'item' : 'items'} - $${(getTotalAmount() / 100).toFixed(2)})`
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleJoinClub(); // Opens login modal if not authenticated
                    }}
                    disabled={joinClubMutation.isPending}
                    className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {joinClubMutation.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                    <span>{joinClubMutation.isPending ? "Adding Membership..." : "Add Membership"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
      
      
      {/* Perk Redemption Confirmation */}
      {redemptionConfirmation && (
        <PerkRedemptionConfirmation
          key="redemption-confirmation"
          isOpen={!!redemptionConfirmation}
          onClose={() => setRedemptionConfirmation(null)}
          redemption={redemptionConfirmation.redemption}
          unlock={redemptionConfirmation.unlock}
          clubName={club.name}
        />
      )}

      {/* Persistent Perk Details Modal */}
      <PerkDetailsModal
        key="perk-details"
        isOpen={perkDetails.isOpen}
        onClose={() => setPerkDetails({ isOpen: false, unlock: null, redemption: null, onPurchase: undefined })}
        perk={perkDetails.unlock}
        redemption={perkDetails.redemption}
        clubName={club.name}
        onPurchase={perkDetails.onPurchase}
      />
    </AnimatePresence>
  );
}