"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";
// useMetalHolder removed - legacy Metal integration disabled
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { isManagerApp } from "@/lib/feature-flags";
import { useProjects } from "@/hooks/use-projects";
// useUserPresales removed - part of legacy funding system
import { useFarcaster } from "@/lib/farcaster-context";
import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from '@privy-io/react-auth';
import { Globe, TrendingUp, DollarSign, ArrowUpRight } from 'lucide-react';

interface GlobalPointsData {
  global_balance: {
    total_points: number;
    total_earned_points: number;
    total_purchased_points: number;
    total_spent_points: number;
    total_usd_value: number;
    active_clubs_count: number;
  };
  club_breakdown: Array<{
    club_id: string;
    club_name: string;
    balance_pts: number;
  }>;
}

export default function WalletSettings() {
  const { toast } = useToast();
  const { login, authenticated } = usePrivy();
  const { openUrl } = useFarcaster();

  // Use unified auth to get user and wallet address for both contexts
  const { user: unifiedUser, walletAddress: unifiedWalletAddress, isInWalletApp } = useUnifiedAuth();
  const { user: privyUser } = usePrivy();
  
  // Use unified user, fallback to Privy user for web context
  const user = unifiedUser || privyUser;
  // Metal holder removed - legacy integration disabled

  // For Wallet App: use unified wallet address (from Farcaster/Coinbase)
  // For Web: use unified wallet address (Metal integration disabled)
  const walletAddress = unifiedWalletAddress;
  
  // Get global points balance
  const {
    data: globalPointsData,
    isLoading: isLoadingPoints,
    error: pointsError
  } = useQuery<GlobalPointsData>({
    queryKey: ['global-points-balance', user?.id || 'anonymous'], // Scope cache by user ID
    queryFn: async (context): Promise<GlobalPointsData> => {
      // Get auth headers (supports both Privy and Farcaster)
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch('/api/points/global-balance', {
        headers: {
          ...authHeaders
        },
        signal: context.signal, // Support query cancellation
      });
      
      if (!response.ok) {
        if (response.status === 401 && !isInWalletApp) {
          throw new Error('Authentication required');
        }
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed to fetch global balance (${response.status})${errorText ? `: ${errorText}` : ''}`);
      }
      
      return response.json() as Promise<GlobalPointsData>;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
    enabled: !!user && (authenticated || isInWalletApp),
  });

  // USDC balance intentionally disabled; remove related hook to avoid dead code.
  // Re-introduce with UI in a follow-up when needed.


  // Debug global points data
  if (process.env.NODE_ENV !== 'production') console.log("[WalletSettings] Global points debug:", {
    isLoadingPoints,
    pointsError: pointsError?.message,
    globalPointsData: globalPointsData ? {
      total_points: globalPointsData.global_balance.total_points,
      active_clubs_count: globalPointsData.global_balance.active_clubs_count,
      club_breakdown_count: globalPointsData.club_breakdown.length,
      clubs: globalPointsData.club_breakdown.map(c => ({
        name: c.club_name,
        balance: c.balance_pts
      }))
    } : 'No data'
  });

  // Removed presales - part of legacy funding system

  const { fundWallet } = useFundWallet();

  const handleFund = () => {
    if (isInWalletApp) {
      toast({
        title: "Funding unavailable",
        description: "Funding is not available in wallet app. Please use the web app.",
        variant: "destructive"
      });
      return;
    }
    
    if (!walletAddress) return;
    fundWallet(walletAddress);
  };

  const handleWithdraw = () => {
    toast({
      title: "Withdraw funds",
      description: "Redirecting to withdrawal page...",
    });
  };

  const handleWithdrawFromSplits = () => {
    toast({
      title: "Processing withdrawal",
      description: "Initiating withdrawal from revenue splits...",
    });
  };

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Wallet Settings</h2>

        <div className="space-y-6">
          {/* Global Points Balance Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="text-base font-medium">Global Points Balance</h3>
              </div>
            </div>

            {isLoadingPoints ? (
              <div className="mb-4">
                <div className="text-3xl font-bold text-muted-foreground">Loading...</div>
              </div>
            ) : pointsError || !globalPointsData ? (
              <div className="mb-4">
                <div className="text-3xl font-bold text-muted-foreground">Unable to load</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {pointsError instanceof Error ? pointsError.message : 'Failed to load points balance'}
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="text-3xl font-bold">
                    {(globalPointsData?.global_balance?.total_points ?? 0).toLocaleString()} Points
                  </div>
                  <div className="text-lg text-primary font-medium">
                    ${(globalPointsData?.global_balance?.total_usd_value ?? 0).toFixed(2)} USD Value
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Across {(globalPointsData?.global_balance?.active_clubs_count ?? 0)} active club{(globalPointsData?.global_balance?.active_clubs_count ?? 0) !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Points Breakdown */}
                <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">Earned</span>
                    </div>
                    <div className="text-sm font-bold text-green-600">
                      {(globalPointsData?.global_balance?.total_earned_points ?? 0).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <DollarSign className="h-3 w-3 text-blue-500" />
                      <span className="text-xs font-medium">Purchased</span>
                    </div>
                    <div className="text-sm font-bold text-blue-600">
                      {(globalPointsData?.global_balance?.total_purchased_points ?? 0).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <ArrowUpRight className="h-3 w-3 text-orange-500" />
                      <span className="text-xs font-medium">Spent</span>
                    </div>
                    <div className="text-sm font-bold text-orange-600">
                      {(globalPointsData?.global_balance?.total_spent_points ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Club Breakdown */}
                {(globalPointsData?.club_breakdown?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">Points by Club</h4>
                    <div className="space-y-2">
                      {(globalPointsData?.club_breakdown || []).slice(0, 3).map((club, index) => (
                        <div key={club?.club_id || `club-${index}`} className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">{club?.club_name || 'Unknown Club'}</span>
                          <span className="font-medium">{(club?.balance_pts ?? 0).toLocaleString()}</span>
                        </div>
                      ))}
                      {(globalPointsData?.club_breakdown?.length ?? 0) > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{(globalPointsData?.club_breakdown?.length ?? 0) - 3} more clubs
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => toast({ title: "Coming Soon", description: "Buy points feature coming soon!" })}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
              >
                Buy Points
              </button>
              <button
                onClick={() => toast({ title: "Coming Soon", description: "Point transfer feature coming soon!" })}
                className="bg-background border border-border text-foreground px-4 py-2 rounded-md hover:bg-accent/10 transition-colors"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Legacy funding projects section removed for Club platform */}

      {/* Claims Section - only show on manager app */}
      {isManagerApp() && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="mb-2 text-lg font-medium">Claims</h3>
          <p className="text-muted-foreground mb-8">
            Claim your funds from revenue splits
          </p>

          <div className="flex flex-col items-center justify-center py-8">
            <div className="bg-background/50 h-16 w-16 rounded-full flex items-center justify-center mb-4">
              <Link2 className="h-8 w-8 text-muted-foreground" />
            </div>

            <h4 className="text-lg font-medium mb-2">Claim your funds</h4>
            <p className="text-center text-muted-foreground mb-6 max-w-md">
              If you have claimable USDC from music projects, you can withdraw
              it to your wallet here.
            </p>

            <button
              onClick={handleWithdrawFromSplits}
              className="bg-black text-white px-6 py-3 rounded-md hover:bg-gray-900 w-full max-w-md"
            >
              Withdraw from Splits
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
