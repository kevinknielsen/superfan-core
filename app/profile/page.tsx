"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import WalletSettings from "@/components/wallet-settings";
import { Wallet, Bell, Settings } from "lucide-react";
import { Suspense } from "react";
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Dynamic import for scanner-wallet toggle
const ScannerWalletToggle = dynamic(() => import('@/components/scanner-wallet-toggle'), {
  ssr: false,
  loading: () => null
});

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, isInWalletApp } = useUnifiedAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Default to wallet tab as requested
  const [activeTab, setActiveTab] = useState("wallet");
  const [showBillfoldWallet, setShowBillfoldWallet] = useState(false);

  // Fetch current notification preference
  const { data: notificationPrefs, isLoading: loadingPrefs } = useQuery<{ notifications_opt_in: boolean }>({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      // Get authentication headers for unified auth
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch('/api/users/notifications-opt-in', {
        headers: authHeaders,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch notification preferences');
      }
      return response.json() as Promise<{ notifications_opt_in: boolean }>;
    },
    enabled: isAuthenticated || isInWalletApp,
  });

  // Update notification preference mutation
  const updateNotificationPref = useMutation({
    mutationFn: async (notifications_opt_in: boolean) => {
      // Get authentication headers for unified auth
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch('/api/users/notifications-opt-in', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ notifications_opt_in }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update notification preference');
      }
      
      return response.json();
    },
    onMutate: async (newPreference) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['notification-preferences'] });
      
      // Snapshot the previous value
      const previousPrefs = queryClient.getQueryData(['notification-preferences']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['notification-preferences'], {
        notifications_opt_in: newPreference
      });
      
      // Return a context object with the snapshotted value
      return { previousPrefs };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: "Notification preference updated",
        description: "Your campaign notification setting has been saved.",
      });
    },
    onError: (err, newPreference, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPrefs) {
        queryClient.setQueryData(['notification-preferences'], context.previousPrefs);
      }
      toast({
        title: "Failed to update preference",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isInWalletApp) {
      // Redirect to login for profile access - users typically come here via header modal
      router.push("/login?redirect=/profile");
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
            <h1 className="text-2xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your wallet and preferences.
          </p>
        </motion.div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-border">
          <div className="flex space-x-6">
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
              onClick={() => setActiveTab("notifications")}
              className={`pb-3 px-1 font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "notifications"
                  ? "border-primary text-white"
                  : "border-transparent text-muted-foreground hover:text-white"
              }`}
            >
              <Bell className="h-4 w-4" />
              Notifications
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
          {activeTab === "wallet" && (
            <div className="space-y-6">
              <WalletSettings />
            </div>
          )}
          {activeTab === "notifications" && (
            <div className="rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Notification Preferences</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50">
                  <div>
                    <h4 className="font-medium">Campaign Notifications</h4>
                    <p className="text-sm text-muted-foreground">
                      Get notified about new campaigns and exclusive perks
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={Boolean(notificationPrefs?.notifications_opt_in)}
                      disabled={loadingPrefs || updateNotificationPref.isPending}
                      onChange={(e) => updateNotificationPref.mutate(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50"></div>
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

      {/* Billfold Wallet Modal */}
      <ScannerWalletToggle
        isOpen={showBillfoldWallet}
        onClose={() => setShowBillfoldWallet(false)}
        defaultMode="wallet"
      />
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
