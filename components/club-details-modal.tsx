"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Globe,
  Calendar,
  Users,
  Star,
  Crown,
  Trophy,
  Shield,
  Share2,
  MapPin,
  Gift,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import type { Club, ClubMembership, ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS, getNextStatus, getPointsToNext } from "@/types/club.types";
import { useUnifiedPoints } from "@/hooks/unified-economy/use-unified-points";
import { useClub, useUserClubData, useJoinClub } from "@/hooks/use-clubs";
import { ClubMediaDisplay } from "@/components/club-media-display";
import UnifiedPointsWallet from "./unified-economy/unified-points-wallet";
import UnlockRedemption from "./unlock-redemption";
import PerkRedemptionConfirmation from "./perk-redemption-confirmation";
import PerkDetailsModal from "./perk-details-modal";
import Spinner from "./ui/spinner";
import { formatDate } from "@/lib/utils";

// Use compatible types with existing components
type RedemptionData = any; // Keep flexible for now since it comes from API
type UnlockData = any;     // Keep flexible for now since it comes from API

interface ClubDetailsModalProps {
  club: Club;
  membership?: ClubMembership | null;
  onClose: () => void;
  isOpen: boolean;
}

// Status icon mapping
const STATUS_ICONS = {
  cadet: Users,
  resident: Star,
  headliner: Trophy,
  superfan: Crown,
};

const STATUS_COLORS = {
  cadet: "text-gray-400",
  resident: "text-blue-400", 
  headliner: "text-purple-400",
  superfan: "text-yellow-400",
};



// Helper function to render club media (supports images and videos)
function renderClubImages(club: Club) {
  return (
    <ClubMediaDisplay
      clubId={club.id}
      className="h-full w-full pointer-events-none"
      showControls={false}
      autoPlay={false}
      fallbackImage="/placeholder.svg?height=400&width=600&query=music club"
    />
  );
}

export default function ClubDetailsModal({
  club,
  membership: propMembership,
  onClose,
  isOpen,
}: ClubDetailsModalProps) {
  const { user, isAuthenticated } = useUnifiedAuth();
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [showPurchaseOverlay, setShowPurchaseOverlay] = useState(false);
  const [redemptionConfirmation, setRedemptionConfirmation] = useState<{
    redemption: RedemptionData;
    unlock: UnlockData;
  } | null>(null);
  const [perkDetails, setPerkDetails] = useState<{
    isOpen: boolean;
    unlock: UnlockData | null;
    redemption: RedemptionData | null;
  }>({
    isOpen: false,
    unlock: null,
    redemption: null,
  });
  
  // Get complete club data including unlocks
  const { data: clubData } = useClub(club.id);
  const { data: userClubData } = useUserClubData(user?.id || null, club.id);
  
  const membership = propMembership || userClubData?.membership;
  const joinClubMutation = useJoinClub();

  // Get unified points data - same as wallet component
  const { breakdown } = useUnifiedPoints(club.id);

  // Status calculations
  const currentStatus = membership?.current_status || 'cadet';
  const currentPoints = membership?.points || 0;
  const nextStatus = getNextStatus(currentStatus);
  // Use unified points data if available, fallback to manual calculation
  const pointsToNext = breakdown?.status.points_to_next ?? getPointsToNext(currentPoints, currentStatus);

  // Helper function for progress bar width calculation
  const getProgressBarWidth = () => {
    if (breakdown?.status.progress_to_next != null) {
      return `${breakdown.status.progress_to_next}%`;
    }
    if (!nextStatus) return '100%';
    
    const currentThreshold = STATUS_THRESHOLDS[currentStatus];
    const nextThreshold = STATUS_THRESHOLDS[nextStatus];
    
    // Guard against division by zero
    if (nextThreshold === currentThreshold) {
      return '100%';
    }
    
    const progress = ((currentPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    return `${Math.max(0, Math.min(progress, 100))}%`;
  };
  
  const StatusIcon = STATUS_ICONS[currentStatus];
  const statusColor = STATUS_COLORS[currentStatus];

  // Platform-aware external link handler (matches project modal)
  const handleExternalLink = async (url: string, event: React.MouseEvent) => {
    event.preventDefault();
    try {
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to open link:', error);
    }
  };

  const handleJoinClub = async () => {
    if (!isAuthenticated || !user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add memberships",
        variant: "destructive",
      });
      return;
    }

    try {
      await joinClubMutation.mutateAsync({
        privyUserId: user.id,
        clubId: club.id,
      });
      
      toast({
        title: "Membership added!",
        description: `You've successfully joined ${club.name}`,
      });
    } catch (error) {
      console.error('Error joining club:', error);
      toast({
        title: "Failed to add membership",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };



  const handleTapIn = async (source: string) => {
    if (!isAuthenticated || !user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to earn points",
        variant: "destructive",
      });
      return;
    }

    if (!membership) {
      toast({
        title: "Add membership first",
        description: "You need to be a member to earn points",
        variant: "destructive",
      });
      return;
    }

    try {
      // TODO: Implement tap-in API call
      console.log('Tap-in source:', source, 'Club:', club.id);
      
      // Show informative message until API is implemented
      toast({
        title: "Tap-in Coming Soon",
        description: "Point earning will be available once the tap-in system is live!",
        variant: "default",
      });
    } catch (error) {
      console.error('Error recording tap-in:', error);
      toast({
        title: "Failed to record tap-in",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  // Close modal when clicking outside (temporarily disabled for unified points testing)
  useEffect(() => {
    // TODO: Re-enable outside click handler after unified points modals are working
    // const handleClickOutside = (event: MouseEvent) => {
    //   const target = event.target as Node;
    //   
    //   // Check if click is outside the main modal
    //   if (modalRef.current && !modalRef.current.contains(target)) {
    //     onClose();
    //   }
    // };

    // if (isOpen) {
    //   document.addEventListener("mousedown", handleClickOutside);
    // }

    // return () => {
    //   document.removeEventListener("mousedown", handleClickOutside);
    // };
  }, [isOpen, onClose]);

  // Add Escape key handling for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open (matches project modal)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // Early return after all hooks
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-[#0E0E14]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          ref={modalRef}
          className="relative w-full h-full overflow-y-auto bg-[#0E0E14]"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header with Blurred Background */}
          <div className="relative h-80 w-full overflow-hidden">
            {/* Blurred background image */}
            <div className="absolute inset-0 scale-110 blur-lg opacity-95">
              {renderClubImages(club)}
            </div>
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/40" />

            {/* Back button */}
            <button
              onClick={onClose}
              className="absolute left-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors z-30"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Share button */}
            <button
              className="absolute right-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors z-30"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Share button clicked');
                if (!club) return;
                const url = `${window.location.origin}/clubs/${club.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast({
                    title: "Link copied!",
                    description: "Share this club with others.",
                  });
                } catch (err) {
                  toast({
                    variant: "destructive",
                    title: "Failed to copy",
                    description:
                      "Your browser blocked clipboard access. You can still copy the URL from the address bar.",
                  });
                }
              }}
              title="Copy shareable link"
            >
              <Share2 className="h-5 w-5" />
            </button>

            {/* Centered Club Profile */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-10">
              {/* Circular Avatar */}
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">
                  {renderClubImages(club)}
                </div>
              </div>

              {/* Club Name */}
              <h1 className="text-3xl font-bold text-white mb-2">
                {club.name}
              </h1>

              {/* Location */}
              {club.city && (
                <p className="text-lg text-white/80 flex items-center">
                  <MapPin className="h-4 w-4 mr-1" />
                  {club.city}
                </p>
              )}
            </div>
          </div>


          {/* Club details */}
          <div className="px-6 py-6">
            {/* Description */}
            <div className="mb-8">
              <h3 className="mb-3 text-xl font-semibold">About</h3>
              <p className="text-gray-300 text-base leading-relaxed">
                {club.description ||
                  "Add membership to this exclusive club for unique music experiences and perks."}
              </p>
            </div>

            {/* Latest Section - Club Media */}
            <div className="mb-8">
              <h3 className="mb-4 text-xl font-semibold">Latest</h3>
              {/* Container with responsive sizing */}
              <div className="flex justify-center">
                <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-700/50 shadow-2xl backdrop-blur-sm w-full max-w-2xl">
                  <div className="relative aspect-video md:aspect-[4/3]">
                    <ClubMediaDisplay
                      clubId={club.id}
                      className="w-full h-full"
                      showControls={true}
                      autoPlay={false}
                      fallbackImage="/placeholder.svg?height=400&width=600&query=music club"
                    />
                  {/* Subtle overlay for better text contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  
                  {/* Enhanced play button */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-20 h-20 bg-white/95 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-sm border border-white/20">
                      <svg className="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced content section */}
                <div className="p-5 bg-gradient-to-r from-gray-900/90 to-gray-800/90 backdrop-blur-sm">
                  <h4 className="font-bold text-white text-lg mb-3">Behind-the-Scenes from {club.name}</h4>
                  
                  {/* Cool accent line */}
                  <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-purple-400 rounded-full"></div>
                </div>
                
                {/* Subtle glow effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-purple-500/10 pointer-events-none"></div>
                </div>
              </div>
            </div>


            {/* Club Details Grid */}
            <div className="mb-8 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Founded</span>
                </div>
                <div className="font-medium text-white">
                  {formatDate(club.created_at)}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Status</span>
                </div>
                <div className="font-medium text-white">
                  {membership ? (
                    <span className={STATUS_COLORS[currentStatus]}>
                      {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                    </span>
                  ) : (
                    "Not a member"
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Location</span>
                </div>
                <div className="font-medium text-white">{club.city || "Everywhere"}</div>
              </div>

              <div className="rounded-xl border border-gray-800 p-4 bg-gray-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Club Type</span>
                </div>
                <div className="font-medium text-white">
                  <span className="text-green-400">Verified</span>
                </div>
              </div>
            </div>

            {/* Available Perks Section - Grid Layout */}
            {membership && (
              <div className="mb-8">
                <h3 className="mb-4 text-xl font-semibold">Available Perks</h3>
                <UnlockRedemption
                  clubId={club.id}
                  clubName={club.name}
                  userStatus={currentStatus}
                  userPoints={currentPoints}
                  onRedemption={() => {
                    // Optionally refetch data or show success message
                    toast({
                      title: "Perk Redeemed!",
                      description: "Check your email for details",
                    });
                  }}
                  onShowRedemptionConfirmation={(redemption, unlock) => {
                    setRedemptionConfirmation({ redemption, unlock });
                  }}
                  onShowPerkDetails={(unlock, redemption) => {
                    setPerkDetails({ isOpen: true, unlock, redemption });
                  }}
                />
              </div>
            )}



            {/* Membership Status Section - Moved to Bottom */}
            {membership ? (
              <div className="mb-8">
                <h3 className="mb-4 text-xl font-semibold">Your Status</h3>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-full ${STATUS_COLORS[currentStatus]} bg-current/20`}>
                      <StatusIcon className="h-8 w-8" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-semibold text-white mb-1">
                        {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)} Status
                      </h4>
                      <p className="text-gray-400">
                        {currentPoints.toLocaleString()} points • {nextStatus ? `${pointsToNext} to ${nextStatus}` : "Max level!"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Status Progress - Same as Unified Wallet */}
                  {nextStatus && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress to {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}</span>
                        <span>{pointsToNext} points needed</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-500 ${
                            currentStatus === 'superfan' ? 'bg-yellow-500' : 'bg-primary'
                          }`}
                          style={{ width: getProgressBarWidth() }}
                        />
                      </div>
                    </div>
                  )}
                  
                </div>
              </div>
            ) : (
              <div className="mb-8">
                <h3 className="mb-4 text-xl font-semibold">Join Club</h3>
                <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6 text-center">
                  <h4 className="font-semibold text-white mb-2">Add Membership</h4>
                  <p className="text-gray-400">
                    Become a member to earn points, unlock perks, and access the community.
                  </p>
                </div>
              </div>
            )}

            {/* Bottom spacing for anchored button */}
            <div className="h-20" />
          </div>

          {/* Anchored Action Button - Always Visible */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0E0E14] via-[#0E0E14]/95 to-transparent z-50">
            <div className="flex justify-center">
              <div className="w-full max-w-md">
                {membership ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowPurchaseOverlay(true);
                    }}
                    className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                  >
                    Open Wallet
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleJoinClub();
                    }}
                    disabled={joinClubMutation.isPending || !isAuthenticated}
                    className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    aria-label={
                      !isAuthenticated
                        ? "Sign in required to add memberships"
                        : undefined
                    }
                  >
                    {joinClubMutation.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                    <span>{joinClubMutation.isPending ? "Adding Membership..." : "Add Membership"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
      
      {/* Purchase Overlay */}
              {showPurchaseOverlay && (
          <div 
            key="purchase-overlay"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { 
            e.stopPropagation(); 
            setShowPurchaseOverlay(false); 
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md bg-[#0E0E14] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPurchaseOverlay(false)}
              className="absolute right-3 top-3 rounded-full bg-gray-800 p-2 text-white hover:bg-gray-700 transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-6">Wallet</h2>
              
              <UnifiedPointsWallet 
                clubId={club.id}
                clubName={club.name}
                showPurchaseOptions={true}
                showTransferOptions={false}
              />
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Perk Redemption Confirmation */}
      {redemptionConfirmation && (
        <PerkRedemptionConfirmation
          key="redemption-confirmation"
          isOpen={!!redemptionConfirmation}
          onClose={() => setRedemptionConfirmation(null)}
          redemption={redemptionConfirmation.redemption}
          unlock={redemptionConfirmation.unlock}
          clubName={club.name}
        />
      )}

      {/* Persistent Perk Details Modal */}
      <PerkDetailsModal
        key="perk-details"
        isOpen={perkDetails.isOpen}
        onClose={() => setPerkDetails({ isOpen: false, unlock: null, redemption: null })}
        perk={perkDetails.unlock}
        redemption={perkDetails.redemption}
        clubName={club.name}
      />
    </AnimatePresence>
  );
}