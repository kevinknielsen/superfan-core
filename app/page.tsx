"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Dashboard from "./dashboard/page";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, isInWalletApp } = useUnifiedAuth();

  useEffect(() => {
    // Only redirect to login if NOT in Wallet App context and not authenticated
    if (!isLoading && !isAuthenticated && !isInWalletApp) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router, isInWalletApp]);

  // Show loading state while authentication is loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0E0E14] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Show dashboard if authenticated OR in Wallet App context (even without auth)
  if (isAuthenticated || isInWalletApp) {
    return <Dashboard />;
  }

  // Fallback: shouldn't reach here, but just in case
  return (
    <div className="min-h-screen bg-[#0E0E14] flex items-center justify-center">
      <div className="text-white">Redirecting...</div>
    </div>
  );
}
