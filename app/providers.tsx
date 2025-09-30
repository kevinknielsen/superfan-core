"use client";

import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { PrivyProvider } from "@privy-io/react-auth";
import { FarcasterProvider } from "@/lib/farcaster-context";
import { FarcasterAuthProvider } from "@/lib/farcaster-auth";
import { FarcasterWagmiProvider } from "@/lib/farcaster-wagmi-provider";
import { UnifiedAuthProvider } from "@/lib/unified-auth-context";
import { UniversalAuthProvider } from "@/lib/universal-auth-context";

const queryClient = new QueryClient();

// Get current origin for Privy configuration
const getCurrentOrigin = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Server-side fallback
  return process.env.NODE_ENV === 'production' 
    ? (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one')
    : 'http://localhost:3000';
};

export function Providers({ children }: { children: React.ReactNode }) {
  // Check if Privy app ID is configured
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  
  if (!privyAppId) {
    console.error('NEXT_PUBLIC_PRIVY_APP_ID environment variable is not set');
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Configuration Error</h1>
          <p className="text-muted-foreground">
            Privy App ID is not configured. Please check your environment variables.
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* FarcasterProvider: Detects if running in Farcaster/Coinbase Wallet context */}
      <FarcasterProvider>
        {/* PrivyProvider: Used for web authentication (email/sms/google) 
            Not used for Farcaster mini app users - they authenticate via SDK */}
        <PrivyProvider
          appId={privyAppId}
          config={{
            embeddedWallets: {
              createOnLogin: "users-without-wallets",
            },
            loginMethods: ["email", "sms", "google"],
            supportedChains: [
              {
                id: 8453,
                name: "Base",
                rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
                blockExplorers: {
                  default: { name: "BaseScan", url: "https://basescan.org" },
                },
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              },
            ],
            // Log current origin for debugging
            ...(process.env.NODE_ENV === 'development' && {
              _debug: {
                currentOrigin: getCurrentOrigin(),
              }
            })
          }}
        >
          {/* FarcasterAuthProvider: Manages auth prompts
              For mini apps: uses Farcaster SDK directly
              For web: delegates to Privy */}
          <FarcasterAuthProvider>
            {/* FarcasterWagmiProvider: Provides wallet connection for both contexts */}
            <FarcasterWagmiProvider>
              {/* UnifiedAuthProvider: Provides unified auth state for the app
                  Returns isAuthenticated, user, walletAddress for both contexts */}
              <UnifiedAuthProvider>
                {/* UniversalAuthProvider: Manages auth modals and actions */}
                <UniversalAuthProvider>
                  {children}
                  <Toaster />
                </UniversalAuthProvider>
              </UnifiedAuthProvider>
            </FarcasterWagmiProvider>
          </FarcasterAuthProvider>
        </PrivyProvider>
      </FarcasterProvider>
    </QueryClientProvider>
  );
}
