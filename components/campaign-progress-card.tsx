"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

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
  
  return (
    <motion.div 
      className="mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-gray-900/80 border-gray-700/50 p-4 overflow-hidden">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <div>
                <span className="text-gray-300 font-medium">
                  {campaignData.campaign_title}
                </span>
                <div className="text-sm text-gray-400 mt-1">
                  Items will become redeemable when the goal is reached
                </div>
              </div>
            </div>
            <motion.span 
              className="font-semibold text-purple-400"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            >
              {pct}%
            </motion.span>
          </div>

          <div
            className="w-full h-3 bg-gray-700/50 rounded-full overflow-hidden"
            role="progressbar"
            aria-label="Campaign progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
            >
              {/* Animated shine effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
              />
            </motion.div>
          </div>

          <div className="flex justify-between text-xs text-gray-400">
            <span>
              {usd0.format(campaignData.campaign_progress.current_funding_cents / 100)} raised
            </span>
            <span>
              {usd0.format(campaignData.campaign_progress.goal_funding_cents / 100)} goal
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
