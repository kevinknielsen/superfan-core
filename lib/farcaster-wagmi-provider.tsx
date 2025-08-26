"use client";

import React, { useEffect } from "react";
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
  const { isInWalletApp, isSDKLoaded } = useFarcaster();
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  
  useEffect(() => {
    // Only auto-connect if we're in a wallet app, SDK is loaded, and not already connected
    if (isInWalletApp && isSDKLoaded && !isConnected && connectors.length > 0) {
      const frameConnector = connectors.find(c => c.id === 'farcaster');
      if (frameConnector) {
        console.log('🔗 [AutoConnect] Connecting Farcaster wallet...');
        connect({ connector: frameConnector });
      }
    }
  }, [isInWalletApp, isSDKLoaded, isConnected, connectors, connect]);
  
  return null;
}

export function FarcasterWagmiProvider({ children }: FarcasterWagmiProviderProps) {
  const { isInWalletApp, isSDKLoaded } = useFarcaster();
  
  // Always provide Wagmi, but with different configs based on context
  const config = isInWalletApp && isSDKLoaded 
    ? getFarcasterWagmiConfig() 
    : getWebWagmiConfig();
    
  console.log('🔧 [FarcasterWagmiProvider] Config selection:', {
    isInWalletApp,
    isSDKLoaded,
    usingFarcasterConfig: isInWalletApp && isSDKLoaded,
    connectorsCount: config.connectors.length
  });

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={wagmiQueryClient}>
        <AutoConnectWallet />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
} 