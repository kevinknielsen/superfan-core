"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Header from "@/components/header";
import ProfileSettings from "@/components/profile-settings";
import WalletSettings from "@/components/wallet-settings";
import { Settings, User, Wallet, Crown } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, isInWalletApp } = useUnifiedAuth();
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isInWalletApp) {
      router.push("/login?redirect=/account");
    }
  }, [isLoading, isAuthenticated, router, isInWalletApp]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated && !isInWalletApp) {
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
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-white">Account Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your profile, wallet, and club membership preferences.
          </p>
        </motion.div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-border">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab("profile")}
              className={`pb-3 px-1 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "profile"
                  ? "border-primary text-white"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <User className="h-4 w-4" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab("wallet")}
              className={`pb-3 px-1 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "wallet"
                  ? "border-primary text-white"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <Wallet className="h-4 w-4" />
              Wallet
            </button>
            <button
              onClick={() => setActiveTab("membership")}
              className={`pb-3 px-1 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "membership"
                  ? "border-primary text-white"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <Crown className="h-4 w-4" />
              Membership
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "profile" && <ProfileSettings />}
          {activeTab === "wallet" && <WalletSettings />}
          {activeTab === "membership" && (
            <div className="rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Club Membership Preferences</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50">
                  <div>
                    <h4 className="font-medium">Email Notifications</h4>
                    <p className="text-sm text-muted-foreground">
                      Get notified about new unlocks and club updates
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50">
                  <div>
                    <h4 className="font-medium">Auto-Join New Clubs</h4>
                    <p className="text-sm text-muted-foreground">
                      Automatically join clubs from artists you follow
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50">
                  <div>
                    <h4 className="font-medium">Location Tracking</h4>
                    <p className="text-sm text-muted-foreground">
                      Enable location-based tap-ins at events and venues
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <h4 className="font-medium text-primary mb-2">Privacy & Data</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your club membership data is private and only shared with club owners when you join their clubs.
                  </p>
                  <button className="text-primary text-sm hover:underline">
                    Learn more about data privacy →
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </motion.div>
  );
}
