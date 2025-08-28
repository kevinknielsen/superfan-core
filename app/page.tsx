"use client";

import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Dashboard from "./dashboard/page";

export default function Home() {
  const { isLoading } = useUnifiedAuth();

  // Show loading state while authentication is loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0E0E14] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Always show dashboard - it will handle auth state internally
  return <Dashboard />;
}
