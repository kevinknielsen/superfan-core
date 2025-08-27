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
  QrCode,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import type { Club, ClubMembership, Unlock, ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS, getNextStatus, getPointsToNext } from "@/types/club.types";
import { useClub, useUserClubData, useJoinClub } from "@/hooks/use-clubs";
import { useQuickTapIn } from "@/hooks/use-tap-ins";
import { ClubMediaDisplay } from "@/components/club-media-display";
import Spinner from "./ui/spinner";
import { Badge } from "./ui/badge";
import { formatDate } from "@/lib/utils";
import UnlockRedemption from "./unlock-redemption";

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

// Unlock type icons
const UNLOCK_ICONS = {
  perk: Gift,
  lottery: Sparkles,
  allocation: Crown,
};

// Helper function to render club media (supports images and videos)
function renderClubImages(club: Club) {
  return (
    <ClubMediaDisplay
      clubId={club.id}
      className="h-full w-full"
      showControls={true}
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
  
  // Get complete club data including unlocks
  const { data: clubData } = useClub(club.id);
  const { data: userClubData } = useUserClubData(user?.id || null, club.id);
  
  const membership = propMembership || userClubData?.membership;
  const joinClubMutation = useJoinClub();
  const { linkTap, isLoading: tapLoading } = useQuickTapIn();

  // Status calculations
  const currentStatus = membership?.current_status || 'cadet';
  const currentPoints = membership?.points || 0;
  const nextStatus = getNextStatus(currentStatus);
  const pointsToNext = getPointsToNext(currentPoints, currentStatus);
  
  const StatusIcon = STATUS_ICONS[currentStatus];
  const statusColor = STATUS_COLORS[currentStatus];

  // Filter unlocks by user's status
  const availableUnlocks = clubData?.unlocks?.filter(unlock => {
    const statusOrder = ['cadet', 'resident', 'headliner', 'superfan'];
    const userStatusIndex = statusOrder.indexOf(currentStatus);
    const requiredStatusIndex = statusOrder.indexOf(unlock.min_status);
    return userStatusIndex >= requiredStatusIndex;
  }) || [];

  const lockedUnlocks = clubData?.unlocks?.filter(unlock => {
    const statusOrder = ['cadet', 'resident', 'headliner', 'superfan'];
    const userStatusIndex = statusOrder.indexOf(currentStatus);
    const requiredStatusIndex = statusOrder.indexOf(unlock.min_status);
    return userStatusIndex < requiredStatusIndex;
  }) || [];

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
      await linkTap(club.id, source);
      
      toast({
        title: "Points earned! 🎉",
        description: `+10 points in ${club.name}`,
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

  // Close modal when clicking outside (matches project modal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          ref={modalRef}
          className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0E0E14] shadow-2xl mb-0 sm:mb-0"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header Image */}
          <div className="relative h-80 w-full overflow-hidden rounded-t-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90" />
            
            {renderClubImages(club)}

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Action buttons */}
            <div className="absolute right-3 top-16 flex flex-col gap-3">
              <button
                className="rounded-full bg-black/40 backdrop-blur-sm p-2 text-white hover:bg-black/60 transition-colors"
                onClick={async () => {
                  if (!club) return;
                  const url = "https://superfan.one";
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
            </div>

            {/* Club info (matches project modal artist info) */}
            <div className="absolute bottom-4 left-4 right-4">
              <h1 className="text-3xl font-bold text-white">
                {club.name}
              </h1>
              <p className="text-lg text-white/80 flex items-center">
                {club.city && (
                  <>
                    <MapPin className="h-4 w-4 mr-1" />
                    {club.city}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Social links (adapted for club search) */}
          <div className="flex justify-center gap-6 border-b border-gray-800 py-4">
            {(() => {
              const searchTerm = club.name ?? "";
              return (
                <>
                  <button
                    onClick={(e) => handleExternalLink(`https://www.google.com/search?q=${encodeURIComponent(
                      searchTerm + " music"
                    )}`, e)}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label={`Search ${searchTerm} on Google`}
                    title={`Search for ${searchTerm} on Google`}
                  >
                    <Globe className="h-6 w-6" />
                  </button>
                  <button
                    onClick={(e) => handleExternalLink(`https://open.spotify.com/search/${encodeURIComponent(
                      searchTerm
                    )}`, e)}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label={`Search ${searchTerm} on Spotify`}
                    title={`Search for ${searchTerm} on Spotify`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.36.12-.78-.12-.9-.48-.12-.36.12-.78.48-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.66.36 1.021zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleExternalLink(`https://www.instagram.com/explore/tags/${encodeURIComponent(
                      searchTerm.replace(/\s+/g, "")
                    )}`, e)}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label={`Search ${searchTerm} on Instagram`}
                    title={`Search for ${searchTerm} on Instagram`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.057-1.644.069-4.85.069-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.073-1.689-.073-4.849 0-3.259.014-3.668.072-4.948.2-4.358 2.618-6.78 6.98-6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleExternalLink(`https://www.tiktok.com/search?q=${encodeURIComponent(
                      searchTerm
                    )}`, e)}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label={`Search ${searchTerm} on TikTok`}
                    title={`Search for ${searchTerm} on TikTok`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                    </svg>
                  </button>
                </>
              );
            })()}
          </div>

          {/* Club details */}
          <div className="px-4 py-5">
            {/* Description */}
            <div className="mb-6">
              <h3 className="mb-2 text-lg font-semibold">About</h3>
              <p className="text-gray-300">
                {club.description ||
                  "Add membership to this exclusive club for unique music experiences and perks."}
              </p>
            </div>

            {/* Membership Status (replaces demo track) */}
            {membership ? (
              <div className="mb-6 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${STATUS_COLORS[currentStatus]} bg-current/20`}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">
                      {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)} Status
                    </h4>
                    <p className="text-sm text-gray-400">
                      {currentPoints} points • {nextStatus ? `${pointsToNext} to ${nextStatus}` : "Max level!"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleTapIn('link')}
                    disabled={tapLoading}
                    className="flex items-center space-x-1 rounded-lg bg-primary/20 px-3 py-2 text-sm text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>Tap In (+10)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-gray-800 p-4 text-center">
                <h4 className="font-medium mb-2">Add Membership</h4>
                <p className="text-sm text-gray-400 mb-3">
                  Become a member to earn points, unlock perks, and access the community.
                </p>
                <button
                  onClick={handleJoinClub}
                  disabled={joinClubMutation.isPending || !isAuthenticated}
                  className="inline-flex items-center space-x-2 rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {joinClubMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  <span>{joinClubMutation.isPending ? "Adding..." : "Add Membership"}</span>
                </button>
              </div>
            )}

            {/* Club stats (replaces project stats) */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Founded</span>
                </div>
                <div className="mt-1 font-medium">
                  {formatDate(club.created_at)}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Status</span>
                </div>
                <div className="mt-1 font-medium">
                  {membership ? (
                    <span className={STATUS_COLORS[currentStatus]}>
                      {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                    </span>
                  ) : (
                    "Not a member"
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Location</span>
                </div>
                <div className="mt-1 font-medium">{club.city || "Everywhere"}</div>
              </div>

              <div className="rounded-xl border border-gray-800 p-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-400">Club Type</span>
                </div>
                <div className="mt-1 font-medium">
                  <span className="text-green-400">Verified</span>
                </div>
              </div>
            </div>

            {/* Unlocks Section */}
            {membership && (
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-semibold flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  Available Perks
                </h3>
                <UnlockRedemption
                  clubId={club.id}
                  userStatus={currentStatus}
                  userPoints={currentPoints}
                  onRedemption={() => {
                    // Optionally refresh user data after redemption
                    toast({
                      title: "Perk Redeemed! 🎉",
                      description: "Check your email or club announcements for details",
                    });
                  }}
                />
              </div>
            )}

            {/* Status progress (replaces funding progress) */}
            {membership && (
              <div className="mb-8">
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-medium">
                    {currentPoints.toLocaleString()} points
                  </span>
                  <span className="text-sm text-gray-400">
                    {nextStatus 
                      ? `${pointsToNext} to ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`
                      : "Max Status!"
                    }
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full ${
                      currentStatus === 'superfan' ? 'bg-yellow-500' : 'bg-primary'
                    }`}
                    style={{
                      width: nextStatus 
                        ? `${((currentPoints - STATUS_THRESHOLDS[currentStatus]) / (STATUS_THRESHOLDS[nextStatus] - STATUS_THRESHOLDS[currentStatus])) * 100}%`
                        : "100%",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Action button (matches project modal) */}
            {membership ? (
              <button
                onClick={() => handleTapIn('link')}
                disabled={tapLoading}
                className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <QrCode className="h-5 w-5" />
                {tapLoading ? "Recording..." : "Tap In for Points"}
              </button>
            ) : (
              <button
                onClick={handleJoinClub}
                disabled={joinClubMutation.isPending || !isAuthenticated}
                className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={
                  !isAuthenticated
                    ? "Sign in required to add memberships"
                    : undefined
                }
              >
                {joinClubMutation.isPending ? "Adding Membership..." : "Add Membership"}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}