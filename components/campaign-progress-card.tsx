"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle, ArrowRight, CreditCard, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@privy-io/react-auth";
import { useFarcaster } from "@/lib/farcaster-context";
import { navigateToCheckout } from "@/lib/navigation-utils";
import { useSendUSDC } from "@/hooks/use-usdc-payment";
import type { CampaignData } from "@/types/campaign.types";
import { useState, useEffect, useRef } from "react";
import { useMetalHolder, useBuyPresale } from "@/hooks/use-metal-holder";
import { useUnifiedAuth } from "@/lib/unified-auth-context";

interface CampaignProgressCardProps {
  campaignData: CampaignData;
  clubId?: string;
  isAuthenticated?: boolean;
  onLoginRequired?: () => void;
  onAddToCart?: (creditAmount: number) => void;
  cart?: Array<{ id: string; quantity: number }>;
}

export function CampaignProgressCard({
  campaignData,
  clubId,
  isAuthenticated = false,
  onLoginRequired,
  onAddToCart,
  cart = [],
}: CampaignProgressCardProps) {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const { toast } = useToast();
  const { isInWalletApp, openUrl } = useFarcaster();
  const {
    sendUSDC,
    hash: usdcTxHash,
    isLoading: isUSDCLoading,
    isSuccess: isUSDCSuccess,
    error: usdcError,
  } = useSendUSDC();
  const [pendingCreditAmount, setPendingCreditAmount] = useState<number | null>(
    null
  );
  const processedTxRef = useRef<string | null>(null);

  const { user } = useUnifiedAuth();
  const metalHolder = useMetalHolder();
  const { mutateAsync: buyPresaleAsync, isPending: isBuyingPresale } = useBuyPresale();
  const [isCreatingHolder, setIsCreatingHolder] = useState(false);

  // Pre-create Metal holder for wallet users on mount
  useEffect(() => {
    if (!isInWalletApp || !user?.id || metalHolder.data || metalHolder.isLoading) return;
    
    let aborted = false;
    const createHolder = async () => {
      if (aborted) return;
      setIsCreatingHolder(true);
      try {
        const { metal } = await import('@/lib/metal/client');
        let holder = await metal.getHolder(user.id).catch(() => null);
        if (!holder && !aborted) {
          console.log('[Campaign] Pre-creating Metal holder...');
          holder = await metal.createUser(user.id);
          if (!aborted) {
            // Trigger refetch so purchase flow can see the new holder
            metalHolder.refetch?.();
          }
        }
      } catch (e) {
        console.error('[Campaign] Failed to pre-create holder:', e);
      } finally {
        if (!aborted) setIsCreatingHolder(false);
      }
    };
    createHolder();
    
    return () => { aborted = true; };
  }, [isInWalletApp, user?.id, metalHolder.data, metalHolder.isLoading, metalHolder.refetch]);

  // Process Metal Presale purchase when USDC transaction succeeds
  useEffect(() => {
    if (!isUSDCSuccess || !usdcTxHash || !pendingCreditAmount || !user || !clubId) return;

    // Prevent duplicate processing
    if (processedTxRef.current === usdcTxHash) {
      return;
    }

    // Mark as processed immediately to prevent duplicate calls
    processedTxRef.current = usdcTxHash;

    const processPurchase = async () => {
      try {
        // Step 1: Buy presale with Metal
        // Use metal_presale_id (the actual Metal presale), not campaign_id
        const presaleId = campaignData.metal_presale_id || campaignData.campaign_id;
        
        console.log('[Campaign Card] About to call buyPresale:', {
          presaleId,
          metal_presale_id: campaignData.metal_presale_id,
          campaign_id: campaignData.campaign_id,
          usingCorrectId: !!campaignData.metal_presale_id,
          fullCampaignData: campaignData
        });
        
        const metalResult = await buyPresaleAsync({
          user,
          campaignId: presaleId,
          amount: pendingCreditAmount,
        });

        // Step 2: Record purchase in our database (mirrors Stripe webhook)
        const { getAuthHeaders } = await import("@/app/api/sdk");
        const authHeaders = await getAuthHeaders();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        const response = await fetch("/api/metal/record-purchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": usdcTxHash, // Prevent duplicate recording on retries
            ...authHeaders,
          },
          body: JSON.stringify({
            club_id: clubId,
            campaign_id: campaignData.campaign_id,
            credit_amount: pendingCreditAmount,
            tx_hash: usdcTxHash,
            metal_holder_id: metalHolder.data?.id,
            metal_holder_address: metalHolder.data?.address,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) {
          const errorData = (await response.json()) as any;
          throw new Error(errorData.error || "Failed to record purchase");
        }

        // Success!
        toast({
          title: "Purchase Successful! 🎉",
          description: `${pendingCreditAmount} credits added to your account`,
        });
        setPendingCreditAmount(null);
        setIsPurchasing(false);
      } catch (error) {
        // Reset transaction tracking to allow retry
        processedTxRef.current = null;

        console.error("Metal purchase error:", error);
        
        // Persist failed transaction for recovery (with error handling)
        try {
          if (typeof window !== 'undefined' && usdcTxHash) {
            const failedTx = {
              txHash: usdcTxHash,
              creditAmount: pendingCreditAmount,
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
          description:
            error instanceof Error
              ? error.message
              : `Failed to process purchase. Transaction hash: ${usdcTxHash}. Please contact support.`,
          variant: "destructive",
        });
        setPendingCreditAmount(null);
        setIsPurchasing(false);
      }
    };

    processPurchase();
  }, [isUSDCSuccess, usdcTxHash, pendingCreditAmount, user, clubId, campaignData.campaign_id, metalHolder.data, buyPresaleAsync, toast]);

  const pct = Math.round(
    Math.max(
      0,
      Math.min(100, campaignData.campaign_progress.funding_percentage)
    )
  );
  const usd0 = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  // Reset state on USDC errors (user rejection, RPC/contract errors)
  useEffect(() => {
    if (!usdcError) return;
    toast({
      title: "USDC Transfer Failed",
      description:
        usdcError instanceof Error
          ? usdcError.message
          : "Transaction was not sent",
      variant: "destructive",
    });
    setPendingCreditAmount(null);
    setIsPurchasing(false);
    processedTxRef.current = null;
  }, [usdcError, toast]);

  // Calculate remaining amount needed - handle null/undefined goal
  const goalCents = campaignData.campaign_progress.goal_funding_cents || 0;
  const currentCents =
    campaignData.campaign_progress.current_funding_cents || 0;
  const remainingCents = Math.max(0, goalCents - currentCents);
  const remainingAmount = usd0.format(remainingCents / 100);

  // Handle credit purchase flow
  const handleCreditPurchase = async (creditAmount: number) => {
    // Prompt login if not authenticated
    if (!isAuthenticated && onLoginRequired) {
      onLoginRequired();
      return;
    }

    // If cart mode is enabled, add to cart instead of immediate purchase
    if (onAddToCart) {
      onAddToCart(creditAmount);
      toast({
        title: "Added to Cart",
        description: `${creditAmount} credits added`,
      });
      return;
    }

    if (!clubId) {
      toast({
        title: "Error",
        description: "Club ID is required for credit purchases",
        variant: "destructive",
      });
      return;
    }

    try {
      if (isPurchasing || isCreatingHolder) return;
      setIsPurchasing(true);

      // Declare at function level to access in finally block
      let holderAddress: string | undefined;

      // Wallet app users: Metal Presale flow with USDC
      if (isInWalletApp) {
        // Ensure user is authenticated
        if (!user?.id) {
          throw new Error("Please log in to continue");
        }

        // Create Metal holder on-demand if it doesn't exist yet
        holderAddress = metalHolder.data?.address;
        
        if (!holderAddress && !isCreatingHolder) {
          setIsCreatingHolder(true); // Prevent concurrent creation
          console.log('[Campaign Purchase] Metal holder not ready, creating now...');
          toast({
            title: "Setting up wallet...",
            description: "Creating your Metal holder, one moment",
          });
          
          // Dynamically import to create holder
          const { metal } = await import('@/lib/metal/client');
          
          try {
            // Try to get holder first
            let holder = await metal.getHolder(user.id);
            
            // If doesn't exist, create it
            if (!holder) {
              console.log('[Campaign Purchase] Creating Metal holder for:', user.id);
              holder = await metal.createUser(user.id);
            }
            
            if (!holder?.address) {
              throw new Error("Failed to initialize Metal holder");
            }
            
            holderAddress = holder.address;
            console.log('[Campaign Purchase] Metal holder ready:', holder.address);
            
          } catch (error) {
            console.error('[Campaign Purchase] Error creating Metal holder:', error);
            throw new Error(`Failed to set up wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
          } finally {
            setIsCreatingHolder(false); // Always reset creation flag
          }
        }
        
        // Validate holder address
        const { isAddress } = await import("viem");
        if (!isAddress(holderAddress)) {
          throw new Error("Invalid Metal holder address");
        }

        // Validate amount
        if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
          throw new Error("Invalid credit amount");
        }

        // Store pending amount for processing after confirmation
        setPendingCreditAmount(creditAmount);

        // Send USDC to Metal holder address (triggers Metal presale)
        sendUSDC({
          toAddress: holderAddress as `0x${string}`,
          amountUSDC: creditAmount,
        });

        // Note: Processing continues in useEffect when isUSDCSuccess triggers
        return;
      }

      // Web users: Stripe checkout flow
      const { getAuthHeaders } = await import("@/app/api/sdk");
      const authHeaders = await getAuthHeaders();

      const response = await fetch(`/api/campaigns/credit-purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          club_id: clubId,
          credit_amount: creditAmount,
          success_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&purchase_success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&credit_purchase_cancelled=true`,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as any;
        const url = result?.stripe_session_url;
        if (!url || typeof url !== "string") {
          throw new Error("Missing checkout URL");
        }

        await navigateToCheckout(url, isInWalletApp, openUrl);
        // Note: Page will redirect, so state reset not critical but included for completeness
      } else {
        const errorData = (await response.json()) as any;
        throw new Error(errorData.error || "Failed to start credit purchase");
      }
    } catch (error) {
      console.error("Credit purchase error:", error);
      toast({
        title: "Purchase Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start credit purchase",
        variant: "destructive",
      });
    } finally {
      // Always reset state unless we're waiting for Metal/USDC transaction
      if (!isInWalletApp || !holderAddress) {
        setIsPurchasing(false);
      }
    }
  };

  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative bg-gray-900/80 border-gray-700/50 p-6 overflow-hidden">
        {/* Social Proof Badge - Hidden for now */}
        {/* <div className="absolute top-4 right-4 z-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5"
          >
            <Users className="w-3 h-3" />
            {Math.floor(campaignData.campaign_progress.current_funding_cents / 2500)} backers
          </motion.div>
        </div> */}

        {/* Side-by-side tier comparison */}
        <div className="flex items-center justify-between mb-6">
          {/* Current Tier - Live */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-900/30 text-blue-400"
              whileHover={{ scale: 1.05 }}
            >
              <Play className="w-6 h-6" />
            </motion.div>
            <div>
              <h4 className="text-lg font-semibold text-white">Live</h4>
              <p className="text-sm text-gray-400">
                {usd0.format(
                  campaignData.campaign_progress.current_funding_cents / 100
                )}{" "}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <ArrowRight className="w-5 h-5 text-gray-500" />
          </motion.div>

          {/* Next Tier - Completed */}
          <motion.div
            className="flex items-center gap-3 opacity-60"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 0.6 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-900/30 text-green-400"
              whileHover={{ scale: 1.05, opacity: 1 }}
            >
              <CheckCircle className="w-6 h-6" />
            </motion.div>
            <div>
              <h4 className="text-lg font-semibold text-white">Completed</h4>
              <p className="text-sm text-green-400">
                {goalCents > 0
                  ? usd0.format(goalCents / 100) + " goal"
                  : "No goal set"}
              </p>
            </div>
          </motion.div>
        </div>

        {/* Progress section */}
        <motion.div
          className="space-y-3"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-300 font-medium">
              {goalCents > 0 ? `${remainingAmount} to go` : "No goal set"}
            </span>
            <motion.span
              className="font-semibold text-blue-400"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
            >
              {pct}%
            </motion.span>
          </div>

          <div
            className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden"
            role="progressbar"
            aria-label="Campaign progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
          >
            <motion.div
              className="h-full bg-blue-500 rounded-full relative"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              {/* Animated shine effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Credit Purchase Buttons */}
        {clubId && (
          <motion.div
            className="mt-6 space-y-4"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            <div className="text-sm text-gray-300 text-center">
              Purchase Credits
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(() => {
                // Cache cart quantities to avoid repeated lookups (coerce to number for safety)
                const qty25 = Number(cart.find(item => item.id === 'credits-25')?.quantity ?? 0);
                const qty100 = Number(cart.find(item => item.id === 'credits-100')?.quantity ?? 0);
                const qty250 = Number(cart.find(item => item.id === 'credits-250')?.quantity ?? 0);
                
                return (
                  <>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        onClick={() => handleCreditPurchase(25)}
                        disabled={isPurchasing || isUSDCLoading || isBuyingPresale}
                        className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3 relative"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        {isUSDCLoading && pendingCreditAmount === 25
                          ? "Sending..."
                          : isBuyingPresale && pendingCreditAmount === 25
                          ? "Processing..."
                          : "25"}
                        {qty25 > 0 && (
                          <span className="absolute -top-2 -right-2 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                            {qty25}
                          </span>
                        )}
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        onClick={() => handleCreditPurchase(100)}
                        disabled={isPurchasing || isUSDCLoading || isBuyingPresale}
                        className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3 relative"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        {isUSDCLoading && pendingCreditAmount === 100
                          ? "Sending..."
                          : isBuyingPresale && pendingCreditAmount === 100
                          ? "Processing..."
                          : "100"}
                        {qty100 > 0 && (
                          <span className="absolute -top-2 -right-2 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                            {qty100}
                          </span>
                        )}
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        onClick={() => handleCreditPurchase(250)}
                        disabled={isPurchasing || isUSDCLoading || isBuyingPresale}
                        className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3 relative"
                      >
                        <CreditCard className="w-3 h-3 mr-1" />
                        {isUSDCLoading && pendingCreditAmount === 250
                          ? "Sending..."
                          : isBuyingPresale && pendingCreditAmount === 250
                          ? "Processing..."
                          : "250"}
                        {qty250 > 0 && (
                          <span className="absolute -top-2 -right-2 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                            {qty250}
                          </span>
                        )}
                      </Button>
                    </motion.div>
                  </>
                );
              })()}
            </div>

            {/* Credit Information Tooltip */}
            <div className="text-xs text-gray-400 text-center px-3 py-2 bg-gray-800/30 rounded-lg border border-gray-700/50">
              ✨ Credits never expire and can be used to claim future drops and
              items
            </div>
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}
