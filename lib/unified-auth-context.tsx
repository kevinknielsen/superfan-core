"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useFarcaster } from '@/lib/farcaster-context';
import { usePrivy } from '@/lib/auth-context';
import { useAccount } from 'wagmi';
import { useMetalHolder } from '@/hooks/use-metal-holder';

interface UnifiedAuthContextType {
  isAuthenticated: boolean;
  user: any;
  isLoading: boolean;
  walletAddress?: string;
  isInWalletApp: boolean; // Works for both Farcaster and Coinbase Wallet
  isInFarcaster: boolean;
  isInCoinbaseWallet: boolean;
  platform: 'farcaster' | 'coinbase' | 'web';
  logout: () => Promise<void>;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

const UnifiedAuthContext = createContext<UnifiedAuthContextType | null>(null);

export function UnifiedAuthProvider({ children }: { children: React.ReactNode }) {
  const { isInWalletApp, isInFarcaster, isInCoinbaseWallet, platform, user: farcasterUser, isSDKLoaded, frameContext } = useFarcaster();
  const { authenticated: privyAuthenticated, user: privyUser, ready: privyReady, logout: privyLogout } = usePrivy();
  
  // Use Wagmi useAccount hook for web context
  const wagmiAccount = useAccount();

  // Get metal holder data for fallback wallet address
  const { data: metalHolder } = useMetalHolder({ 
    user: isInWalletApp ? null : privyUser 
  });

  // Admin status state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  // Determine authentication state based on context
  // In Wallet App context (Farcaster/Coinbase), we check for user
  // In web context, we require Privy authentication
  const isAuthenticated = isInWalletApp ? !!farcasterUser : privyAuthenticated;
  const user = isInWalletApp ? farcasterUser : privyUser;
  const isLoading = isInWalletApp ? !isSDKLoaded : !privyReady;

  // Fetch admin status when user is authenticated
  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setIsAdmin(false);
      setIsAdminLoading(false);
      return;
    }

    // Create abort controller for cleanup
    const abortController = new AbortController();
    let isCurrent = true; // Track if this is the latest request

    setIsAdminLoading(true);
    
    fetch('/api/auth/admin-status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // The API will use the current session authentication
      },
      signal: abortController.signal,
    })
      .then(res => {
        if (abortController.signal.aborted) return;
        return res.json();
      })
      .then((data: any) => {
        // Only update state if this is still the current request and not aborted
        if (isCurrent && !abortController.signal.aborted) {
          setIsAdmin(data.isAdmin || false);
        }
      })
      .catch(error => {
        // Only log and update state if not aborted
        if (!abortController.signal.aborted) {
          console.error('Failed to fetch admin status:', error);
          if (isCurrent) {
            setIsAdmin(false);
          }
        }
      })
      .finally(() => {
        // Only update loading state if this is still the current request
        if (isCurrent && !abortController.signal.aborted) {
          setIsAdminLoading(false);
        }
      });

    // Cleanup function
    return () => {
      isCurrent = false;
      abortController.abort();
    };
  }, [isAuthenticated, isLoading, user?.id]);

  // Extract wallet address - prioritize connected wallet for better UX
  const walletAddress = (() => {
    if (isInWalletApp) {
      // In Wallet App: ONLY return the connected wallet address
      // Never show Metal holder address in wallet apps
      console.log("[UnifiedAuth] Wallet app debug:", {
        wagmiAddress: wagmiAccount?.address,
        wagmiConnected: wagmiAccount?.isConnected,
        isConnecting: wagmiAccount?.isConnecting,
        metalHolderAddress: metalHolder?.address,
        isSDKLoaded
      });
      
      // Return the connected wallet address or undefined (no fallback to Metal holder)
      return wagmiAccount?.address;
    } else {
      // Web context - use Privy wallet, with Metal holder as fallback
      if (typeof privyUser?.wallet === 'string') {
        return privyUser.wallet;
      }
      if (typeof privyUser?.wallet === 'object' && privyUser.wallet?.address) {
        return privyUser.wallet.address;
      }
      // Fallback to Metal holder address for web context
      return metalHolder?.address;
    }
  })();

  const logout = async () => {
    if (!isInWalletApp) {
      await privyLogout();
    }
    // For Wallet App contexts, we can't really logout from the wallet apps
  };

  return (
    <UnifiedAuthContext.Provider 
      value={{ 
        isAuthenticated,
        user,
        isLoading,
        walletAddress,
        isInWalletApp,
        isInFarcaster,
        isInCoinbaseWallet,
        platform,
        logout,
        isAdmin,
        isAdminLoading
      }}
    >
      {children}
    </UnifiedAuthContext.Provider>
  );
}

export function useUnifiedAuth() {
  const context = useContext(UnifiedAuthContext);
  if (!context) {
    throw new Error('useUnifiedAuth must be used within a UnifiedAuthProvider');
  }
  return context;
} 