"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, QrCode, User, Sparkles } from "lucide-react";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useAuthAction } from "@/lib/universal-auth-context";
import { usePrivy } from "@privy-io/react-auth";
import { useFeatureFlag } from "@/config/featureFlags";
import { useState, useEffect, useCallback } from "react";
import dynamic from 'next/dynamic';
import Logo from "./logo";
import ProfileDropdown from "./ui/profile-dropdown";
import { getDisplayName, getDisplayEmail, getDisplayPhone } from "@/lib/user-display";

// Dynamic import for scanner-wallet toggle to prevent SSR issues
const ScannerWalletToggle = dynamic(() => import('./scanner-wallet-toggle'), {
  ssr: false,
  loading: () => null
});

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const router = useRouter();
  const { logout, user, isAuthenticated, isInWalletApp, isAdmin } = useUnifiedAuth();
  const { requireAuth } = useAuthAction();
  const { login: privyLogin } = usePrivy();
  const enableMembership = useFeatureFlag('enableMembership');
  const [showScannerWallet, setShowScannerWallet] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      // Stay on dashboard in unauthenticated state instead of redirecting to login
      if (!isInWalletApp) {
        router.replace("/dashboard");
      }
    }
  }, [logout, isInWalletApp, router]);

  const handleCheckInClick = useCallback(() => {
    requireAuth('checkin', () => {
      setShowScannerWallet(true);
    });
  }, [requireAuth]);

  const handleProfileClick = useCallback(() => {
    router.push("/profile");
  }, [router]);

  const handleAdminClick = useCallback(() => {
    router.push("/admin");
  }, [router]);

  const handleLoginClick = () => {
    // In wallet app context, still use requireAuth for proper handling
    if (isInWalletApp) {
      requireAuth('general');
    } else {
      // In web context, directly open Privy modal
      try {
        privyLogin();
      } catch (error) {
        console.error('Login failed:', error);
        // Optionally show a user-friendly error message
      }
    }
  };

  return (
    <>
      <motion.header
        className="sticky top-0 z-50 border-b border-[#1E1E32]/20 bg-background/80 backdrop-blur-sm"
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {showBackButton && (
              <button
                type="button"
                onClick={() =>
                  (history.length > 1 ? router.back() : router.push("/dashboard"))
                }
                className="mr-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
              </button>
            )}
            <Link href="/">
              <Logo />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {/* Authenticated User Navigation */}
                {/* For Artists button */}
                {!showBackButton && (
                  <Link
                    href="https://artists.superfan.one"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white text-sm font-medium transition-all duration-200"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">For Artists</span>
                  </Link>
                )}

                {/* Profile Dropdown - includes admin link and logout */}
                <ProfileDropdown
                  user={{
                    name: getDisplayName(user),
                    email: getDisplayEmail(user),
                    phone: getDisplayPhone(user),
                  }}
                  onProfileClick={handleProfileClick}
                  onAdminClick={handleAdminClick}
                  onLogout={handleLogout}
                  isAdmin={isAdmin}
                />
              </>
            ) : (
              <>
                {/* Unauthenticated User Navigation */}
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-all duration-200"
                >
                  <User className="h-4 w-4" />
                  <span>Log In</span>
                </button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* Scanner/Wallet Modal - only render on client */}
      {isClient && (
        <ScannerWalletToggle
          isOpen={showScannerWallet}
          onClose={() => setShowScannerWallet(false)}
          defaultMode="scanner"
        />
      )}
    </>
  );
}
