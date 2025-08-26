"use client";

import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { PrivyProvider } from "@privy-io/react-auth";
import { FarcasterProvider } from "@/lib/farcaster-context";
import { FarcasterAuthProvider } from "@/lib/farcaster-auth";
import { FarcasterWagmiProvider } from "@/lib/farcaster-wagmi-provider";
import { UnifiedAuthProvider } from "@/lib/unified-auth-context";

const queryClient = new QueryClient();

// Get current origin for Privy configuration
const getCurrentOrigin = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  // Server-side fallback
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <FarcasterProvider>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
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
          <FarcasterAuthProvider>
            <FarcasterWagmiProvider>
              <UnifiedAuthProvider>
                {children}
                <Toaster />
              </UnifiedAuthProvider>
            </FarcasterWagmiProvider>
          </FarcasterAuthProvider>
        </PrivyProvider>
      </FarcasterProvider>
    </QueryClientProvider>
  );
}
