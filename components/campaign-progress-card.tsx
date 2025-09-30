"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle, ArrowRight, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@privy-io/react-auth";
import type { CampaignData } from "@/types/campaign.types";
import { useState } from "react";

interface CampaignProgressCardProps {
  campaignData: CampaignData;
  clubId?: string;
}

export function CampaignProgressCard({ campaignData, clubId }: CampaignProgressCardProps) {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const { toast } = useToast();
  
  const pct = Math.round(Math.max(0, Math.min(100, campaignData.campaign_progress.funding_percentage)));
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  
  // Calculate remaining amount needed - handle null/undefined goal
  const goalCents = campaignData.campaign_progress.goal_funding_cents || 0;
  const currentCents = campaignData.campaign_progress.current_funding_cents || 0;
  const remainingCents = Math.max(0, goalCents - currentCents);
  const remainingAmount = usd0.format(remainingCents / 100);

  // Handle credit purchase flow
  const handleCreditPurchase = async (creditAmount: number) => {
    if (!clubId) {
      toast({
        title: "Error",
        description: "Club ID is required for credit purchases",
        variant: "destructive"
      });
      return;
    }

    try {
      if (isPurchasing) return;
      setIsPurchasing(true);
      
      const token = await getAccessToken();
      if (!token) {
        toast({ 
          title: 'Sign in required', 
          description: 'Please sign in to purchase credits.', 
          variant: 'destructive' 
        });
        return;
      }
      
      const response = await fetch(`/api/campaigns/credit-purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          club_id: clubId,
          credit_amount: creditAmount,
          success_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&purchase_success=true`,
          cancel_url: `${window.location.origin}${window.location.pathname}?club_id=${clubId}&credit_purchase_cancelled=true`
        })
      });

      if (response.ok) {
        const result = await response.json() as any;
        const url = result?.stripe_session_url;
        if (!url || typeof url !== 'string') {
          throw new Error('Missing checkout URL');
        }
        window.location.href = url;
      } else {
        const errorData = await response.json() as any;
        throw new Error(errorData.error || 'Failed to start credit purchase');
      }
    } catch (error) {
      console.error('Credit purchase error:', error);
      toast({ 
        title: 'Purchase Failed', 
        description: error instanceof Error ? error.message : 'Failed to start credit purchase', 
        variant: 'destructive' 
      });
    } finally {
      setIsPurchasing(false);
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
              <p className="text-sm text-gray-400">{usd0.format(campaignData.campaign_progress.current_funding_cents / 100)} </p>
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
                {goalCents > 0 ? usd0.format(goalCents / 100) + ' goal' : 'No goal set'}
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
              {goalCents > 0 ? `${remainingAmount} to go` : 'No goal set'}
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
                animate={{ x: ['-100%', '100%'] }}
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
            <div className="text-sm text-gray-300 text-center">Purchase Credits</div>
            <div className="grid grid-cols-3 gap-3">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  onClick={() => handleCreditPurchase(100)}
                  disabled={isPurchasing}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  100
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  onClick={() => handleCreditPurchase(150)}
                  disabled={isPurchasing}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  150
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  onClick={() => handleCreditPurchase(250)}
                  disabled={isPurchasing}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 backdrop-blur-sm text-sm py-3"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  250
                </Button>
              </motion.div>
            </div>
            
            {/* Credit Information Tooltip */}
            <div className="text-xs text-gray-400 text-center px-3 py-2 bg-gray-800/30 rounded-lg border border-gray-700/50">
              ✨ Credits never expire and can be used to claim future drops and items
            </div>
          </motion.div>
        )}
      </Card>
    </motion.div>
  );
}