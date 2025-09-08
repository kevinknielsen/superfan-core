"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, QrCode, Crown, Shield, Users, Star } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useFarcaster } from '@/lib/farcaster-context';
import { useRouter } from 'next/navigation';

export type AuthAction = 
  | "membership" 
  | "profile" 
  | "checkin" 
  | "admin" 
  | "tap" 
  | "general";

interface UniversalAuthContextType {
  showAuthModal: (action: AuthAction, callback?: () => void) => void;
  hideAuthModal: () => void;
  resolveAuthSuccess: () => void;
  isAuthModalOpen: boolean;
  authAction: AuthAction | null;
  authCallback?: () => void;
}

const UniversalAuthContext = createContext<UniversalAuthContextType | null>(null);

export function UniversalAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authAction, setAuthAction] = useState<AuthAction | null>(null);
  const [authCallback, setAuthCallback] = useState<(() => void) | undefined>(undefined);

  const showAuthModal = (action: AuthAction, callback?: () => void) => {
    setAuthAction(action);
    setAuthCallback(() => callback);
    setIsAuthModalOpen(true);
  };

  const hideAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthAction(null);
    setAuthCallback(undefined);
  };

  // Call only after confirmed authentication
  const resolveAuthSuccess = () => {
    if (authCallback) {
      authCallback();
    }
    setAuthCallback(undefined);
    setIsAuthModalOpen(false);
    setAuthAction(null);
  };

  return (
    <UniversalAuthContext.Provider
      value={{
        showAuthModal,
        hideAuthModal,
        resolveAuthSuccess,
        isAuthModalOpen,
        authAction,
        authCallback,
      }}
    >
      {children}
      <UniversalAuthModal />
    </UniversalAuthContext.Provider>
  );
}

export function useUniversalAuthModal() {
  const context = useContext(UniversalAuthContext);
  if (!context) {
    throw new Error('useUniversalAuthModal must be used within a UniversalAuthProvider');
  }
  return context;
}

// Hook to check if user needs authentication and show modal
export function useAuthAction() {
  const { showAuthModal } = useUniversalAuthModal();
  const { isInWalletApp, user } = useFarcaster();
  
  // Always call the hook at the top level (Rules of Hooks)
  const privyAuth = usePrivy();
  
  // Safely access Privy auth state
  let authenticated = false;
  try {
    authenticated = privyAuth?.authenticated || false;
  } catch (error) {
    console.warn('Privy not available:', error);
  }

  const requireAuth = (action: AuthAction, callback?: () => void) => {
    if (isInWalletApp) {
      if (user) {
        callback?.();
        return true;
      }
      showAuthModal(action, callback);
      return false;
    } else {
      // Web context - check Privy authentication
      if (!authenticated) {
        showAuthModal(action, callback);
        return false;
      }
      // Authenticated with Privy - proceed
      callback?.();
      return true;
    }
  };

  return { requireAuth };
}

function UniversalAuthModal() {
  const { isAuthModalOpen, hideAuthModal, resolveAuthSuccess, authAction, authCallback } = useUniversalAuthModal();
  const { isInWalletApp, user } = useFarcaster();
  
  // Always call the hook at the top level (Rules of Hooks)
  const privyAuth = usePrivy();
  
  // Safely access Privy auth state
  let login = null;
  let authenticated = false;
  try {
    login = privyAuth?.login || null;
    authenticated = privyAuth?.authenticated || false;
  } catch (error) {
    console.warn('Privy not available:', error);
  }
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  // Reset states when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setIsLoading(false);
      setError(null);
    }
  }, [isAuthModalOpen]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isAuthModalOpen) {
        hideAuthModal();
      }
    };

    if (isAuthModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Store the previously focused element
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the modal
      modalRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus when modal closes
      if (!isAuthModalOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isAuthModalOpen, hideAuthModal]);

  // Auto-close on authentication and execute callback
  useEffect(() => {
    if ((authenticated || (isInWalletApp && user)) && isAuthModalOpen && authCallback) {
      resolveAuthSuccess();
    }
  }, [authenticated, user, isInWalletApp, isAuthModalOpen, authCallback, resolveAuthSuccess]);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isInWalletApp) {
        // Wallet context: consider auth resolved by the host app
        resolveAuthSuccess();
      } else {
        // Web context - use Privy login (same as login page)
        if (login) {
          login(); // This opens Privy's native modal
          // Don't close our modal immediately - wait for authentication to complete
          // The useEffect will handle closing and callback execution
          setIsLoading(false); // Reset loading state since Privy modal is now handling it
        } else {
          throw new Error('Privy login not available. Please ensure NEXT_PUBLIC_PRIVY_APP_ID is set in your environment variables.');
        }
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError('Failed to authenticate. Please try again.');
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      hideAuthModal();
    }
  };

  // No longer needed - modal handles all authentication

  // Get action-specific content
  const getActionContent = (action: AuthAction | null) => {
    switch (action) {
      case "membership":
        return {
          icon: Users,
          title: "Join the Club",
          description: "Sign in to add memberships, earn points, and unlock exclusive perks."
        };
      case "checkin":
        return {
          icon: QrCode,
          title: "Check In to Earn Points",
          description: "Sign in to scan QR codes, check in at events, and start earning points."
        };
      case "profile":
        return {
          icon: User,
          title: "Access Your Profile",
          description: "Sign in to view and manage your profile, wallet, and settings."
        };
      case "admin":
        return {
          icon: Shield,
          title: "Admin Access Required",
          description: "Sign in with an admin account to access the management dashboard."
        };
      case "tap":
        return {
          icon: Star,
          title: "Earn Your Points",
          description: "Sign in to claim your tap-in rewards and track your status progress."
        };
      default:
        return {
          icon: Crown,
          title: "Join Superfan",
          description: "Sign in to access exclusive memberships, earn points, and unlock perks."
        };
    }
  };

  const getButtonText = () => {
    if (error) return "Try Again";
    if (isLoading) return "Opening...";
    return "Log In";
  };

  const actionContent = getActionContent(authAction);
  const ActionIcon = actionContent.icon;

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          aria-describedby="auth-modal-description"
        >
          <motion.div
            ref={modalRef}
            className="relative w-full max-w-md mx-4 rounded-2xl bg-[#0E0E14] border border-[#1E1E32]/20 shadow-xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            tabIndex={-1}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 z-10 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <ActionIcon className="h-8 w-8" />
                </div>
              </div>

              {/* Content */}
              <div className="text-center mb-8">
                <h2 
                  id="auth-modal-title"
                  className="text-2xl font-bold text-white mb-4"
                >
                  {actionContent.title}
                </h2>
                <p 
                  id="auth-modal-description"
                  className="text-gray-400 leading-relaxed"
                >
                  {actionContent.description}
                </p>
              </div>

              {/* Error State */}
              {error && (
                <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                  <div className="flex items-center justify-center text-red-400">
                    <X className="h-5 w-5 mr-2" />
                    <span className="text-sm font-medium">{error}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                {error ? (
                  <button
                    onClick={() => {
                      setError(null);
                      setIsLoading(false);
                    }}
                    className="w-full rounded-xl bg-gray-600 py-3 text-center font-semibold text-white transition-all hover:bg-gray-500"
                  >
                    Try Again
                  </button>
                ) : (
                  /* Primary action - Privy Login */
                  <button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className="w-full rounded-xl bg-primary py-3 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <User className="h-5 w-5" />
                    {getButtonText()}
                  </button>
                )}
              </div>

              {/* Note */}
              {!error && (
                <p className="text-xs text-gray-500 text-center mt-4">
                  {isInWalletApp
                    ? "Using your wallet app for secure authentication."
                    : "Sign in with email, phone, or social accounts via Privy."}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
