"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Play, CheckCircle, ArrowRight } from "lucide-react";

interface CampaignData {
  campaign_id: string;
  campaign_title: string;
  campaign_status: string;
  campaign_progress: {
    funding_percentage: number;
    current_funding_cents: number;
    goal_funding_cents: number;
    seconds_remaining: number;
  };
}

interface CampaignProgressCardProps {
  campaignData: CampaignData;
}

export function CampaignProgressCard({ campaignData }: CampaignProgressCardProps) {
  const pct = Math.round(Math.max(0, Math.min(100, campaignData.campaign_progress.funding_percentage)));
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  
  // Calculate remaining amount needed
  const remainingCents = Math.max(0, campaignData.campaign_progress.goal_funding_cents - campaignData.campaign_progress.current_funding_cents);
  const remainingAmount = usd0.format(remainingCents / 100);

  return (
    <motion.div 
      className="mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative bg-gray-900/80 border-gray-700/50 p-6 overflow-hidden">
        {/* Campaign Title */}
        <h3 className="text-xl font-semibold text-white mb-6">
          {campaignData.campaign_title}
        </h3>

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
              <p className="text-sm text-gray-400">{usd0.format(campaignData.campaign_progress.current_funding_cents / 100)} raised</p>
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
              <p className="text-sm text-green-400">{usd0.format(campaignData.campaign_progress.goal_funding_cents / 100)} goal</p>
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
              {remainingAmount} to go
            </span>
            <motion.span 
              className="font-semibold text-green-400"
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
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full relative"
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

        {/* Status Description - moved below progress bar */}
        <motion.div 
          className="flex items-center gap-2 text-gray-300 mt-4"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
          <span className="text-sm">Items will become redeemable when the goal is reached.</span>
        </motion.div>
      </Card>
    </motion.div>
  );
}