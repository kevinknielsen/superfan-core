"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { usePrivy } from "@/lib/auth-context";
import { useFarcaster } from "@/lib/farcaster-context";
import Header from "@/components/header";
import ProfileSettings from "@/components/profile-settings";
import WalletSettings from "@/components/wallet-settings";
import { Suspense } from "react";

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, user } = usePrivy();
  const { isInWalletApp } = useFarcaster();
  // Always default to wallet tab since we're hiding the profile tab
  const [activeTab, setActiveTab] = useState("wallet");

  useEffect(() => {
    if (ready && !authenticated && !isInWalletApp) {
      router.push("/login?redirect=/profile");
    }
  }, [ready, authenticated, router, isInWalletApp]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!authenticated && !isInWalletApp) {
    return null;
  }

  return (
    <motion.div
      className="min-h-screen bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Header />
      <main className="container mx-auto px-4 py-8">
        <motion.h1
          className="mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Profile Settings
        </motion.h1>
        <div className="mb-8 border-b border-border">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab("wallet")}
              className="pb-2 px-1 font-medium border-b-2 border-primary text-white"
            >
              Wallet
            </button>
          </div>
        </div>
        <WalletSettings />
      </main>
    </motion.div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfilePageContent />
    </Suspense>
  );
}
