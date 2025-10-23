"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import type { Club, ClubMembership } from "@/types/club.types";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useJoinClub } from "@/hooks/use-clubs";
import { usePrivy } from "@privy-io/react-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface PresaleBannerProps {
  clubs: Club[];
  memberships: ClubMembership[];
  onOpenClubDetails: (clubId: string) => void;
}

export default function PresaleBanner({
  clubs,
  memberships,
  onOpenClubDetails,
}: PresaleBannerProps) {
  const { isAuthenticated } = useUnifiedAuth();
  const { login } = usePrivy();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const joinClubMutation = useJoinClub();
  const [isProcessing, setIsProcessing] = useState(false);

  // Find Phat Trax club with precise matching to avoid false positives
  const phatTraxClub = clubs.find((club) => {
    const normalized = club.name.trim().toLowerCase();
    // Use word boundary matching to avoid matching "My Phat Trax Cover Band"
    return normalized === "phat trax" || 
           normalized === "phattrax" ||
           /\bphat trax\b/.test(normalized) ||
           /\bphattrax\b/.test(normalized);
  });

  // Check if user is already a member
  const hasMembership = phatTraxClub
    ? memberships.some((m) => m.club_id === phatTraxClub.id)
    : false;

  // Don't show banner if club doesn't exist
  if (!phatTraxClub) return null;

  const handleParticipate = async () => {
    // Prevent concurrent operations
    if (isProcessing || joinClubMutation.isPending) return;

    // Require authentication
    if (!isAuthenticated) {
      login();
      return;
    }

    setIsProcessing(true);

    try {
      // If user isn't a member, join the club first
      if (!hasMembership) {
        await joinClubMutation.mutateAsync({ clubId: phatTraxClub.id });
        
        // Wait for membership queries to refetch and settle
        await queryClient.refetchQueries({ 
          queryKey: ['user-club-memberships'],
          type: 'active'
        });
        
        toast({
          title: "Welcome to Phat Trax! 🎉",
          description: "Opening presale details...",
        });
      }

      // Open the club details modal with scroll to rewards
      onOpenClubDetails(phatTraxClub.id);
    } catch (error) {
      // Log full error for debugging/monitoring
      console.error("Error joining club:", error);
      
      // Show generic user-facing error message (don't expose raw error.message)
      toast({
        title: "Failed to join club",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-purple-600/20 p-[2px]"
    >
      {/* Animated gradient border */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 opacity-50 blur-xl animate-pulse" />
      
      <div className="relative overflow-hidden rounded-2xl bg-[#0E0E14] backdrop-blur-xl">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.4),transparent_50%)]" />
        </div>

        <div className="relative flex items-start gap-4 p-6 md:p-8">
          {/* Live indicator with pulsing animation */}
          <div className="relative flex-shrink-0 mt-1">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/30 to-purple-600/30 border border-pink-500/20">
              <Sparkles className="h-5 w-5 text-pink-400" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500"></span>
              </span>
            </div>
          </div>

          {/* Text content and button */}
          <div className="flex-1">
            <div className="flex flex-col gap-0.5 mb-2">
              <span className="inline-flex items-center rounded-full bg-pink-500/20 px-2.5 py-0.5 text-xs font-semibold text-pink-400 border border-pink-500/30 w-fit">
                LIVE NOW
              </span>
              <h3 className="text-lg md:text-xl font-bold text-white mt-1">
                Phat Trax Presale
              </h3>
            </div>
            <p className="text-sm md:text-base text-gray-300 mb-3">
              Support the campaign.
            </p>
            
            {/* CTA Button - aligned left with text */}
            <motion.button
              onClick={handleParticipate}
              disabled={isProcessing || joinClubMutation.isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-pink-500/80 to-purple-600/80 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-pink-500/20 transition-all hover:shadow-lg hover:shadow-pink-500/30 hover:from-pink-500/90 hover:to-purple-600/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {/* Button shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
              
              <span className="relative flex items-center gap-2">
                {isProcessing || joinClubMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>{hasMembership ? "View Presale" : "Join & Participate"}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

