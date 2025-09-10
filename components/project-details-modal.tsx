"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Globe,
  Calendar,
  Users,
  DollarSign,
  Share2,
  Pause,
  Play,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
// import { usePresale } from "@/hooks/use-presale"; // Moved to legacy
import { formatDate } from "@/lib/utils";
import { isManagerApp } from "@/lib/feature-flags";
import { useToast } from "@/hooks/use-toast";
// import FundModal from "./fund-modal"; // Moved to legacy
import { useAudioPlayerContext } from "@/lib/audio-player-context";
import Spinner from "./ui/spinner";
import { ChartContainer } from "./ui/chart";
import * as RechartsPrimitive from "recharts";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "./ui/carousel";
import Link from "next/link";
import { usePrivy } from "@/lib/auth-context";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { Project as BaseProject } from "@/app/api/projects/route";
import { useFarcaster } from "@/lib/farcaster-context";

// Extended Project type to include image_urls field
type Project = BaseProject & {
  image_urls?: string[] | null;
};

interface ProjectDetailsModalProps {
  project: Project | null;
  onClose: () => void;
  isOpen: boolean;
  variant?: "project" | "browse";
  onBuy?: () => void;
}

// Helper function to render project images (single image or carousel)
function renderProjectImages(project: Project) {
  // Get images array - fallback to cover_art_url for backward compatibility
  const images = (project.image_urls && project.image_urls.length > 0) 
    ? project.image_urls 
    : project.cover_art_url 
      ? [project.cover_art_url]
      : ["/placeholder.svg?height=400&width=600&query=abstract music artwork"];
  
  if (images.length === 1) {
    // Single image - no carousel needed
    return (
      <img
        src={images[0] || "/placeholder.svg"}
        alt={project.title}
        className="h-full w-full object-cover object-center"
      />
    );
  }
  
  // Multiple images - use carousel
  return (
    <Carousel className="w-full h-full">
      <CarouselContent className="h-full">
        {images.map((imageUrl: string, index: number) => (
          <CarouselItem key={index} className="h-full">
            <img
              src={imageUrl || "/placeholder.svg"}
              alt={`${project.title} - Image ${index + 1}`}
              className="h-full w-full object-cover object-center"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious 
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 border-none text-white" 
        aria-label="Previous image"
      />
      <CarouselNext 
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 border-none text-white" 
        aria-label="Next image"
      />
    </Carousel>
  );
}

export default function ProjectDetailsModal({
  project,
  onClose,
  isOpen,
  variant = "project",
  onBuy,
}: ProjectDetailsModalProps) {
  const { toast } = useToast();
  const { openUrl } = useFarcaster();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { currentPlayingId, setCurrentPlayingId } = useAudioPlayerContext();
  const isThisModalPlaying = project && currentPlayingId === project?.id;
  const { user } = usePrivy();
  const { isAdmin: isUserAdmin, isAdminLoading } = useUnifiedAuth();

  // Button validation logic (same as project-card.tsx)
  const isPending = project?.status === "pending";
  const isCreator = user && (user.wallet?.address === project?.creator_id || user.id === project?.creator_id);

  // Platform-aware external link handler
  const handleExternalLink = async (url: string, event: React.MouseEvent) => {
    event.preventDefault();
    await openUrl(url);
  };

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

  const displayFundingGoal = presaleData?.targetUsdcAmount
    ? presaleData.targetUsdcAmount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
      })
    : "TBA";

  // Close modal when clicking outside
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

  // Prevent body scroll when modal is open
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

  // Stop playback if modal closes and this project's audio is playing
  useEffect(() => {
    if (!isOpen && isThisModalPlaying) {
      setCurrentPlayingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Sync play/pause state with context
  useEffect(() => {
    if (isThisModalPlaying) {
      audioRef.current?.play();
    } else {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  }, [isThisModalPlaying]);

  // Play/pause handler
  const handlePlayPause = () => {
    if (!project) return;
    if (isThisModalPlaying) {
      setCurrentPlayingId(null);
    } else {
      setCurrentPlayingId(project.id);
    }
  };

  // Early return after all hooks
  if (!project) return null;

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  // Funding progress is now calculated from presale data above

  // Backers count is now derived from presale data above

  // --- BROWSE VARIANT MOCK DATA ---
  const mockStats = {
    marketCap: "$19.4M",
    volume: "$717.4K",
    holders: "6,934",
    price: "$0.02",
    created: "Apr 28, 2025 at 8:47 PM",
    priceChange: "+6%",
    priceChangeDirection: "up",
    priceChangePeriod: "Past Hour",
  };
  const mockChartData = [
    { time: "0", value: 0.01 },
    { time: "10", value: 0.012 },
    { time: "20", value: 0.011 },
    { time: "30", value: 0.013 },
    { time: "40", value: 0.015 },
    { time: "50", value: 0.014 },
    { time: "60", value: 0.02 },
  ];
  const [chartRange, setChartRange] = useState<
    "1H" | "1D" | "1W" | "1M" | "All"
  >("1H");
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  // --- BROWSE VARIANT RENDER ---
  if (variant === "browse" && project) {
    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              ref={modalRef}
              className="relative w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#0E0E14] sm:max-w-md sm:rounded-2xl mt-6 sm:mt-10 pt-[env(safe-area-inset-top)] flex flex-col border border-[#1E1E32]/20 shadow-xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 z-10"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header: Avatar, Name, Price */}
              <div className="flex flex-col items-center pt-10 pb-2">
                <div className="h-16 w-16 rounded-full bg-[#181C23] flex items-center justify-center mb-2 overflow-hidden border-2 border-[#23263A]">
                  {project.cover_art_url ? (
                    <img
                      src={project.cover_art_url}
                      alt={project.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-black text-primary">%</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {project.title || "Project"}
                </div>
                <div className="text-lg font-semibold text-white mt-1">
                  {mockStats.price}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-green-400 font-bold">
                    ↑ {mockStats.priceChange}
                  </span>
                  <span className="text-gray-400 font-medium">
                    {mockStats.priceChangePeriod}
                  </span>
                </div>
              </div>

              {/* Chart */}
              <div className="px-4 pt-2">
                <div className="w-full h-40 flex items-center justify-center">
                  {/* Mock chart: simple SVG line */}
                  <svg width="100%" height="100%" viewBox="0 0 320 80">
                    <polyline
                      fill="none"
                      stroke="#A259FF"
                      strokeWidth="4"
                      points="0,70 40,30 80,50 120,20 160,40 200,30 240,60 280,40 320,50"
                    />
                    <circle cx="280" cy="40" r="5" fill="#A259FF" />
                  </svg>
                </div>
                <div className="flex justify-between mt-2 mb-4">
                  {["1H", "1D", "1W", "1M", "All"].map((range) => (
                    <button
                      key={range}
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        chartRange === range
                          ? "bg-primary text-white"
                          : "text-gray-500 hover:bg-[#181C23]"
                      }`}
                      onClick={() => setChartRange(range as any)}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* About */}
              <div className="px-4 pb-2">
                <h3 className="text-lg font-bold text-white mb-1">About</h3>
                <p className="text-gray-300 text-base mb-4">
                  {project.description || "No description provided."}
                </p>
                <h3 className="text-lg font-bold text-white mb-1">Builder</h3>
                {/* Actual artist info */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-[#181C23] border border-[#23263A] overflow-hidden">
                    {project.cover_art_url ? (
                      <img
                        src={project.cover_art_url}
                        alt={project.artist_name || "Artist"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-bold text-primary">
                        {project.artist_name
                          ? project.artist_name.charAt(0)
                          : "?"}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-200 font-medium">
                    {project.artist_name || "Unknown"}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="px-4 pb-2">
                <h3 className="text-lg font-bold text-white mb-2">Stats</h3>
                <div className="rounded-xl bg-[#181C23] p-4 grid grid-cols-2 gap-2 text-white text-base font-medium mb-2 border border-[#23263A]">
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-sm">Market Cap</span>
                    {mockStats.marketCap}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-sm">Volume (24h)</span>
                    {mockStats.volume}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-sm">Holders</span>
                    {mockStats.holders}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400 text-sm">Price</span>
                    {mockStats.price}
                  </div>
                  <div className="flex flex-col col-span-2">
                    <span className="text-gray-400 text-sm">Created</span>
                    {mockStats.created}
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="px-4 pb-32">
                <p className="text-xs text-gray-500 mt-2">
                  Superfan is not an exchange and does not provide investment
                  advice. The content of this app is not investment advice and
                  does not constitute any offer or solicitation to offer or
                  recommendation of any product or service.
                  <br />
                  <br />
                  Cryptocurrency coins are not assets and do not possess any
                  intrinsic utility or value. They are for entertainment
                  purposes only.
                </p>
              </div>

              {/* Fixed Buy Button */}
              <div className="fixed left-0 right-0 bottom-0 z-50 px-4 pb-6 bg-transparent flex justify-center">
                <button
                  className="w-full max-w-md rounded-full bg-primary py-4 text-center font-semibold text-white text-lg shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                  onClick={() => (onBuy ? onBuy() : setIsTradeModalOpen(true))}
                >
                  Buy
                </button>
              </div>

              {/* Trade Modal removed - funding disabled */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={modalRef}
            className="relative w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#0E0E14] sm:max-w-md sm:rounded-2xl mt-6 sm:mt-10 pt-[env(safe-area-inset-top)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header Image Carousel */}
            <div className="relative h-64 w-full overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
              
              {renderProjectImages(project)}

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Action buttons */}
              <div className="absolute right-4 top-16 flex flex-col gap-3">
                <button
                  className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  onClick={async () => {
                    if (!project) return;
                    const url = "https://superfan.one";
                    try {
                      await navigator.clipboard.writeText(url);
                      toast({
                        title: "Link copied!",
                        description: "Share this project with others.",
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

              {/* Artist info */}
              <div className="absolute bottom-4 left-4 right-4">
                <h1 className="text-3xl font-bold text-white">
                  {project.title}
                </h1>
                <p className="text-lg text-white/80">
                  by {project.artist_name || "Unknown Artist"}
                </p>
              </div>
            </div>

            {/* Social links */}
            <div className="flex justify-center gap-6 border-b border-gray-800 py-4">
              {(() => {
                const searchTerm = project.artist_name ?? project.title ?? "";
                return (
                  <>
                    <button
                      onClick={(e) => handleExternalLink(`https://www.google.com/search?q=${encodeURIComponent(
                        searchTerm
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

            {/* Project details */}
            <div className="px-4 py-5">
              {/* Description */}
              <div className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">About</h3>
                <p className="text-gray-300">
                  {project.description ||
                    "No description provided for this project."}
                </p>
              </div>

              {/* Demo track */}
              {project.track_demo_url && (
                <div className="mb-6 rounded-xl border border-gray-800 p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePlayPause}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-primary"
                    >
                      {isThisModalPlaying ? (
                        <Pause className="h-5 w-5 text-white" />
                      ) : (
                        <Play className="ml-1 h-5 w-5 text-white" />
                      )}
                    </button>
                    <div>
                      <h4 className="font-medium">
                        Demo Track
                        {project.track_demo_url && (
                          <span className="text-xs text-gray-400 ml-2">
                            [
                            {(() => {
                              if (!project.track_demo_url) return "";
                              try {
                                const last = project.track_demo_url
                                  .split("/")
                                  .pop();
                                return last ? last.split("?")[0] : "";
                              } catch {
                                return "";
                              }
                            })()}
                            ]
                          </span>
                        )}
                      </h4>
                      <p className="text-sm text-gray-400">
                        {isThisModalPlaying ? "Now playing" : "Click to play"}
                      </p>
                    </div>
                    {/* Hidden audio element */}
                    <audio
                      ref={audioRef}
                      src={project.track_demo_url}
                      preload="none"
                    />
                  </div>
                </div>
              )}

              {/* Project stats */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="text-sm text-gray-400">End Date</span>
                  </div>
                  <div className="mt-1 font-medium">
                    {(() => {
                      const endDate = project.financing?.end_date;
                      return endDate ? formatDate(endDate) : "TBA";
                    })()}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-sm text-gray-400">Backers</span>
                  </div>
                  <div className="mt-1 font-medium">
                    {backersLoading ? (
                      <Spinner size="xs" />
                    ) : backersError ? (
                      "--"
                    ) : (
                      backersCount ?? "--"
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <span className="text-sm text-gray-400">Funding Goal</span>
                  </div>
                  <div className="mt-1 font-medium">{displayFundingGoal}</div>
                </div>
                <div className="rounded-xl border border-gray-800 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">
                      Presale Status
                    </span>
                  </div>
                  <div className="mt-1 font-medium">
                    {presaleData ? (
                      <span className="text-green-400">
                        {presaleData.status === "active" ? "Active" : "Ended"}
                      </span>
                    ) : (
                      <span className="text-gray-400">Loading...</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Collaborator Splits Preview */}
              {project.team_members && project.team_members.length > 0 && (
                <div className="mb-6 rounded-xl border border-gray-800 p-3">
                  <div className="mb-3">
                    <span className="text-sm text-gray-400 font-semibold">
                      Collaborator Splits
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
                    {/* Pie Chart */}
                    <div className="w-full flex justify-center sm:w-1/2">
                      <ChartContainer
                        config={project.team_members.reduce<
                          Record<string, { label: string; color: string }>
                        >((acc, member, idx) => {
                          const colors = [
                            "#4285F4",
                            "#34A853",
                            "#FBBC05",
                            "#EA4335",
                            "#8AB4F8",
                            "#4ECDC4",
                            "#FF6B6B",
                            "#A239CA",
                          ];
                          acc[member.id] = {
                            label: member.name || member.role,
                            color:
                              member.role === "Backers"
                                ? "#FF6B6B"
                                : colors[idx % colors.length],
                          };
                          return acc;
                        }, {})}
                        className="w-40 h-40"
                      >
                        <RechartsPrimitive.PieChart>
                          <RechartsPrimitive.Pie
                            data={project.team_members.map((member, idx) => {
                              const colors = [
                                "#4285F4",
                                "#34A853",
                                "#FBBC05",
                                "#EA4335",
                                "#8AB4F8",
                                "#4ECDC4",
                                "#FF6B6B",
                                "#A239CA",
                              ];
                              return {
                                name: member.name || member.role,
                                value: member.revenue_share_pct,
                                id: member.id,
                                fill:
                                  member.role === "Backers"
                                    ? "#FF6B6B"
                                    : colors[idx % colors.length],
                              };
                            })}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={32}
                            outerRadius={60}
                            paddingAngle={2}
                            stroke="#0E0E14"
                          />
                        </RechartsPrimitive.PieChart>
                      </ChartContainer>
                    </div>
                    {/* List */}
                    <div className="flex-1 w-full max-w-xs space-y-2">
                      {project.team_members.map((member, idx) => {
                        const colors = [
                          "#4285F4",
                          "#34A853",
                          "#FBBC05",
                          "#EA4335",
                          "#8AB4F8",
                          "#4ECDC4",
                          "#FF6B6B",
                          "#A239CA",
                        ];
                        const color =
                          member.role === "Backers"
                            ? "#FF6B6B"
                            : colors[idx % colors.length];
                        return (
                          <div
                            key={member.id}
                            className="flex items-center gap-2"
                          >
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-sm flex-1 truncate">
                              {member.name || member.role}
                            </span>
                            <span className="text-sm font-mono">
                              {member.revenue_share_pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Funding progress */}
              <div className="mb-8">
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
                    <div className="mb-2 flex justify-between">
                      <span className="text-sm font-medium">
                        {fundingUSD !== null && fundingProgress !== null
                          ? `${fundingUSD.toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 0,
                            })} (${Math.round(fundingProgress)}%) Funded`
                          : "--"}
                      </span>
                      <span className="text-sm text-gray-400">
                        {displayFundingGoal}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width:
                            fundingProgress !== null
                              ? `${fundingProgress}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Action button - Fund on main app, Project Details on manager app */}
              {isManagerApp()
                ? // Manager app: Show Project Details button for authorized users
                  (() => {
                    if (
                      !project.team_members ||
                      project.team_members.length === 0
                    )
                      return null;

                    const isCreator = user?.id === project.creator_id;
                    const isAdmin =
                      user?.id === "did:privy:cm9kbrlj900del50mclhziloz";
                    const isTeamMember = project.team_members?.some(
                      (member) =>
                        member.wallet_address === user?.wallet?.address
                    );

                    if (!isCreator && !isAdmin && !isTeamMember) return null;

                    return (
                      <Link
                        href={`/projects/${project.id}/cap-table`}
                        className="w-full rounded-xl bg-primary py-4 text-center font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 flex items-center justify-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BarChart3 className="h-5 w-5" />
                        Project Details
                      </Link>
                    );
                  })()
                : // Main app: Show Fund button
                  <button
                    disabled={
                      project.status === "draft" ||
                      !project.presale_id ||
                      (isPending && (isCreator || (!isAdminLoading && isUserAdmin)))
                    }
                    onClick={onBuy ? () => onBuy(project) : undefined}
                    disabled={!onBuy}
                    className={`w-full rounded-xl py-4 text-center font-semibold transition-all ${
                      onBuy 
                        ? "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90" 
                        : "bg-gray-600 text-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {onBuy ? "Buy" : "Purchase Disabled"}
                  </button>}

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
