/**
 * Custom hook to manage tap page authentication flow
 * Consolidates complex useEffect chains and timer management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUnifiedAuth } from '@/lib/unified-auth-context';
import { usePrivy } from '@privy-io/react-auth';
import { useFarcaster } from '@/lib/farcaster-context';
import { useToast } from '@/hooks/use-toast';

interface TapAuthState {
  isReady: boolean;
  needsAuth: boolean;
  canAutoLogin: boolean;
  authError: string | null;
}

interface TapAuthActions {
  triggerAuth: () => Promise<void>;
  clearAuthError: () => void;
  getAuthHeaders: () => Promise<{ Authorization: string }>;
}

interface UseTapAuthenticationProps {
  clubInfo: unknown | null;
  hasValidQRParams: boolean;
  autoLoginDelay?: number;
}

export function useTapAuthentication({
  clubInfo,
  hasValidQRParams,
  autoLoginDelay = 5000
}: UseTapAuthenticationProps): TapAuthState & TapAuthActions {
  const { user, isAuthenticated, isLoading: authLoading, isInWalletApp } = useUnifiedAuth();
  const { getAccessToken, login } = usePrivy();
  const { user: farcasterUser } = useFarcaster();
  const { toast } = useToast();
  
  const [authError, setAuthError] = useState<string | null>(null);
  const autoLoginTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authAttemptedRef = useRef(false);

  // Clear timer helper
  const clearAutoLoginTimer = useCallback(() => {
    if (autoLoginTimerRef.current) {
      clearTimeout(autoLoginTimerRef.current);
      autoLoginTimerRef.current = null;
    }
  }, []);

  // Authentication state calculations
  const isReady = !authLoading && isAuthenticated && !!user && !!clubInfo && hasValidQRParams;
  const needsAuth = !authLoading && !isAuthenticated && !!clubInfo && hasValidQRParams;
  const canAutoLogin = needsAuth && !isInWalletApp && !authAttemptedRef.current;

  // Get authentication headers based on context
  const getAuthHeaders = useCallback(async (): Promise<{ Authorization: string }> => {
    if (isInWalletApp) {
      // Wallet app: use Farcaster authentication
      const farcasterUserId = farcasterUser?.fid?.toString();
      if (!farcasterUserId) {
        throw new Error("Farcaster user not found in wallet app");
      }
      return {
        Authorization: `Farcaster farcaster:${farcasterUserId}`,
      };
    } else {
      // Web app: use Privy authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("User not logged in");
      }
      return {
        Authorization: `Bearer ${accessToken}`,
      };
    }
  }, [isInWalletApp, farcasterUser, getAccessToken]);

  // Manual authentication trigger
  const triggerAuth = useCallback(async () => {
    try {
      clearAutoLoginTimer();
      setAuthError(null);
      authAttemptedRef.current = true;

      // Skip Privy login in wallet app context
      if (isInWalletApp) {
        console.warn("Cannot trigger Privy login in wallet app context");
        
        // Show user-visible notification
        toast({
          title: "Authentication Disabled",
          description: "Authentication is disabled in wallet app context. Please use the web version.",
          variant: "destructive",
        });
        
        // Return rejected promise for programmatic handling
        throw new Error("Authentication is disabled in wallet app context");
      }

      // If already authenticated, no need to login again
      if (isAuthenticated && user) {
        return;
      }

      await login();
    } catch (error) {
      console.error("Authentication failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed. Please try again.";
      setAuthError(errorMessage);
      
      // Show user-visible toast for all auth errors
      toast({
        title: "Authentication Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Re-throw for caller handling
      throw error;
    }
  }, [clearAutoLoginTimer, isInWalletApp, isAuthenticated, user, login, toast]);

  // Auto-login timer management
  useEffect(() => {
    clearAutoLoginTimer();
    
    if (canAutoLogin) {
      autoLoginTimerRef.current = setTimeout(() => {
        triggerAuth();
      }, autoLoginDelay);
    }

    return clearAutoLoginTimer;
  }, [canAutoLogin, autoLoginDelay, triggerAuth, clearAutoLoginTimer]);

  // Reset auth state when QR params change
  useEffect(() => {
    authAttemptedRef.current = false;
    setAuthError(null);
    clearAutoLoginTimer();
  }, [hasValidQRParams, clearAutoLoginTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return clearAutoLoginTimer;
  }, [clearAutoLoginTimer]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    isReady,
    needsAuth,
    canAutoLogin,
    authError,
    triggerAuth,
    clearAuthError,
    getAuthHeaders
  };
}
