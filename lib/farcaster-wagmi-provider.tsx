"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createConfig, http, WagmiProvider, useConnect, useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { frameConnector } from './farcaster-wallet-connector';
import { useFarcaster } from './farcaster-context';

// Create and cache Wagmi configs at module level to avoid recreation
let farcasterWagmiConfig: ReturnType<typeof createConfig> | null = null;
let webWagmiConfig: ReturnType<typeof createConfig> | null = null;

const getFarcasterWagmiConfig = () => {
  if (!farcasterWagmiConfig) {
    farcasterWagmiConfig = createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
      connectors: [frameConnector()],
    });
  }
  return farcasterWagmiConfig;
};

const getWebWagmiConfig = () => {
  if (!webWagmiConfig) {
    webWagmiConfig = createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
      connectors: [], // No connectors for web context
    });
  }
  return webWagmiConfig;
};

// Create a separate query client for Wagmi to avoid conflicts
const wagmiQueryClient = new QueryClient();

interface FarcasterWagmiProviderProps {
  children: React.ReactNode;
}

// Auto-connect component that runs inside WagmiProvider
function AutoConnectWallet() {
  const farcasterContext = useFarcaster();
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  
  // Defensive null checks
  const isInWalletApp = farcasterContext?.isInWalletApp ?? false;
  const isSDKLoaded = farcasterContext?.isSDKLoaded ?? false;
  
  useEffect(() => {
    // Add timeout to ensure we're not in a render cycle
    const timer = setTimeout(() => {
      // Only auto-connect if we're in a wallet app, SDK is loaded, and not already connected
      if (isInWalletApp && isSDKLoaded && !isConnected && connectors.length > 0) {
        const frameConnector = connectors.find(c => c.id === 'farcaster');
        if (frameConnector) {
          console.log('🔗 [AutoConnect] Connecting Farcaster wallet...');
          connect({ connector: frameConnector });
        }
      }
    }, 0);
    
    return () => clearTimeout(timer);
  }, [isInWalletApp, isSDKLoaded, isConnected, connectors, connect]);
  
  return null;
}

export function FarcasterWagmiProvider({ children }: FarcasterWagmiProviderProps) {
  const farcasterContext = useFarcaster();
  
  // Defensive null checks and stable values
  const isInWalletApp = farcasterContext?.isInWalletApp ?? false;
  const isSDKLoaded = farcasterContext?.isSDKLoaded ?? false;
  
  // Add a mounting state to prevent early renders and hydration mismatches
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    // Use a microtask to ensure we're not in the middle of a render cycle
    Promise.resolve().then(() => {
      setIsMounted(true);
    });
  }, []);
  
  // Memoize the config to prevent unnecessary re-renders
  const config = useMemo(() => {
    const shouldUseFarcaster = isInWalletApp && isSDKLoaded;
    return shouldUseFarcaster 
      ? getFarcasterWagmiConfig() 
      : getWebWagmiConfig();
  }, [isInWalletApp, isSDKLoaded]);

  // Log config selection (outside useMemo to avoid side effects)
  useEffect(() => {
    console.log('🔧 [FarcasterWagmiProvider] Config selection:', {
      isInWalletApp,
      isSDKLoaded,
      usingFarcasterConfig: isInWalletApp && isSDKLoaded,
      connectorsCount: config.connectors.length
    });
  }, [isInWalletApp, isSDKLoaded, config]);

  // Provide a basic Wagmi context during mounting to prevent hook errors
  if (!isMounted) {
    return (
      <WagmiProvider config={getWebWagmiConfig()}>
        <QueryClientProvider client={wagmiQueryClient}>
          <div suppressHydrationWarning>{children}</div>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={wagmiQueryClient}>
        <AutoConnectWallet />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
} 