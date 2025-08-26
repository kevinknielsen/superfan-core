"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Wallet, AlertCircle } from "lucide-react";
import { useFarcaster } from "@/lib/farcaster-context";
import { usePrivy } from "@/lib/auth-context";
import frameSdk from "@farcaster/frame-sdk";
import { useLoginToFrame } from "@privy-io/react-auth/farcaster";

interface FarcasterAuthContextType {
  showAuthPrompt: (action: "fund" | "profile", callback?: () => void) => void;
  hideAuthPrompt: () => void;
  isAuthPromptOpen: boolean;
  authAction: "fund" | "profile" | null;
}

const FarcasterAuthContext = createContext<FarcasterAuthContextType | null>(
  null
);

export function FarcasterAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated } = usePrivy();
  const { initLoginToFrame, loginToFrame } = useLoginToFrame();
  const { isInWalletApp } = useFarcaster();
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const [authAction, setAuthAction] = useState<"fund" | "profile" | null>(null);
  const [authCallback, setAuthCallback] = useState<(() => void) | undefined>(undefined);

  // Login to Wallet App with Privy automatically
  useEffect(() => {
    if (isInWalletApp && ready && !authenticated) {
      const login = async () => {
        try {
          // Initialize a new login attempt to get a nonce for the Farcaster wallet to sign
          const { nonce } = await initLoginToFrame();
          // Request a signature from Farcaster
          const result = await frameSdk.actions.signIn({ nonce: nonce });
          // Send the received signature from Farcaster to Privy for authentication
          await loginToFrame({
            message: result.message,
            signature: result.signature,
          });
        } catch (error) {
          console.error("Failed to authenticate with Farcaster:", error);
          // Check if it's an origin error and provide helpful feedback
          if (error instanceof Error && (error.message.includes('Origin not allowed') || error.message.includes('403'))) {
            console.error('⚠️  Privy Configuration Issue:');
            console.error('Current origin needs to be added to Privy dashboard allowed origins:');
            console.error(`Add this URL: ${window.location.origin}`);
            console.error('Go to: https://dashboard.privy.io → Your App → Settings → Allowed Origins');
          }
        }
      };
      login();
    }
  }, [isInWalletApp, ready, authenticated, initLoginToFrame, loginToFrame]);

  const showAuthPrompt = (action: "fund" | "profile", callback?: () => void) => {
    setAuthAction(action);
    setAuthCallback(() => callback);
    setIsAuthPromptOpen(true);
  };

  const hideAuthPrompt = () => {
    setIsAuthPromptOpen(false);
    setAuthAction(null);
    // Execute callback if it exists, then clear it
    if (authCallback) {
      authCallback();
    }
    setAuthCallback(undefined);
  };

  return (
    <FarcasterAuthContext.Provider
      value={{
        showAuthPrompt,
        hideAuthPrompt,
        isAuthPromptOpen,
        authAction,
      }}
    >
      {children}
      <FarcasterAuthModal />
    </FarcasterAuthContext.Provider>
  );
}

export function useFarcasterAuth() {
  const context = useContext(FarcasterAuthContext);
  if (!context) {
    throw new Error(
      "useFarcasterAuth must be used within a FarcasterAuthProvider"
    );
  }
  return context;
}

function FarcasterAuthModal() {
  const { isAuthPromptOpen, hideAuthPrompt, authAction } = useFarcasterAuth();
  const { isInWalletApp, user } = useFarcaster();
  const { login, authenticated } = usePrivy();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isAuthPromptOpen) {
        hideAuthPrompt();
      }
    };

    if (isAuthPromptOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Store the previously focused element
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the modal
      modalRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus when modal closes
      if (!isAuthPromptOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isAuthPromptOpen, hideAuthPrompt]);

  // Focus management within modal
  useEffect(() => {
    if (isAuthPromptOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      const trapFocus = (event: KeyboardEvent) => {
        if (event.key === "Tab") {
          if (event.shiftKey) {
            if (document.activeElement === firstElement) {
              event.preventDefault();
              lastElement?.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              event.preventDefault();
              firstElement?.focus();
            }
          }
        }
      };

      modalRef.current.addEventListener("keydown", trapFocus);
      return () => modalRef.current?.removeEventListener("keydown", trapFocus);
    }
  }, [isAuthPromptOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isAuthPromptOpen) {
      setError(null);
      setIsLoading(false);
    }
  }, [isAuthPromptOpen]);

  const handleConnectWallet = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isInWalletApp) {
        // In Wallet App context - we already have the Farcaster user
        if (!user) {
          setError(
            "Please make sure you are logged into Farcaster and try again. You need a Farcaster account to use Superfan in Wallet App mode."
          );
          setIsLoading(false);
          return;
        }

        // In Wallet App, the "Connect Wallet" action is more of a confirmation/proceed action
        // The actual wallet connection will happen during the funding flow
        hideAuthPrompt();
        return;
      }

      // Only use Privy for web context
      if (!authenticated) {
        await login();
      }

      hideAuthPrompt();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      setError("Failed to connect wallet. Please try again.");
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      hideAuthPrompt();
    }
  };

  const getTitle = () => {
    if (isInWalletApp) {
      switch (authAction) {
        case "fund":
          return "Ready to Fund";
        case "profile":
          return "Access Profile";
        default:
          return "Farcaster Connected";
      }
    }

    switch (authAction) {
      case "fund":
        return "Connect Wallet to Fund";
      case "profile":
        return "Connect Wallet to Access Profile";
      default:
        return "Connect Wallet";
    }
  };

  const getDescription = () => {
    if (isInWalletApp) {
      switch (authAction) {
        case "fund":
          return "Your Farcaster account is connected and ready to fund projects. Continue to proceed with funding.";
        case "profile":
          return "Your Farcaster account is connected. Continue to access your profile and settings.";
        default:
          return "Your Farcaster account is connected and ready to use Superfan features.";
      }
    } else {
      switch (authAction) {
        case "fund":
          return "To fund projects in Superfan, you need to connect a wallet. This will create a secure wallet linked to your Farcaster account.";
        case "profile":
          return "To access your profile and wallet settings, you need to connect a wallet. This will create a secure wallet linked to your Farcaster account.";
        default:
          return "Connect a wallet to continue. This will create a secure wallet linked to your Farcaster account.";
      }
    }
  };

  const getButtonText = () => {
    if (isInWalletApp) {
      switch (authAction) {
        case "fund":
          return "Continue to Fund";
        case "profile":
          return "Access Profile";
        default:
          return "Continue";
      }
    }
    return isLoading ? "Connecting..." : "Connect Wallet";
  };

  return (
    <AnimatePresence>
      {isAuthPromptOpen && (
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
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                  {error ? (
                    <AlertCircle className="h-8 w-8 text-red-400" />
                  ) : authAction === "fund" ? (
                    <Wallet className="h-8 w-8 text-primary" />
                  ) : (
                    <User className="h-8 w-8 text-primary" />
                  )}
                </div>
              </div>

              {/* Title */}
              <h2
                id="auth-modal-title"
                className="text-xl font-bold text-white text-center mb-2"
              >
                {error ? "Connection Error" : getTitle()}
              </h2>

              {/* Description or Error Message */}
              <div
                id="auth-modal-description"
                className="text-gray-300 text-center mb-6 leading-relaxed"
              >
                {error ? (
                  <div className="text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                    <p className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {error}
                    </p>
                  </div>
                ) : (
                  <p>{getDescription()}</p>
                )}
              </div>

              {/* Farcaster User Info (if user exists and no error) */}
              {!error && user && (
                <div className="bg-[#181C23] rounded-lg p-3 mb-4 border border-[#23263A]">
                  <div className="flex items-center gap-3">
                    {user.pfpUrl ? (
                      <img
                        src={user.pfpUrl}
                        alt={user.displayName || user.username}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <p className="text-white font-medium">
                        {user.displayName || user.username || "Farcaster User"}
                      </p>
                      <p className="text-gray-400 text-sm">
                        Connected via Farcaster
                      </p>
                    </div>
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
                  <button
                    onClick={handleConnectWallet}
                    disabled={isLoading}
                    className="w-full rounded-xl bg-primary py-3 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {getButtonText()}
                  </button>
                )}
              </div>

              {/* Note */}
              {!error && (
                <p className="text-xs text-gray-500 text-center mt-4">
                  {isInWalletApp
                    ? "Using your Farcaster account for secure authentication."
                    : "Your wallet will be securely linked to your Farcaster account."}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook to check if user needs authentication and show prompt
export function useFarcasterAuthAction() {
  const { showAuthPrompt } = useFarcasterAuth();
  const { isInWalletApp, user } = useFarcaster();
  const { authenticated } = usePrivy();

  const requireAuth = (action: "fund" | "profile", callback?: () => void) => {
    if (isInWalletApp) {
      if (user) {
        callback?.();
        return true;
      }
      showAuthPrompt(action, callback);
      return false;
    } else {
      // Web context - check Privy authentication
      if (!authenticated) {
        showAuthPrompt(action, callback);
        return false;
      }
      // Authenticated with Privy - proceed
      callback?.();
      return true;
    }
  };

  return { requireAuth };
}
