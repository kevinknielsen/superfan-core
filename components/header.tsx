"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, LogOut, User, Star, QrCode } from "lucide-react";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { isManagerApp, isMainApp } from "@/lib/feature-flags";
import { useFeatureFlag } from "@/config/featureFlags";
import { useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import Logo from "./logo";

// Dynamic import for QR scanner to prevent SSR issues
const QRScanner = dynamic(() => import('./qr-scanner'), {
  ssr: false,
  loading: () => null
});

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const router = useRouter();
  const { logout, user, isAuthenticated, isInWalletApp } = useUnifiedAuth();
  const enableMembership = useFeatureFlag('enableMembership');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      // Don't redirect to login in Wallet App context
      if (!isInWalletApp) {
        router.push("/login");
      }
    }
  };

  const handleCheckInClick = () => {
    // Check authentication first
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.push("/login?redirect=" + encodeURIComponent(currentPath));
      return;
    }

    // Check if we're in a browser environment that supports QR scanning
    if (typeof window !== 'undefined' && navigator.mediaDevices) {
      setShowQRScanner(true);
    } else {
      // Fallback for environments without camera support
      console.log('QR scanning not available in this environment');
    }
  };

  const handleProfileClick = () => {
    if (!isAuthenticated) {
      router.push("/login?redirect=" + encodeURIComponent("/profile"));
      return;
    }
    router.push("/profile");
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
                onClick={() => router.push("/")}
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
            {/* Check In button - show when membership is enabled */}
            {!showBackButton && enableMembership && (
              <button
                onClick={handleCheckInClick}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white text-sm font-medium transition-all duration-200"
              >
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">Check In</span>
              </button>
            )}

            {/* Profile & Settings button */}
            <button 
              onClick={handleProfileClick}
              title="Profile & Settings"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors">
                <User className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
              <span className="ml-2 hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </motion.header>

      {/* QR Scanner Modal - only render on client */}
      {isClient && (
        <QRScanner
          isOpen={showQRScanner}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </>
  );
}
