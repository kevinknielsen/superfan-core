"use client";

import type React from "react";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, MapPin, Star, Crown, Trophy, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ClubDetailsModal from "./club-details-modal";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Club, ClubMembership, ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS, getNextStatus, getPointsToNext } from "@/types/club.types";
import { useUserClubMembership, useJoinClub } from "@/hooks/use-clubs";
import Spinner from "./ui/spinner";

interface ClubCardProps {
  club: Club;
  index: number;
  membership?: ClubMembership | null;
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

const STATUS_BG_COLORS = {
  cadet: "bg-gray-500/20",
  resident: "bg-blue-500/20",
  headliner: "bg-purple-500/20", 
  superfan: "bg-yellow-500/20",
};

export default function ClubCard({
  club,
  index,
  membership: propMembership,
}: ClubCardProps) {
  const { user, isAuthenticated } = useUnifiedAuth();
  const [showDetails, setShowDetails] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Get user's membership for this club
  const { data: fetchedMembership } = useUserClubMembership(
    user?.id || null, 
    club.id
  );
  
  // Use prop membership if provided, otherwise use fetched
  const membership = propMembership || fetchedMembership;
  
  const joinClubMutation = useJoinClub();

  // Status calculation
  const currentStatus = membership?.current_status || 'cadet';
  const currentPoints = membership?.points || 0;
  const nextStatus = getNextStatus(currentStatus);
  const pointsToNext = getPointsToNext(currentPoints, currentStatus);
  
  // Progress calculation for status bar
  const statusProgress = useMemo(() => {
    if (!nextStatus) return 100; // Already at max status
    
    const currentThreshold = STATUS_THRESHOLDS[currentStatus];
    const nextThreshold = STATUS_THRESHOLDS[nextStatus];
    const progressInTier = currentPoints - currentThreshold;
    const tierRange = nextThreshold - currentThreshold;
    
    return Math.min(100, (progressInTier / tierRange) * 100);
  }, [currentPoints, currentStatus, nextStatus]);

  // Visual indicators
  const StatusIcon = STATUS_ICONS[currentStatus];
  const statusColor = STATUS_COLORS[currentStatus];
  const statusBgColor = STATUS_BG_COLORS[currentStatus];

  const handleJoinClub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isAuthenticated || !user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to join clubs",
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
        title: "Welcome to the club!",
        description: `You've successfully joined ${club.name}`,
      });
    } catch (error) {
      console.error('Error joining club:', error);
      toast({
        title: "Failed to join club",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <motion.div
        className="relative overflow-hidden rounded-xl bg-[#0F141E] transition-all hover:bg-[#131822] shadow-lg shadow-black/20 hover:shadow-black/40 hover:translate-y-[-4px] cursor-pointer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        onClick={() => setShowDetails(true)}
      >
        {/* Status Badge */}
        {membership && (
          <div className={`absolute top-3 right-3 ${statusBgColor} border border-current/30 text-xs px-3 py-1 rounded-full shadow z-30 pointer-events-none select-none font-medium flex items-center gap-1 ${statusColor}`}>
            <StatusIcon className="h-3 w-3" />
            {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
          </div>
        )}

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="relative mr-3 h-12 w-12 overflow-hidden rounded-full bg-primary/20 flex items-center justify-center">
                {club.image_url ? (
                  <img
                    src={club.image_url}
                    alt={club.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold text-primary">
                    {club.name.charAt(0)}
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-medium text-white">{club.name}</h3>
                <div className="text-sm text-muted-foreground flex items-center">
                  {club.city && (
                    <>
                      <MapPin className="h-3 w-3 mr-1" />
                      {club.city}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Club Description */}
          <div className="mb-4">
            <p className="text-sm text-gray-300 line-clamp-2">
              {club.description || "Join this exclusive club for music experiences"}
            </p>
          </div>

          {/* Membership Status & Progress */}
          {membership ? (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-white font-medium">
                  Status Progress
                </span>
                <span className="text-xs text-muted-foreground">
                  {currentPoints} points
                </span>
              </div>
              
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <motion.div
                  className={`h-full ${
                    currentStatus === 'superfan' 
                      ? 'bg-yellow-500' 
                      : 'bg-primary'
                  }`}
                  style={{ width: `${statusProgress}%` }}
                  animate={{ width: `${statusProgress}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                />
              </div>
              
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-white">
                  {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                </span>
                <span className="text-muted-foreground">
                  {nextStatus ? (
                    `${pointsToNext} to ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`
                  ) : (
                    "Max Status!"
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full w-0 bg-gray-600" />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Not a member</span>
                <span className="text-muted-foreground">Join to earn points</span>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center">
              <Users className="h-3 w-3 mr-1" />
              <span>Active Community</span>
            </div>
            <div className="flex items-center">
              <Shield className="h-3 w-3 mr-1" />
              <span>Verified</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {membership ? (
              <button
                onClick={() => setShowDetails(true)}
                className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
              >
                <StatusIcon className="h-4 w-4 mr-1" />
                View Club
              </button>
            ) : (
              <button
                onClick={handleJoinClub}
                disabled={joinClubMutation.isPending || !isAuthenticated}
                className="w-full flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-medium text-white shadow-lg shadow-green-600/20 transition-all hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joinClubMutation.isPending ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Users className="h-4 w-4 mr-1" />
                )}
                {joinClubMutation.isPending ? "Joining..." : "Join Club"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
      
      {showDetails && (
        <ClubDetailsModal
          club={club}
          membership={membership}
          onClose={() => setShowDetails(false)}
          isOpen={showDetails}
        />
      )}
    </>
  );
}
