"use client";

import type React from "react";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Play, Pause, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ProjectDetailsModal from "./project-details-modal";
// Fund modal removed (legacy funding feature disabled)
import { useAudioPlayerContext } from "@/lib/audio-player-context";
import {
  getSharedFundingProgressUSD,
  getCachedFunding,
  setCachedFunding,
  fetchUniqueBackersCount,
} from "@/lib/utils";
import { isManagerApp } from "@/lib/feature-flags";
import Spinner from "./ui/spinner";
import { usePrivy } from "@/lib/auth-context";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Project } from "@/app/api/projects/route";
import FarcasterShare from "./farcaster-share";
// useMetalHolder removed (Metal integration disabled)
// Presale functionality removed (legacy feature disabled)

interface ProjectCardProps {
  project: Project;
  index: number;
  suppressAudio?: boolean;
}

export default function ProjectCard({
  project,
  index,
  suppressAudio = false,
}: ProjectCardProps) {
  const { user } = usePrivy();
  const { isAdmin: isUserAdmin, isAdminLoading } = useUnifiedAuth();
  const { data: holder } = useMetalHolder({ user });
  const [progress, setProgress] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  // const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { currentPlayingId, setCurrentPlayingId } = useAudioPlayerContext();
  const isThisCardPlaying = currentPlayingId === project.id;
  const router = useRouter();

  const targetRaise = project.financing?.target_raise;
  const displayTargetRaise =
    typeof targetRaise === "number" && !isNaN(targetRaise) ? targetRaise : null;

  // Legacy presale functionality removed for Club platform
  const presaleData = null;
  const presaleLoading = false;
  const presaleError = null;

  const backersCount = null;
  const backersLoading = false;
  const backersError = null;

  // Calculate funding progress from presale data
  const fundingProgress = presaleData?.targetUsdcAmount
    ? (presaleData.purchasedUsdcAmount / presaleData.targetUsdcAmount) * 100
    : null;

  const fundingUSD = presaleData?.purchasedUsdcAmount ?? null;
  const fundingLoading = presaleLoading;
  const fundingError = presaleError ? "Failed to load presale data" : null;

  const isPending = project.status === "pending";
  const isCreator = holder && holder.address === project.creator_id;



  // Generate waveform data
  const waveformData = useMemo(() => {
    // Generate random waveform heights (would be real audio data in production)
    return Array(40)
      .fill(0)
      .map(() => Math.random() * 100);
  }, [project.id]);

  // Clean up interval on unmount
  // useEffect(() => {
  //   return () => {
  //     if (progressIntervalRef.current) {
  //       clearInterval(progressIntervalRef.current);
  //     }
  //   };
  // }, []);

  // Sync play/pause state with context
  useEffect(() => {
    if (isThisCardPlaying) {
      audioRef.current?.play().catch(() => {});
    } else {
      audioRef.current?.pause();
    }
  }, [isThisCardPlaying]);

  // Update progress from audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const handleEnded = () => {
      setProgress(0);
      setCurrentPlayingId(null);
    };
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [setCurrentPlayingId]);

  // Play/pause handler
  const handleWaveformClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project.track_demo_url) return;
    if (isThisCardPlaying) {
      setCurrentPlayingId(null);
    } else {
      setCurrentPlayingId(project.id);
    }
  };

  return (
    <>
      <motion.div
        className={`relative overflow-hidden rounded-xl bg-[#0F141E] transition-all hover:bg-[#131822] shadow-lg shadow-black/20 hover:shadow-black/40 hover:translate-y-[-4px] cursor-pointer ${
          isPending && (isCreator || isUserAdmin) ? "opacity-90" : ""
        }`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        onClick={() => setShowDetails(true)}
      >
        {/* Top-right badges */}
        {isPending &&
          (isCreator || (!isAdminLoading && isUserAdmin)) &&
          ((!isAdminLoading && isUserAdmin) ? (
            <button
              className="absolute top-3 right-3 bg-yellow-500 text-xs text-black px-3 py-1 rounded-full shadow z-30 select-none transition-colors hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-600 cursor-pointer"
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/review/${project.id}`);
              }}
              title="Review & publish this project"
              type="button"
            >
              Pending
            </button>
          ) : (
            <span className="absolute top-3 right-3 bg-yellow-500 text-xs text-black px-3 py-1 rounded-full shadow z-30 pointer-events-none select-none">
              Pending
            </span>
          ))}
        {project.status === "draft" && isCreator && (
          <Link
            href={`/launch?id=${project.id}`}
            className="absolute top-3 right-3 bg-blue-500 text-xs text-white px-3 py-1 rounded-full shadow z-30 pointer-events-auto select-none hover:bg-blue-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Keep Editing
          </Link>
        )}
        {/* Token ticker badge - show for published projects with presale data */}
        {!isPending && 
         project.status !== "draft" && 
         presaleData?.tokenInfo?.symbol && (
          <span className="absolute top-3 right-3 bg-primary/20 border border-primary/30 text-xs text-primary px-3 py-1 rounded-full shadow z-30 pointer-events-none select-none font-medium">
            ${presaleData.tokenInfo.symbol}
          </span>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="relative mr-3 h-12 w-12 overflow-hidden rounded-full bg-primary/20 flex items-center justify-center">
                {project.cover_art_url ? (
                  <img
                    src={project.cover_art_url || "/placeholder.svg"}
                    alt={project.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-bold text-primary">
                    {project.title.charAt(0)}
                  </span>
                )}
              </div>

              <div>
                <h3 className="font-medium text-white">{project.title}</h3>
                <div className="text-sm text-muted-foreground">
                  by {project.artist_name || "Unknown Artist"}
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Waveform Player */}
          <div
            className="relative mb-6 mt-2 group"
            onClick={handleWaveformClick}
          >
            {/* Play/Pause Button Overlay */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {isThisCardPlaying ? (
                <Pause className="h-4 w-4 text-white" />
              ) : (
                <Play className="h-4 w-4 text-white ml-0.5" />
              )}
            </div>

            {/* Waveform Visualization */}
            <div className="flex items-end justify-between h-12 gap-[2px] overflow-hidden">
              {waveformData.map((height, i) => {
                // Calculate if this bar should be highlighted based on progress
                const isActive = (i / waveformData.length) * 100 <= progress;

                return (
                  <div
                    key={i}
                    className={`w-full rounded-sm transition-all duration-200 ${
                      isActive
                        ? "bg-primary"
                        : "bg-gray-700 group-hover:bg-gray-600"
                    }`}
                    style={{
                      height: `${Math.max(15, height)}%`,
                    }}
                  />
                );
              })}
            </div>

            {/* Track Label */}
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">Demo Track</span>
              <span className="text-xs text-muted-foreground">
                {isThisCardPlaying ? "Playing" : "Click to play"}
              </span>
            </div>
            {/* Hidden audio element */}
            {project.track_demo_url && !showDetails && (
              <audio
                ref={audioRef}
                src={project.track_demo_url}
                preload="none"
              />
            )}
          </div>

          {/* Funding Progress */}
          <div className="mt-4">
            {fundingLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : fundingError ? (
              <div className="text-xs text-red-500 text-center py-4">
                {fundingError}
              </div>
            ) : (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <motion.div
                    className="h-full bg-primary"
                    style={{
                      width:
                        fundingProgress !== null ? `${fundingProgress}%` : "0%",
                    }}
                    animate={{
                      width:
                        fundingProgress !== null ? `${fundingProgress}%` : "0%",
                    }}
                    transition={{ duration: 1, delay: 0.2 }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-white">
                    {fundingUSD !== null && fundingProgress !== null
                      ? `${fundingUSD.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })} (${Math.round(fundingProgress)}%)`
                      : "--"}
                  </span>
                  <span className="text-muted-foreground">
                    {displayTargetRaise !== null
                      ? displayTargetRaise.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 0,
                        })
                      : "TBA"}
                  </span>
                </div>
              </>
            )}
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <Users className="h-3 w-3 mr-1" />
              {backersLoading ? (
                <Spinner size="xs" />
              ) : backersError ? (
                <span>-- backers</span>
              ) : (
                <span>{backersCount ?? "--"} backers</span>
              )}
            </div>
          </div>

          {/* Action Button - Fund on main app, Project Details on manager app */}
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {isManagerApp() ? (
              // Manager app: Show Project Details button for authorized users
              (() => {
                if (
                  !project.team_members ||
                  project.team_members.length === 0 ||
                  !holder
                )
                  return null;

                const isTeamMember = project.team_members?.some(
                  (member) =>
                    member.wallet_address?.toLowerCase() ===
                    holder.address?.toLowerCase()
                );

                if (!isCreator && (!isAdminLoading && !isUserAdmin) && !isTeamMember) return null;

                return (
                  <Link
                    href={`/projects/${project.id}/cap-table`}
                    className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Project Details
                  </Link>
                );
              })()
            ) : (
              // Main app: Show Fund button
              <button
                disabled={
                  project.status === "draft" ||
                  !project.presale_id ||
                  (isPending && (isCreator || (!isAdminLoading && isUserAdmin)))
                }
                onClick={() => setIsFundModalOpen(true)}
                className="w-full flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
                aria-label={
                  project.status === "draft"
                    ? "Draft projects cannot be funded until published"
                    : !project.presale_id
                    ? "Funding unavailable: no presale assigned"
                    : isPending && (isCreator || (!isAdminLoading && isUserAdmin))
                    ? "Project is pending approval"
                    : undefined
                }
              >
                Fund
              </button>
            )}

            <FundModal
              project={project}
              isOpen={isFundModalOpen}
              onClose={() => setIsFundModalOpen(false)}
            />
          </div>

          {/* Share Button */}
          <div className="mt-2">
            <FarcasterShare
              url="https://superfan.one"
              text={`Check out "${project.title}" by ${project.artist_name} on Superfan! 🎵`}
              className="w-full"
            />
          </div>
        </div>
      </motion.div>
      {showDetails && (
        <ProjectDetailsModal
          project={project}
          onClose={() => setShowDetails(false)}
          isOpen={showDetails}
        />
      )}
    </>
  );
}
