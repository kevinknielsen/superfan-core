"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Crown, Star, Trophy, Shield, ArrowRight, Sparkles } from "lucide-react";
import type { ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS } from "@/lib/status";
import { getStatusTextColor, getStatusBgColor, getStatusGradientClass } from "@/lib/status-colors";

interface CampaignData {
  campaign_id: string;
  campaign_title: string;
  campaign_status: string;
  campaign_progress: {
    funding_percentage: number;
    current_funding_cents: number;
    funding_goal_cents: number;
    seconds_remaining: number;
  };
}

interface StatusProgressionCardProps {
  currentStatus: ClubStatus;
  currentPoints: number;
  nextStatus: ClubStatus | null;
  pointsToNext: number | null;
  statusIcon: React.ComponentType<any>;
  campaignData?: CampaignData | null;
}

// Enhanced status icons mapping
const ENHANCED_STATUS_ICONS: Record<ClubStatus, React.ComponentType<any>> = {
  cadet: Shield,
  resident: Star,
  headliner: Trophy,
  superfan: Crown,
};


export function StatusProgressionCard({
  currentStatus,
  currentPoints,
  nextStatus,
  pointsToNext,
  statusIcon: StatusIcon,
  campaignData,
}: StatusProgressionCardProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [showSparkles, setShowSparkles] = useState(false);
  const sparkleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Calculate progress percentage and next tier points
  const currentThreshold = STATUS_THRESHOLDS[currentStatus] || 0;
  const nextThreshold = nextStatus ? STATUS_THRESHOLDS[nextStatus] : null;
  
  let progressPercentage = nextStatus ? 0 : 100; // If next tier exists but threshold is bad/missing, show 0%
  if (typeof nextThreshold === "number" && nextThreshold > currentThreshold) {
    const rawPercent = ((currentPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    progressPercentage = Math.max(0, Math.min(100, rawPercent));
  }

  const NextStatusIcon = nextStatus ? ENHANCED_STATUS_ICONS[nextStatus] : Crown;

  // Animate progress bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progressPercentage);
    }, 300);
    return () => clearTimeout(timer);
  }, [progressPercentage]);

  // Sparkle animation when near completion
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (progressPercentage > 80) {
      interval = setInterval(() => {
        if (sparkleTimeoutRef.current) clearTimeout(sparkleTimeoutRef.current);
        setShowSparkles(true);
        sparkleTimeoutRef.current = setTimeout(() => setShowSparkles(false), 1000);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (sparkleTimeoutRef.current) clearTimeout(sparkleTimeoutRef.current);
    };
  }, [progressPercentage]);


  return (
    <div className="mb-8 space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="mb-6 text-2xl font-semibold text-white">Your Status</h3>

        <Card className="relative bg-gray-900/80 border-gray-700/50 p-6 overflow-hidden">
          {/* Animated background sparkles */}
          <AnimatePresence>
            {showSparkles && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ 
                      opacity: 0, 
                      scale: 0,
                      x: Math.random() * 100 + '%',
                      y: Math.random() * 100 + '%'
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
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Side-by-side tier comparison */}
          <div className="flex items-center justify-between mb-6">
            {/* Current Tier */}
            <motion.div 
              className="flex items-center gap-3"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <motion.div 
                className={`flex items-center justify-center w-12 h-12 rounded-lg ${getStatusBgColor(currentStatus)} ${getStatusTextColor(currentStatus)}`}
                whileHover={{ scale: 1.05 }}
              >
                <StatusIcon className="w-6 h-6" />
              </motion.div>
              <div>
                <h4 className="text-lg font-semibold text-white">
                  {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                </h4>
                <p className="text-sm text-gray-400">{currentPoints.toLocaleString()} points</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <ArrowRight className="w-5 h-5 text-gray-500" />
            </motion.div>

            {/* Next Tier */}
            {nextStatus ? (
              <motion.div 
                className="flex items-center gap-3 opacity-60"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 0.6 }}
                transition={{ delay: 0.3 }}
              >
                <motion.div 
                  className={`flex items-center justify-center w-12 h-12 rounded-lg ${getStatusBgColor(nextStatus)} ${getStatusTextColor(nextStatus)}`}
                  whileHover={{ scale: 1.05, opacity: 1 }}
                >
                  <NextStatusIcon className="w-6 h-6" />
                </motion.div>
                <div>
                  <h4 className="text-lg font-semibold text-white">
                    {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                  </h4>
                  <p className={`text-sm ${getStatusTextColor(nextStatus)}`}>
                    {nextThreshold != null ? nextThreshold.toLocaleString() : "—"} points
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                className="flex items-center gap-3"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-yellow-900/30 text-yellow-400">
                  <Crown className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-yellow-400">Max Level!</h4>
                  <p className="text-sm text-yellow-300/80">All benefits unlocked</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Progress section */}
          {nextStatus && pointsToNext != null && (
            <motion.div 
              className="space-y-3"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-medium">
                  {pointsToNext.toLocaleString()} points to go
                </span>
                <motion.span 
                  className={`font-semibold ${getStatusTextColor(nextStatus)}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
                >
                  {Math.round(progressPercentage)}%
                </motion.span>
              </div>

              <div
                className="w-full h-4 bg-gray-700/50 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Status progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(animatedProgress)}
                aria-valuetext={`${Math.round(animatedProgress)}%`}
              >
                <motion.div
                  className={`h-full bg-gradient-to-r ${getStatusGradientClass(nextStatus)} rounded-full relative`}
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
          )}

          {/* Campaign Progress Section */}
          {campaignData && (
            <motion.div 
              className="mt-6 pt-6 border-t border-gray-700/50 space-y-3"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-gray-300 font-medium">
                    {campaignData.campaign_title}
                  </span>
                </div>
                <motion.span 
                  className="font-semibold text-purple-400"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 1.0, type: "spring", stiffness: 200 }}
                >
                  {Math.round(campaignData.campaign_progress.funding_percentage)}%
                </motion.span>
              </div>

              <div
                className="w-full h-3 bg-gray-700/50 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Campaign progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(campaignData.campaign_progress.funding_percentage)}
                aria-valuetext={`${Math.round(campaignData.campaign_progress.funding_percentage)}%`}
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative"
                  initial={{ width: 0 }}
                  animate={{ width: `${campaignData.campaign_progress.funding_percentage}%` }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 0.8 }}
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
                  ${(campaignData.campaign_progress.current_funding_cents / 100).toLocaleString()} raised
                </span>
                <span>
                  ${(campaignData.campaign_progress.funding_goal_cents / 100).toLocaleString()} goal
                </span>
              </div>
            </motion.div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
