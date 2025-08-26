"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/header";
import ProjectListItem from "@/components/project-list-item";
import ProjectCard from "@/components/project-card";
import { Search, Plus, ArrowUpDown, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePrivy } from "@/lib/auth-context";
import { isAdmin } from "@/lib/auth-utils";
import { useFarcaster } from "@/lib/farcaster-context";
import { AudioPlayerProvider } from "@/lib/audio-player-context";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import ProjectDetailsModal from "@/components/project-details-modal";

import { useProjects } from "@/hooks/use-projects";
import { useProject } from "@/hooks/use-projects";
import { Project } from "../api/projects/route";
import { User } from "@privy-io/react-auth";
import { isManagerApp, isMainApp } from "@/lib/feature-flags";
import { ManagerBetaWarning } from "@/components/ManagerBetaWarning";

const DEAL_TYPES = {
  PRIVATE: 'private',
  PUBLIC: 'public',
  // Add other deal types as needed
} as const;

type DealType = typeof DEAL_TYPES[keyof typeof DEAL_TYPES];

function getSortDate(project: Project): string {
  return project.created_at || "";
}

function sortByDateDesc(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const dateA = getSortDate(a);
    const dateB = getSortDate(b);
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

const stable_emptyArray: Project[] = [];

function filterPublicProjects(projects: Project[]): Project[] {
  return projects.filter((p) => {
    // Always filter by status
    if (p.status !== "published") return false;
    // In main app, exclude private deal types
    if (isMainApp() && p.deal_type === DEAL_TYPES.PRIVATE) return false;
    return true;
  });
}

function useFilteredProjects(
  allProjects: Project[] | undefined,
  user: User | null,
  searchQuery: string,
  authReady: boolean
) {
  const presaleProjects = useMemo(() => {
    // If no projects loaded yet, return empty array (don't filter)
    if (!allProjects || !Array.isArray(allProjects)) return [];

    // Simplified logic: If auth is still loading, show all published projects
    // This prevents the "no projects" flicker while auth is loading
    if (!authReady) {
      const filteredProjects = filterPublicProjects(allProjects);
      return sortByDateDesc(filteredProjects);
    }

    // Auth is ready - apply proper filtering
    if (!user) {
      // No user but auth is ready - show only published projects
      const filteredProjects = filterPublicProjects(allProjects);
      return sortByDateDesc(filteredProjects);
    }

    // User is authenticated - show user's projects + published projects
    const isUserAdmin = isAdmin(user.id);
    
    const filteredProjects = allProjects.filter((project) => {
      // Check status-based access
      const hasStatusAccess = 
        project.status === "published" ||
        ((project.status === "pending" || project.status === "draft") &&
          (isUserAdmin || project.creator_id === user.id));
      
      if (!hasStatusAccess) return false;
      
      // In main app, exclude private deal types from published projects
      // But still show user's own private projects if they have access
      if (isMainApp() && project.deal_type === DEAL_TYPES.PRIVATE) {
        // Only show private deals if user is admin or the creator
        return isUserAdmin || project.creator_id === user.id;
      }
      
      return true;
    });

    return sortByDateDesc(filteredProjects);
  }, [allProjects, user?.id, authReady]);

  const exploreProjects = useMemo(() => {
    if (!allProjects || !Array.isArray(allProjects)) return [];
    return filterPublicProjects(allProjects)
      .filter(
        (p) =>
          p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.artist_name ?? "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
  }, [allProjects, searchQuery]);

  return { presaleProjects, exploreProjects };
}

export default function Dashboard() {
  const { ready, authenticated, user } = usePrivy();
  const { isInWalletApp } = useFarcaster();
  const [activeTab, setActiveTab] = useState("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const searchParams = useSearchParams();
  const modalProjectId = searchParams.get("projectId");
  const [modalOpen, setModalOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const [showBetaWarning, setShowBetaWarning] = useState(false);

  // Enhanced projects loading with better enabled condition
  const { data: allProjects = stable_emptyArray, isLoading } = useProjects({
    status: ["published", "pending"],
    enabled: true, // Always enabled to prevent delays
  });
  
  const { data: modalProject } = useProject(modalProjectId);
  const { presaleProjects, exploreProjects } = useFilteredProjects(
    allProjects,
    user,
    searchQuery,
    ready
  );

  // Auto-open modal when projectId parameter exists and project is loaded
  useEffect(() => {
    if (modalProjectId && modalProject && !modalOpen) {
      setModalOpen(true);
    }
  }, [modalProjectId, modalProject, modalOpen]);

  // Handler for new project creation
  const handleNewProject = () => {
    if (isMainApp()) {
      // Show beta warning modal instead of redirecting immediately
      setShowBetaWarning(true);
    } else {
      // Direct navigation for manager app
      router.push("/launch");
    }
  };

  // Improved authentication check - show loading state while auth is loading
  if (!ready && !isInWalletApp) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Only redirect if auth is ready and user is not authenticated
  if (ready && !authenticated && !isInWalletApp) {
    const queryString = searchParams.toString();
    const fullPath = queryString ? `${pathname}?${queryString}` : pathname;
    router.push(`/login?redirect=${encodeURIComponent(fullPath)}`);
    return null;
  }

  // Handler to open details modal in browse mode
  const handleBrowseProjectClick = (project: Project) => {
    router.push(`${pathname}?projectId=${project.id}`);
    setModalOpen(true);
  };



  return (
    <>
      <motion.div
        className="min-h-screen bg-background"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Header />

        <AudioPlayerProvider>
          <main className="container mx-auto px-4 py-6">
            {/* Your Projects Section - Only show on manager app or with redirect notice on main app */}
            <section className="mb-12">
              {/* Hero Tagline */}
              <motion.div
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight bg-gradient-to-r from-pink-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
                  Back The Music You Love{" "}
                  <motion.span
                    initial={{ backgroundSize: "0% 100%" }}
                    animate={{ backgroundSize: "100% 100%" }}
                    transition={{ duration: 1.2, ease: "easeInOut", delay: 0.8 }}
                    className="relative inline-block px-2 py-1 font-bold text-white bg-gradient-to-r from-pink-400 to-purple-500 rounded-lg"
                    style={{
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "left center",
                    }}
                  >
                    Before The Drop
                  </motion.span>
                </h2>
              </motion.div>

              <motion.h1
                className="text-2xl font-bold mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isMainApp() ? "Featured Projects" : "Presales"}
              </motion.h1>

              {/* Show loading state while projects are loading OR auth is loading */}
              {(isLoading || (!ready && !isInWalletApp)) ? (
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
                  {presaleProjects.length === 0 ? (
                    <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] p-8">
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                          <Plus className="h-8 w-8 text-primary" />
                        </div>
                        <h2 className="mb-2 text-xl font-medium">
                          {isMainApp()
                            ? "No featured projects"
                            : "No presale projects"}
                        </h2>
                        <p className="mb-6 text-muted-foreground">
                          {isMainApp()
                            ? "Check back later for new featured projects"
                            : "Create your first presale project to get started"}
                        </p>
                        {/* Only show create button on manager app */}
                        {(isManagerApp() || isMainApp()) && (
                          <button
                            onClick={handleNewProject}
                            className="inline-flex items-center rounded-lg bg-primary px-6 py-2.5 text-white hover:bg-primary/90"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            New Project
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {presaleProjects.map((project, index) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          index={index}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Hidden Explore Section - Temporarily disabled in dashboard */}
            {false && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Explore</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-[#0F141E] border border-[#1E1E32]/20 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none"
                      />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-[#0F141E] border border-[#1E1E32]/20 rounded-lg hover:bg-[#1E1E32]/20 transition-colors">
                      <ArrowUpDown className="h-4 w-4" />
                      Sort
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-16 animate-pulse rounded-lg bg-[#0F141E]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] overflow-hidden shadow-lg">
                    <div className="divide-y divide-[#1E1E32]/20">
                      {exploreProjects.map((project, index) => (
                        <ProjectListItem
                          key={project.id}
                          project={project}
                          index={index}
                          user={user}
                          onBrowseClick={handleBrowseProjectClick}
                        />
                      ))}
                    </div>

                    {exploreProjects.length === 0 && (
                      <div className="py-8 text-center">
                        <p className="text-muted-foreground">
                          No projects found matching your search
                        </p>
                      </div>
                    )}

                    {exploreProjects.length > 0 && (
                      <div className="border-t border-[#1E1E32]/20 p-4 text-center">
                        <button className="inline-flex items-center rounded-lg bg-[#1E1E32]/50 px-4 py-2 text-sm font-medium text-white hover:bg-[#1E1E32]">
                          View All Projects
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )} {/* End hidden Explore section */}
          </main>
        </AudioPlayerProvider>
      </motion.div>

      {/* Modals - moved outside explore section since they're used by presale section too */}
      {modalProject && (
        <ProjectDetailsModal
          project={modalProject}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            // Clear the URL parameter when closing
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("projectId");
            router.replace(newUrl.pathname + newUrl.search);
          }}
          variant="browse"
          onBuy={undefined}
        />
      )}


      <ManagerBetaWarning
        isOpen={showBetaWarning}
        onOpenChange={setShowBetaWarning}
      />
    </>
  );
}
