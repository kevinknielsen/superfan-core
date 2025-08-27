"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, LogOut, User, Star, Crown, QrCode } from "lucide-react";
import { usePrivy } from "@/lib/auth-context";
import { isManagerApp, isMainApp } from "@/lib/feature-flags";
import { useFarcaster } from "@/lib/farcaster-context";
import { useFarcasterAuthAction } from "@/lib/farcaster-auth";
import { useFeatureFlag } from "@/config/featureFlags";
import { useState, useEffect } from "react";
import Logo from "./logo";
import QRScanner from "./qr-scanner";

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const router = useRouter();
  const { logout, user } = usePrivy();
  const { isInWalletApp } = useFarcaster();
  const { requireAuth } = useFarcasterAuthAction();
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

  const handleMembershipClick = () => {
    requireAuth("profile", () => router.push("/membership"));
  };

  const handleAccountClick = () => {
    requireAuth("profile", () => router.push("/account"));
  };

  const handleQRScanClick = () => {
    requireAuth("scan", () => {
      // Check if we're in a browser environment that supports QR scanning
      if (typeof window !== 'undefined' && navigator.mediaDevices) {
        setShowQRScanner(true);
      } else {
        // Fallback for environments without camera support
        console.log('QR scanning not available in this environment');
      }
    });
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
            {/* Membership button - show when membership is enabled */}
            {!showBackButton && enableMembership && (
              <button
                onClick={handleMembershipClick}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white text-sm font-medium transition-all duration-200"
              >
                <Crown className="h-4 w-4" />
                Membership
              </button>
            )}

            {/* QR Scanner button - only show on client */}
            {!showBackButton && isClient && (
              <button 
                onClick={handleQRScanClick}
                title="Scan QR Code"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors">
                  <QrCode className="h-4 w-4" />
                </div>
              </button>
            )}

            {/* Account Settings button */}
            <button 
              onClick={handleAccountClick}
              title="Account Settings"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors">
                <Star className="h-4 w-4" />
              </div>
            </button>

            {/* Profile & Wallet button */}
            <button
              onClick={() =>
                requireAuth("profile", () => router.push("/profile"))
              }
              title="Profile & Wallet"
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
