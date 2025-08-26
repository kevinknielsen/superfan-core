"use client";

import { motion } from "framer-motion";
import Header from "@/components/header";
import ProjectCard from "@/components/project-card";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePrivy } from "@/lib/auth-context";
import { useFarcaster } from "@/lib/farcaster-context";
import { AudioPlayerProvider } from "@/lib/audio-player-context";
import { isManagerApp } from "@/lib/feature-flags";

import { useProjects } from "@/hooks/use-projects";
// import { useFundedProjects } from "@/hooks/use-financing"; // Moved to legacy

// Helper to extract wallet address from user.wallet
function getWalletAddress(user: any): string {
  if (!user?.wallet) return "";
  if (typeof user.wallet === "string") return user.wallet;
  if (typeof user.wallet === "object" && "address" in user.wallet)
    return user.wallet.address;
  return "";
}

export default function YourProjectsPage() {
  const { ready, authenticated, user } = usePrivy();
  const { isInWalletApp, openUrl } = useFarcaster();
  const walletAddress = getWalletAddress(user);

  const { data: userProjects = [], isLoading: loading } = useProjects({
    status: ["draft", "pending", "published"],
    creatorId: user?.id,
    enabled: !!user?.id,
  });

  const { data: fundedProjects = [], isLoading: loadingFunded } =
    useFundedProjects({ user });

  // Platform-aware BaseScan link handler
  const handleBaseScanLink = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (walletAddress) {
      await openUrl(`https://basescan.org/address/${walletAddress}`);
    }
  };

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
      <main className="container mx-auto px-4 py-6">
        {/* Your Projects Section - only show on manager app */}
        {isManagerApp() && (
          <section className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <motion.h1
                className="text-2xl font-bold"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Your Projects
              </motion.h1>
              <Link
                href="/launch"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Project
              </Link>
            </div>
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[200px] rounded-xl bg-[#0F141E] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <>
                {userProjects.length === 0 ? (
                  <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] p-8">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                        <Plus className="h-8 w-8 text-primary" />
                      </div>
                      <h2 className="mb-2 text-xl font-medium">No drafts yet</h2>
                      <p className="mb-6 text-muted-foreground">
                        Create your first project to get started
                      </p>
                      <Link
                        href="/launch"
                        className="inline-flex items-center rounded-lg bg-primary px-6 py-2.5 text-white hover:bg-primary/90"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New Project
                      </Link>
                    </div>
                  </div>
                ) : (
                  <AudioPlayerProvider>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {userProjects.map((project, index) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          index={index}
                        />
                      ))}
                    </div>
                  </AudioPlayerProvider>
                )}
              </>
            )}
          </section>
        )}
        
        {/* Funded Projects Section - show on both apps */}
        <section className="mb-12">
          <div className="mb-6 flex items-center justify-between">
            <motion.h1
              className="text-2xl font-bold"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Funded Projects
            </motion.h1>
          </div>
          {/* Info message about delay and link to BaseScan */}
          <div className="mb-4 text-sm text-muted-foreground">
            Funded projects may take up to 10 minutes to appear.{" "}
            {walletAddress && (
              <>
                You can confirm your transactions on{" "}
                <button
                  onClick={handleBaseScanLink}
                  className="underline text-primary hover:text-primary/80"
                >
                  BaseScan
                </button>
                .
              </>
            )}
          </div>
          {loadingFunded ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-[200px] rounded-xl bg-[#0F141E] animate-pulse"
                />
              ))}
            </div>
          ) : fundedProjects.length === 0 ? (
            <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] p-8">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <h2 className="mb-2 text-xl font-medium">
                  No funded projects yet
                </h2>
                <p className="mb-6 text-muted-foreground">
                  Fund a project to see it here
                </p>
              </div>
            </div>
          ) : (
            <AudioPlayerProvider>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fundedProjects.map((project: any, index: number) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={index}
                  />
                ))}
              </div>
            </AudioPlayerProvider>
          )}
        </section>
      </main>
    </motion.div>
  );
}
