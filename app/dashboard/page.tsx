"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/header";
import ClubCard from "@/components/club-card";
import { Search, Plus, Users, Star, Crown } from "lucide-react";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { useClubs, useUserClubMemberships } from "@/hooks/use-clubs";
import type { Club, ClubMembership } from "@/types/club.types";

function getSortDate(club: Club): string {
  return club.created_at || "";
}

function sortByDateDesc(clubs: Club[]): Club[] {
  return [...clubs].sort((a, b) => {
    const dateA = getSortDate(a);
    const dateB = getSortDate(b);
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

const stable_emptyArray: Club[] = [];

function useFilteredClubs(
  allClubs: Club[] | undefined,
  userMemberships: ClubMembership[] | undefined,
  searchQuery: string
) {
  // User's clubs (clubs they're members of)
  const userClubs = useMemo(() => {
    if (!userMemberships || !allClubs) return [];
    
    return userMemberships
      .map(membership => {
        const club = allClubs.find(c => c.id === membership.club_id);
        return club ? { ...club, membership } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by last activity (most recent first)
        const activityA = a?.membership?.last_activity_at || a?.created_at;
        const activityB = b?.membership?.last_activity_at || b?.created_at;
        return new Date(activityB).getTime() - new Date(activityA).getTime();
      });
  }, [allClubs, userMemberships]);

  // All clubs for discovery (excluding ones user is already in)
  const discoverClubs = useMemo(() => {
    if (!allClubs) return [];
    
    const userClubIds = new Set(userMemberships?.map(m => m.club_id) || []);
    
    return allClubs
      .filter(club => {
        // Exclude clubs user is already in
        if (userClubIds.has(club.id)) return false;
        
        // Apply search filter
        if (searchQuery) {
          return (
            club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (club.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (club.city || "").toLowerCase().includes(searchQuery.toLowerCase())
          );
        }
        
        return true;
      })
      .filter(club => club.is_active);
  }, [allClubs, userMemberships, searchQuery]);

  return { userClubs, discoverClubs };
}

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useUnifiedAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Load all clubs and user's memberships
  const { data: allClubs = stable_emptyArray, isLoading: clubsLoading } = useClubs();
  const { data: userMemberships = [], isLoading: membershipsLoading } = useUserClubMemberships(
    user?.id || null
  );
  
  const { userClubs, discoverClubs } = useFilteredClubs(
    allClubs,
    userMemberships,
    searchQuery
  );

  // Loading state
  const isLoading = authLoading || clubsLoading || membershipsLoading;

  // Redirect if not authenticated (except in wallet apps)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const queryString = searchParams.toString();
      const fullPath = queryString ? `${pathname}?${queryString}` : pathname;
      router.push(`/login?redirect=${encodeURIComponent(fullPath)}`);
    }
  }, [authLoading, isAuthenticated, router, pathname, searchParams]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }



  return (
    <>
      <motion.div
        className="min-h-screen bg-background"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Header />

        <main className="container mx-auto px-4 py-6">
          {/* Hero Tagline */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight bg-gradient-to-r from-pink-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
              Tastemakers Lead.{" "}
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
                You Get In First
              </motion.span>
            </h2>
          </motion.div>

          {/* Your Clubs Section */}
          <section className="mb-12">
            <motion.h1
              className="text-2xl font-bold mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Your Clubs
            </motion.h1>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[300px] rounded-xl bg-[#0F141E] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <>
                {userClubs.length === 0 ? (
                  <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] p-8">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                        <Users className="h-8 w-8 text-primary" />
                      </div>
                      <h2 className="mb-2 text-xl font-medium">
                        No club memberships yet
                      </h2>
                      <p className="mb-6 text-muted-foreground">
                        Add your first membership to start earning points and unlocking perks
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {userClubs.map((clubWithMembership, index) => (
                      <ClubCard
                        key={clubWithMembership.id}
                        club={clubWithMembership}
                        membership={clubWithMembership.membership}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Discover Section */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Discover</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search clubs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-[#0F141E] border border-[#1E1E32]/20 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/50 outline-none"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[300px] rounded-xl bg-[#0F141E] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <>
                {discoverClubs.length === 0 ? (
                  <div className="rounded-xl border border-[#1E1E32]/20 bg-[#0F141E] p-8">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                        <Star className="h-8 w-8 text-primary" />
                      </div>
                      <h2 className="mb-2 text-xl font-medium">
                        {searchQuery ? "No clubs found" : "All caught up!"}
                      </h2>
                      <p className="text-muted-foreground">
                        {searchQuery 
                          ? "Try adjusting your search terms"
                          : "You're already a member of all available clubs"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {discoverClubs.map((club, index) => (
                      <ClubCard
                        key={club.id}
                        club={club}
                        index={index}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </motion.div>
    </>
  );
}


