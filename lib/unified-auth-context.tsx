"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useFarcaster } from '@/lib/farcaster-context';
import { usePrivy } from '@/lib/auth-context';
import { useAccount } from 'wagmi';
// useMetalHolder removed - Metal integration disabled
import { useUserStatus } from '@/hooks/use-status';
import { useUserSync } from '@/hooks/use-user-sync';

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
  
  // Status system
  userStatus: any;
  isStatusLoading: boolean;
  currentPoints: number;
  statusName: string;
}

const UnifiedAuthContext = createContext<UnifiedAuthContextType | null>(null);

export function UnifiedAuthProvider({ children }: { children: React.ReactNode }) {
  const { isInWalletApp, isInFarcaster, isInCoinbaseWallet, platform, user: farcasterUser, isSDKLoaded, frameContext } = useFarcaster();
  const { authenticated: privyAuthenticated, user: privyUser, ready: privyReady, logout: privyLogout } = usePrivy();
  
  // Use Wagmi useAccount hook for web context
  const wagmiAccount = useAccount();

  // Metal holder removed - no longer used for fallback addresses

  // Admin status state
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  
  // User sync state
  const [hasTriedSync, setHasTriedSync] = useState(false);
  const userSyncMutation = useUserSync();

  // Determine authentication state based on context
  // In Wallet App context (Farcaster/Coinbase), we check for user
  // In web context, we require Privy authentication
  const isAuthenticated = isInWalletApp ? !!farcasterUser : privyAuthenticated;
  const user = isInWalletApp ? farcasterUser : privyUser;
  const isLoading = isInWalletApp ? !isSDKLoaded : !privyReady;

  // Get status - use Privy user ID when available
  const privyUserId = privyUser?.id || null;
  const { 
    data: userStatus, 
    isLoading: isStatusLoading 
  } = useUserStatus(privyUserId);
  
  const currentPoints = userStatus?.currentPoints || 0;
  const statusName = userStatus?.statusName || 'Cadet';

  // Sync user to Supabase when authenticated via Privy (not needed for Farcaster users)
  useEffect(() => {
    if (!privyAuthenticated || !privyUser || hasTriedSync || isInWalletApp) {
      return;
    }

    console.log('[UnifiedAuth] Syncing Privy user to Supabase:', privyUser.id);
    setHasTriedSync(true);

    // Extract user data from Privy
    const walletAddr = (() => {
      if (typeof privyUser.wallet === 'string') return privyUser.wallet;
      if (typeof privyUser.wallet === 'object' && privyUser.wallet?.address) return privyUser.wallet.address;
      return null;
    })();

    userSyncMutation.mutate({
      email: privyUser.email?.address || null,
      name: privyUser.google?.name || privyUser.twitter?.name || null,
      walletAddress: walletAddr,
    });
  }, [privyAuthenticated, privyUser, hasTriedSync, isInWalletApp, userSyncMutation]);

  // Reset sync state when user changes
  useEffect(() => {
    setHasTriedSync(false);
  }, [privyUser?.id]);

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
    
    // Get the auth token for the API call
    const getAuthHeaders = async () => {
      if (isInWalletApp) {
        // Wallet app: use Farcaster authentication
        const farcasterUserId = farcasterUser?.fid?.toString();
        if (!farcasterUserId) {
          throw new Error("Farcaster user not found in wallet app");
        }
        return {
          'Content-Type': 'application/json',
          'Authorization': `Farcaster farcaster:${farcasterUserId}`,
        };
      } else {
        // Web app: use Privy authentication
        const { getAccessToken } = await import('@privy-io/react-auth');
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("User not logged in");
        }
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        };
      }
    };

    getAuthHeaders().then(headers => {
      return fetch('/api/auth/admin-status', {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });
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

  // Extract wallet address - use connected wallet only (Metal holder fallback removed)
  const walletAddress = (() => {
    if (isInWalletApp) {
      // In Wallet App: return the connected wallet address
      console.log("[UnifiedAuth] Wallet app debug:", {
        wagmiAddress: wagmiAccount?.address,
        wagmiConnected: wagmiAccount?.isConnected,
        isConnecting: wagmiAccount?.isConnecting,
        isSDKLoaded
      });
      
      return wagmiAccount?.address;
    } else {
      // Web context - use Privy wallet only
      if (typeof privyUser?.wallet === 'string') {
        return privyUser.wallet;
      }
      if (typeof privyUser?.wallet === 'object' && privyUser.wallet?.address) {
        return privyUser.wallet.address;
      }
      // No fallback - user must connect a wallet
      return undefined;
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
        isAdminLoading,
        userStatus,
        isStatusLoading,
        currentPoints,
        statusName,
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