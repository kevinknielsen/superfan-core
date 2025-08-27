"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";
import { useMetalHolder } from "@/hooks/use-metal-holder";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { isManagerApp } from "@/lib/feature-flags";
import { useProjects } from "@/hooks/use-projects";
// useUserPresales removed - part of legacy funding system
import { useFarcaster } from "@/lib/farcaster-context";
import { useBalance } from "wagmi";
import { Address } from "viem";

export default function WalletSettings() {
  const { toast } = useToast();
  const { login, authenticated } = usePrivy();
  const { openUrl } = useFarcaster();
  const [showFullAddress, setShowFullAddress] = useState(false);

  // Use unified auth to get user and wallet address for both contexts
  const { user: unifiedUser, walletAddress: unifiedWalletAddress, isInWalletApp } = useUnifiedAuth();
  const { user: privyUser } = usePrivy();
  
  // Use unified user for Metal holder, fallback to Privy user for web context
  const user = unifiedUser || privyUser;
  const { data: holder } = useMetalHolder({ user });

  // For Wallet App: use unified wallet address (from Farcaster/Coinbase)
  // For Web: use Metal holder address (from Privy embedded wallet)
  // IMPORTANT: In wallet apps, never show Metal holder address
  const walletAddress = isInWalletApp ? unifiedWalletAddress : holder?.address;
  
  // USDC contract address on Base
  const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
  
  // Get USDC balance of the connected wallet (in wallet apps)
  const { data: connectedWalletUsdcBalance } = useBalance({
    address: walletAddress as Address,
    token: USDC_BASE_ADDRESS,
    query: { enabled: !!walletAddress && isInWalletApp }
  });

  // Determine which balance to show:
  // - In wallet apps: show connected wallet's USDC balance
  // - In web: show Metal holder balance (managed wallet)
  const balance = isInWalletApp 
    ? connectedWalletUsdcBalance?.formatted 
    : holder?.usdcBalance;

  // Debug logging to verify correct balance display
  console.log("[WalletSettings] Balance debug:", {
    isInWalletApp,
    walletAddress,
    holderAddress: holder?.address,
    connectedWalletBalance: connectedWalletUsdcBalance?.formatted,
    holderBalance: holder?.usdcBalance,
    finalBalance: balance,
    balanceSource: isInWalletApp ? "connected wallet" : "metal holder"
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
    if (!holder?.address) return;
    fundWallet(holder?.address);
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
          {/* Balance Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-medium">Balance</h3>
            </div>

            <div className="mb-4">
              <h4 className="text-3xl font-bold">
                {!balance && balance !== 0 ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : (
                  `${Number(balance).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} USDC`
                )}
              </h4>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleFund}
                className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-900"
              >
                Fund
              </button>
              {/* <button
                onClick={handleWithdraw}
                className="bg-background border border-border text-white px-4 py-2 rounded-md hover:bg-accent/10"
              >
                Withdraw
              </button> */}
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
          {isInWalletApp 
            ? "This is your connected wallet address on Base network. Funding will come from this wallet." 
            : "This is your Base network wallet address. Use it to receive USDC and other tokens."
          }
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
