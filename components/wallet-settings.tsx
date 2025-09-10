"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";
// useMetalHolder removed - legacy Metal integration disabled
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { isManagerApp } from "@/lib/feature-flags";
import { useProjects } from "@/hooks/use-projects";
// useUserPresales removed - part of legacy funding system
import { useFarcaster } from "@/lib/farcaster-context";
import { useBalance } from "wagmi";
import { Address } from "viem";
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
  const [showFullAddress, setShowFullAddress] = useState(false);

  // Use unified auth to get user and wallet address for both contexts
  const { user: unifiedUser, walletAddress: unifiedWalletAddress, isInWalletApp } = useUnifiedAuth();
  const { user: privyUser } = usePrivy();
  
  // Use unified user, fallback to Privy user for web context
  const user = unifiedUser || privyUser;
  // Metal holder removed - legacy integration disabled
  const holder = null;

  // For Wallet App: use unified wallet address (from Farcaster/Coinbase)
  // For Web: use unified wallet address (Metal integration disabled)
  const walletAddress = unifiedWalletAddress;
  
  // USDC contract address on Base
  const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
  
  // Get global points balance
  const {
    data: globalPointsData,
    isLoading: isLoadingPoints,
    error: pointsError
  } = useQuery<GlobalPointsData>({
    queryKey: ['global-points-balance', user?.id || 'anonymous'], // Scope cache by user ID
    queryFn: async (context): Promise<GlobalPointsData> => {
      const accessToken = await getAccessToken();
      
      // Support wallet-app flows that don't use Privy tokens
      if (!accessToken && !isInWalletApp) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch('/api/points/global-balance', {
        headers: accessToken ? {
          'Authorization': `Bearer ${accessToken}`,
        } : {}, // Let unified auth handle wallet-app authentication
        signal: context.signal, // Support query cancellation
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch global balance (${response.status}): ${errorText}`);
      }
      
      return response.json() as Promise<GlobalPointsData>;
    },
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
    enabled: !!user && (authenticated || isInWalletApp),
  });

  // Get USDC balance of the connected wallet (in wallet apps)
  const { data: connectedWalletUsdcBalance } = useBalance({
    address: walletAddress as Address,
    token: USDC_BASE_ADDRESS,
    query: { enabled: !!walletAddress && isInWalletApp }
  });

  // Show connected wallet's USDC balance (Metal integration disabled)
  const balance = connectedWalletUsdcBalance?.formatted;

  // Debug logging to verify correct balance display
  console.log("[WalletSettings] Balance debug:", {
    isInWalletApp,
    walletAddress,
    connectedWalletBalance: connectedWalletUsdcBalance?.formatted,
    finalBalance: balance,
    balanceSource: "connected wallet (Metal integration disabled)"
  });

  // Debug global points data
  console.log("[WalletSettings] Global points debug:", {
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

  const handleCopy = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast({
        title: "Address copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  // Platform-aware BaseScan link handler
  const handleBaseScanLink = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (walletAddress) {
      await openUrl(`https://basescan.org/address/${walletAddress}`);
    }
  };

  // Helper to shorten address
  const getShortAddress = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

  const { fundWallet } = useFundWallet();

  const handleFund = () => {
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
              <div className="text-xs text-muted-foreground">
                100 points = $1 USD
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
                onClick={handleFund}
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

      {/* Wallet Address Section */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-medium">Wallet Address</h3>
        <div className="flex flex-col items-center">
          <div
            className="w-full bg-background/50 rounded-md px-3 py-4 font-mono text-lg break-all text-center select-all mb-2"
            style={{ wordBreak: "break-all" }}
          >
            {walletAddress ? (
              showFullAddress ? (
                walletAddress
              ) : (
                getShortAddress(walletAddress)
              )
            ) : isInWalletApp ? (
              <span className="text-muted-foreground">
                Connecting wallet...
              </span>
            ) : (
              <span className="text-muted-foreground">
                No wallet address found
              </span>
            )}
          </div>

          {!authenticated && !isInWalletApp && (
            <button
              onClick={() => login()}
              className="mb-4 bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
            >
              Connect Wallet
            </button>
          )}
          {walletAddress && (
            <button
              className="text-primary text-sm mb-2 focus:outline-none hover:underline"
              onClick={() => setShowFullAddress((v) => !v)}
              type="button"
            >
              {showFullAddress ? "Hide full address" : "Show full address"}
            </button>
          )}
          {walletAddress && (
            <div className="flex flex-row justify-center gap-6 mt-1 mb-2">
              <button
                type="button"
                onClick={handleCopy}
                className="text-muted-foreground hover:text-white p-2 rounded-full bg-background/70"
              >
                <Copy className="h-6 w-6" />
              </button>
              <button
                onClick={handleBaseScanLink}
                className="text-muted-foreground hover:text-white p-2 rounded-full bg-background/70"
              >
                <ExternalLink className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          This is your connected wallet address on Base network. Use it to receive USDC and other tokens.
        </p>
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
