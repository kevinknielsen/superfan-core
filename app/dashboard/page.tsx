"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import Header from "@/components/header";
import ClubCard from "@/components/club-card";
import ClubDetailsModal from "@/components/club-details-modal";
import { Search, Users, Star } from "lucide-react";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

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
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);
  const [showPurchaseCanceled, setShowPurchaseCanceled] = useState(false);
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

  const { toast } = useToast();

  // Handle URL parameters (Stripe redirects and club details navigation)
  useEffect(() => {
    const clubParam = searchParams.get('club') || searchParams.get('club_id');
    const purchaseParam = searchParams.get('purchase');
    const viewParam = searchParams.get('view');
    
    // Handle direct club details navigation (from tap page)
    if (clubParam && viewParam === 'details' && !purchaseParam) {
      console.log('Dashboard: Handling club details navigation', { clubParam, viewParam, allClubsLength: allClubs.length, clubsLoading });
      
      // Wait for clubs to load
      if (clubsLoading) {
        console.log('Dashboard: Clubs still loading, waiting...');
        return;
      }
      
      const club = allClubs.find(c => c.id === clubParam);
      console.log('Dashboard: Found club:', club?.name || 'Not found');
      if (club) {
        console.log('Dashboard: Setting selected club ID:', clubParam);
        setSelectedClubId(clubParam);
      } else {
        console.log('Dashboard: Club not found in allClubs:', allClubs.map(c => ({ id: c.id, name: c.name })));
      }
      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('club');
      newUrl.searchParams.delete('club_id');
      newUrl.searchParams.delete('view');
      router.replace(newUrl.pathname + newUrl.search);
      return;
    }
    
    // Handle Stripe purchase redirects - normalize both patterns and wait for clubs to load
    const isBoostSuccess = purchaseParam === 'boost_success' || searchParams.get('boost_success') === 'true';
    const isBoostCancelled = purchaseParam === 'boost_cancelled' || searchParams.get('boost_cancelled') === 'true';
    const isUpgradeSuccess = purchaseParam === 'upgrade_success' || searchParams.get('upgrade_success') === 'true';
    const isUpgradeCancelled = purchaseParam === 'upgrade_cancelled' || searchParams.get('upgrade_cancelled') === 'true';
    const isPointsSuccess = purchaseParam === 'success';
    const isPointsCancelled = purchaseParam === 'canceled';
    const isCampaignPurchaseSuccess = searchParams.get('purchase_success') === 'true';

    // Wait for clubs to load before processing any redirects that need club data
    if ((clubParam && (isBoostSuccess || isBoostCancelled || isPointsSuccess || isPointsCancelled || isCampaignPurchaseSuccess)) && clubsLoading) {
      return;
    }

    // Handle points purchase redirects (with club)
    if (clubParam && (isPointsSuccess || isPointsCancelled)) {
      const club = allClubs.find(c => c.id === clubParam);
      if (club) {
        if (isPointsSuccess) {
          setSelectedClubId(clubParam);
          setShowPurchaseSuccess(true);
          
          // Trigger confetti
          setTimeout(() => {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#10b981', '#3b82f6', '#8b5cf6']
            });
          }, 500);

          toast({
            title: "Points Purchase Successful! 🎉",
            description: `Your points have been added to ${club.name}`,
          });
        } else if (isPointsCancelled) {
          setSelectedClubId(clubParam);
          setShowPurchaseCanceled(true);
          
          toast({
            title: "Purchase Canceled",
            description: "No charges were made to your account",
            variant: "default",
          });
        }
      }
    }
    
    // Handle tier boost redirects (with club)
    if (clubParam && (isBoostSuccess || isBoostCancelled)) {
      const club = allClubs.find(c => c.id === clubParam);
      if (club) {
        if (isBoostSuccess) {
          setSelectedClubId(clubParam);
          setShowPurchaseSuccess(true);
          
          // Trigger confetti
          setTimeout(() => {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#10b981', '#3b82f6', '#8b5cf6']
            });
          }, 500);

          toast({
            title: "Tier Boost Successful! 🎉",
            description: `Your tier has been boosted in ${club.name}`,
          });
        } else if (isBoostCancelled) {
          setSelectedClubId(clubParam);
          setShowPurchaseCanceled(true);
          
          toast({
            title: "Tier Boost Canceled",
            description: "No charges were made to your account",
            variant: "default",
          });
        }
      }
    }
    
    // Handle campaign purchase success (credit purchases)
    if (clubParam && isCampaignPurchaseSuccess) {
      const club = allClubs.find(c => c.id === clubParam);
      if (club) {
        setSelectedClubId(clubParam);
        
        // Trigger confetti
        setTimeout(() => {
          confetti({
            particleCount: 150,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#10b981', '#22c55e', '#4ade80']
          });
        }, 500);

        toast({
          title: "Purchase Successful! 🎉",
          description: `Your credits have been added to ${club.name}`,
        });
        
        // Clean URL after a delay to allow state to propagate
        setTimeout(() => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('purchase_success');
          newUrl.searchParams.delete('club_id');
          newUrl.searchParams.delete('session_id');
          router.replace(newUrl.pathname + newUrl.search);
        }, 100);
      }
    }
    
    // Handle upgrade redirects (from root path - no club needed)
    if (isUpgradeSuccess || isUpgradeCancelled) {
      if (isUpgradeSuccess) {
        setShowPurchaseSuccess(true);
        
        // Trigger confetti
        setTimeout(() => {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#3b82f6', '#8b5cf6']
          });
        }, 500);

        toast({
          title: "Upgrade Successful! 🎉",
          description: "Your upgrade has been processed successfully",
        });
      } else if (isUpgradeCancelled) {
        setShowPurchaseCanceled(true);
        
        toast({
          title: "Upgrade Canceled",
          description: "No charges were made to your account",
          variant: "default",
        });
      }
    }

    // Clean up URL parameters for purchase flow (only if we processed a redirect)
    if (isBoostSuccess || isBoostCancelled || isUpgradeSuccess || isUpgradeCancelled || isPointsSuccess || isPointsCancelled) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('club');
      newUrl.searchParams.delete('purchase');
      newUrl.searchParams.delete('boost_success');
      newUrl.searchParams.delete('boost_cancelled');
      newUrl.searchParams.delete('upgrade_success');
      newUrl.searchParams.delete('upgrade_cancelled');
      router.replace(newUrl.pathname + newUrl.search);
    }
  }, [searchParams, allClubs, clubsLoading, router, toast]);

  // Loading state
  const isLoading = authLoading || clubsLoading || membershipsLoading;

  // Redirect if not authenticated (except in wallet apps)
  // Remove login redirect - dashboard is now browsable by everyone

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Dashboard is now browsable by everyone - auth state handled by individual components



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
              Find Your Community.{" "}
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
                Back Their Brand
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
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center p-4"
                  >
                    <div className="w-[120px] h-[120px] rounded-full bg-[#0F141E] animate-pulse mb-3" />
                    <div className="w-16 h-3 bg-[#0F141E] animate-pulse rounded" />
                  </div>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
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
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center p-4"
                  >
                    <div className="w-[120px] h-[120px] rounded-full bg-[#0F141E] animate-pulse mb-3" />
                    <div className="w-16 h-3 bg-[#0F141E] animate-pulse rounded" />
                  </div>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
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

      {/* Club Details Modal for Purchase Success/Cancel */}
      {selectedClubId && (
        <ClubDetailsModal
          club={allClubs.find(c => c.id === selectedClubId)!}
          membership={userMemberships.find(m => m.club_id === selectedClubId)}
          isOpen={!!selectedClubId}
          onClose={() => {
            setSelectedClubId(null);
            setShowPurchaseSuccess(false);
            setShowPurchaseCanceled(false);
          }}
        />
      )}

    </>
  );
}


