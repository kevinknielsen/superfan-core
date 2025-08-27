"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  Users,
  Star,
  Crown,
  Trophy,
  Shield,
  Gift,
  Calendar,
  Ticket,
  Music,
  Sparkles,
  QrCode,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import type { Club, ClubMembership, Unlock, ClubStatus } from "@/types/club.types";
import { STATUS_THRESHOLDS, getNextStatus, getPointsToNext } from "@/types/club.types";
import { useClub, useUserClubData, useJoinClub } from "@/hooks/use-clubs";
import { useTapIn } from "@/hooks/use-tap-ins";
import Spinner from "./ui/spinner";
import { Badge } from "./ui/badge";

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
  cadet: "text-gray-400 border-gray-400",
  resident: "text-blue-400 border-blue-400", 
  headliner: "text-purple-400 border-purple-400",
  superfan: "text-yellow-400 border-yellow-400",
};

// Unlock type icons
const UNLOCK_ICONS = {
  perk: Gift,
  lottery: Sparkles,
  allocation: Crown,
};

export default function ClubDetailsModal({
  club,
  membership: propMembership,
  onClose,
  isOpen,
}: ClubDetailsModalProps) {
  const { user, isAuthenticated } = useUnifiedAuth();
  const { toast } = useToast();
  
  // Get complete club data including unlocks
  const { data: clubData } = useClub(club.id);
  const { data: userClubData } = useUserClubData(user?.id || null, club.id);
  
  const membership = propMembership || userClubData?.membership;
  const joinClubMutation = useJoinClub();
  const tapInMutation = useTapIn();

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

  const handleJoinClub = async () => {
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
        title: "Join the club first",
        description: "You need to be a member to earn points",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await tapInMutation.mutateAsync({
        privyUserId: user.id,
        clubId: club.id,
        source: source as any,
        location: "Club Details Modal",
      });
      
      toast({
        title: result.statusChange ? "Status Up!" : "Points Earned!",
        description: result.message,
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

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#0A0F1C] shadow-2xl"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          {/* Header */}
          <div className="relative border-b border-gray-800 p-6">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-4">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-primary/20 flex items-center justify-center">
                {club.image_url ? (
                  <img
                    src={club.image_url}
                    alt={club.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-primary">
                    {club.name.charAt(0)}
                  </span>
                )}
              </div>
              
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white">{club.name}</h1>
                <div className="flex items-center space-x-4 text-sm text-gray-400">
                  {club.city && (
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {club.city}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-1" />
                    Verified
                  </div>
                </div>
              </div>

              {membership && (
                <div className={`flex items-center space-x-2 rounded-full border px-4 py-2 ${statusColor}`}>
                  <StatusIcon className="h-5 w-5" />
                  <span className="font-medium">
                    {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
            {/* Description */}
            <div>
              <p className="text-gray-300 leading-relaxed">
                {club.description || "Join this exclusive club for unique music experiences and perks."}
              </p>
            </div>

            {/* Membership Status */}
            {membership ? (
              <div className="rounded-lg bg-gray-900/50 p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Your Membership</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{currentPoints}</div>
                    <div className="text-sm text-gray-400">Total Points</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${statusColor.split(' ')[0]}`}>
                      {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                    </div>
                    <div className="text-sm text-gray-400">Current Status</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {pointsToNext || "MAX"}
                    </div>
                    <div className="text-sm text-gray-400">
                      {nextStatus ? `Points to ${nextStatus}` : "Max Status"}
                    </div>
                  </div>
                </div>

                {/* Quick Tap-in Actions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-300">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleTapIn('link')}
                      disabled={tapInMutation.isPending}
                      className="flex items-center space-x-1 rounded-lg bg-primary/20 px-3 py-1 text-sm text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                    >
                      <QrCode className="h-4 w-4" />
                      <span>Tap In (+10)</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-900/50 p-4 text-center">
                <h3 className="text-lg font-semibold text-white mb-2">Join the Club</h3>
                <p className="text-gray-400 mb-4">
                  Become a member to earn points, unlock perks, and join the community.
                </p>
                <button
                  onClick={handleJoinClub}
                  disabled={joinClubMutation.isPending || !isAuthenticated}
                  className="inline-flex items-center space-x-2 rounded-lg bg-green-600 px-6 py-2 font-medium text-white shadow-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {joinClubMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  <span>{joinClubMutation.isPending ? "Joining..." : "Join Club"}</span>
                </button>
              </div>
            )}

            {/* Available Unlocks */}
            {availableUnlocks.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Available Unlocks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableUnlocks.map((unlock) => {
                    const UnlockIcon = UNLOCK_ICONS[unlock.type];
                    return (
                      <div
                        key={unlock.id}
                        className="rounded-lg border border-green-500/30 bg-green-500/10 p-4"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="rounded-full bg-green-500/20 p-2">
                            <UnlockIcon className="h-5 w-5 text-green-400" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-white">{unlock.title}</h4>
                            <p className="text-sm text-gray-400 mt-1">{unlock.description}</p>
                            <div className="flex items-center mt-2 space-x-2">
                              <Badge variant="secondary" className="text-xs">
                                {unlock.type}
                              </Badge>
                              {unlock.stock && (
                                <Badge variant="outline" className="text-xs">
                                  {unlock.stock} available
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Locked Unlocks */}
            {lockedUnlocks.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Locked Unlocks</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {lockedUnlocks.map((unlock) => {
                    const UnlockIcon = UNLOCK_ICONS[unlock.type];
                    return (
                      <div
                        key={unlock.id}
                        className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 opacity-60"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="rounded-full bg-gray-700 p-2">
                            <UnlockIcon className="h-5 w-5 text-gray-500" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-300">{unlock.title}</h4>
                            <p className="text-sm text-gray-500 mt-1">{unlock.description}</p>
                            <div className="flex items-center mt-2 space-x-2">
                              <Badge variant="outline" className="text-xs text-gray-500">
                                Requires {unlock.min_status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
