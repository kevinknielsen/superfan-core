"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, LogOut, User, Folders, Plus } from "lucide-react";
import { usePrivy } from "@/lib/auth-context";
import { isManagerApp, isMainApp } from "@/lib/feature-flags";
import { useFarcaster } from "@/lib/farcaster-context";
import { useFarcasterAuthAction } from "@/lib/farcaster-auth";
import { ManagerBetaWarning } from "./ManagerBetaWarning";
import { useState } from "react";
import Logo from "./logo";

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const router = useRouter();
  const { logout, user } = usePrivy();
  const { isInWalletApp } = useFarcaster();
  const { requireAuth } = useFarcasterAuthAction();
  const [showBetaWarning, setShowBetaWarning] = useState(false);

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

  const handleNewProject = () => {
    if (isMainApp()) {
      // Show beta warning modal instead of redirecting immediately
      setShowBetaWarning(true);
    } else {
      // Direct navigation for manager app
      router.push("/launch");
    }
  };

  const handleYourProjects = () => {
    if (isMainApp()) {
      // Show beta warning modal instead of redirecting immediately
      setShowBetaWarning(true);
    } else {
      // Direct navigation for manager app
      router.push("/your-projects");
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
            {/* New Project button - only show on manager app */}
            {!showBackButton && isManagerApp() && (
              <button
                onClick={handleNewProject}
                className="btn-primary hidden sm:flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            )}

            {/* Your Projects - redirect to manager if on main app */}
            <button onClick={handleYourProjects}>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F141E] text-primary hover:bg-[#161b26] transition-colors">
                <Plus className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={() =>
                requireAuth("profile", () => router.push("/profile?tab=wallet"))
              }
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

      {/* Beta Warning Modal */}
      <ManagerBetaWarning
        isOpen={showBetaWarning}
        onOpenChange={setShowBetaWarning}
      />
    </>
  );
}
