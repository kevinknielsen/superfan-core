"use client";

import type React from "react";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Play, Pause, MapPin, Star, Crown, Trophy, Shield, Plus, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ClubDetailsModal from "./club-details-modal";
import QRScanner from "./qr-scanner";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Club, ClubMembership, ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS, getNextStatus, getPointsToNext } from "@/types/club.types";
import { useUserClubMembership, useJoinClub } from "@/hooks/use-clubs";
import { useClubImages } from "@/hooks/use-club-media";
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
  const [showQRScanner, setShowQRScanner] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Get club images for enhanced display
  const { data: images, primaryImage } = useClubImages(club.id);

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
  
  // Progress calculation for status bar (matches funding progress calculation)
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

  // Generate waveform data for visual consistency (static for clubs)
  const waveformData = useMemo(() => {
    // Generate consistent waveform heights based on club name
    const seed = club.name.charCodeAt(0);
    return Array(40)
      .fill(0)
      .map((_, i) => Math.abs(Math.sin(seed + i * 0.5)) * 100);
  }, [club.name]);

  const handleJoinClub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
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

  const handleQRScan = (data: string) => {
    console.log('QR Code scanned:', data);
    setShowQRScanner(false);
    
    // Check if it's a tap-in URL for this club
    if (data.includes('/tap') && data.includes(`club=${club.id}`)) {
      // Navigate to the tap-in URL
      router.push(data.replace(window.location.origin, ''));
    } else {
      // Generic QR code - show info and allow manual navigation
      toast({
        title: "QR Code Detected",
        description: "Opening link...",
      });
      if (data.startsWith('http')) {
        window.open(data, '_blank');
      }
    }
  };

  return (
    <>
      <motion.div
        className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0F141E] to-[#0A0E16] border border-gray-800/50 transition-all duration-300 cursor-pointer group ${
          !membership ? "opacity-90" : ""
        }`}
        style={{
          boxShadow: `
            0 4px 6px -1px rgba(0, 0, 0, 0.3),
            0 2px 4px -1px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.05)
          `
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        whileHover={{
          y: -8,
          rotateX: 2,
          rotateY: 2,
          boxShadow: `
            0 20px 25px -5px rgba(0, 0, 0, 0.4),
            0 10px 10px -5px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          background: "linear-gradient(135deg, #131822, #0E1218)"
        }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowDetails(true)}
      >
        {/* Top-right status badge or plus icon */}
        {membership ? (
          <span className={`absolute top-3 right-3 ${statusBgColor} border border-current/30 text-xs px-3 py-1 rounded-full shadow z-30 pointer-events-none select-none font-medium flex items-center gap-1 ${statusColor}`}>
            <StatusIcon className="h-3 w-3" />
            {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
          </span>
        ) : (
          <button
            onClick={handleJoinClub}
            disabled={joinClubMutation.isPending || !isAuthenticated}
            className="absolute top-3 right-3 h-8 w-8 bg-primary hover:bg-primary/90 rounded-full flex items-center justify-center shadow z-30 transition-colors disabled:opacity-50"
            aria-label={
              !isAuthenticated
                ? "Sign in required to add memberships"
                : "Add membership"
            }
          >
            {joinClubMutation.isPending ? (
              <Spinner size="sm" color="white" />
            ) : (
              <Plus className="h-4 w-4 text-white" />
            )}
          </button>
        )}

        <div className="p-4 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="relative mr-3 h-12 w-12 overflow-hidden rounded-full bg-primary/20 flex items-center justify-center">
                {primaryImage || club.image_url ? (
                  <img
                    src={primaryImage?.file_path || club.image_url || "/placeholder.svg"}
                    alt={primaryImage?.alt_text || club.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold text-primary">
                    {club.name.charAt(0)}
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-medium text-white cursor-pointer hover:text-primary transition-colors" onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(true);
                }}>{club.name}</h3>
                <div className="text-sm text-muted-foreground">
                  {club.city && (
                    <>
                      <MapPin className="h-3 w-3 mr-1 inline" />
                      {club.city}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Waveform Visualization (matches project card) */}
          <div className="relative mb-6 mt-2 group">
            {/* Status indicator overlay (replaces play button) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <StatusIcon className="h-4 w-4 text-white" />
            </div>

            {/* Waveform Visualization */}
            <div className="flex items-end justify-between h-12 gap-[2px] overflow-hidden">
              {waveformData.map((height, i) => {
                // Calculate if this bar should be highlighted based on status progress
                const isActive = (i / waveformData.length) * 100 <= statusProgress;

                return (
                  <div
                    key={i}
                    className={`w-full rounded-sm transition-all duration-200 ${
                      isActive
                        ? currentStatus === 'superfan' ? 'bg-yellow-500' : 'bg-primary'
                        : "bg-gray-700 group-hover:bg-gray-600"
                    }`}
                    style={{
                      height: `${Math.max(15, height)}%`,
                    }}
                  />
                );
              })}
            </div>

            {/* Track Label (adapted for club) */}
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">Rookie</span>
              <span className="text-xs text-muted-foreground">
                {membership ? `${currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}` : "Add membership to unlock"}
              </span>
            </div>
          </div>

          {/* Status Progress (replaces funding progress) */}
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
              <motion.div
                className={`h-full ${
                  currentStatus === 'superfan' 
                    ? 'bg-yellow-500' 
                    : 'bg-primary'
                }`}
                style={{
                  width: membership ? `${statusProgress}%` : "0%",
                }}
                animate={{
                  width: membership ? `${statusProgress}%` : "0%",
                }}
                transition={{ duration: 1, delay: 0.2 }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-white">
                {membership 
                  ? `${currentPoints.toLocaleString()} points (${Math.round(statusProgress)}%)`
                  : "--"
                }
              </span>
              <span className="text-muted-foreground">
                {membership && nextStatus 
                  ? `${pointsToNext} to ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`
                  : membership 
                    ? "Max Status!" 
                    : "Add membership to start"
                }
              </span>
            </div>

            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <Users className="h-3 w-3 mr-1" />
              {membership ? (
                <span>{currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)} tier</span>
              ) : (
                <span>-- members</span>
              )}
            </div>
          </div>

          {/* Action Button (matches project card structure) */}
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {membership ? (
              <button
                onClick={() => setShowQRScanner(true)}
                className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
              >
                <QrCode className="h-4 w-4 mr-1" />
                Check In
              </button>
            ) : (
              <button
                onClick={handleJoinClub}
                disabled={joinClubMutation.isPending || !isAuthenticated}
                className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
                aria-label={
                  !isAuthenticated
                    ? "Sign in required to add memberships"
                    : undefined
                }
              >
                {joinClubMutation.isPending ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Users className="h-4 w-4 mr-1" />
                )}
                {joinClubMutation.isPending ? "Adding..." : "Add Membership"}
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
      
      {showQRScanner && (
        <QRScanner
          isOpen={showQRScanner}
          onClose={() => setShowQRScanner(false)}
          onScan={handleQRScan}
        />
      )}
    </>
  );
}
