"use client";

import type React from "react";

import { useMemo, useState, useRef } from "react";
import Image from "next/image";
import { Plus, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ClubDetailsModal from "./club-details-modal";
import dynamic from "next/dynamic";
const QRScanner = dynamic(() => import("./qr-scanner"), { ssr: false });
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useAuthAction } from "@/lib/universal-auth-context";
import { usePrivy } from "@privy-io/react-auth";
import type { Club, ClubMembership, ClubStatus } from "@/types/club.types";
import { getNextStatus, getPointsToNext } from "@/types/club.types";
import { STATUS_THRESHOLDS } from "@/lib/status";
import { useUserClubMembership, useJoinClub } from "@/hooks/use-clubs";
import { useClubImages } from "@/hooks/use-club-media";
import { useUnifiedPoints } from "@/hooks/unified-economy/use-unified-points";
import Spinner from "./ui/spinner";
import { cn } from "@/lib/utils";

interface CircleProgressProps {
  value: number;
  maxValue: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  useGradient?: boolean;
  gradientColors?: string[];
  gradientId?: string;
}

const CircleProgress = ({
  value,
  maxValue,
  size = 120,
  strokeWidth = 4,
  className,
  useGradient = true,
  gradientColors = ["#1ED760", "#1DB954", "#1AA34A"],
  gradientId,
}: CircleProgressProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = maxValue > 0 ? value / maxValue : 0;
  const fillPercentage = Math.min(1, Math.max(0, normalized));
  const strokeDashoffset = circumference * (1 - fillPercentage);

  const uniqueGradientId = useRef(
    gradientId || `circle-progress-gradient-${Math.random().toString(36).substring(2, 9)}`
  ).current;

  return (
    <div className={cn(className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {useGradient && (
          <defs>
            <linearGradient
              id={uniqueGradientId}
              gradientUnits="userSpaceOnUse"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              {(gradientColors.length > 1 ? gradientColors : [gradientColors[0], gradientColors[0]]).map((color, index, arr) => (
                <stop
                  key={index}
                  offset={`${(index / (arr.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-transparent stroke-gray-200 dark:stroke-gray-700"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-transparent transition-all duration-300"
          style={
            useGradient ? { stroke: `url(#${uniqueGradientId})` } : { stroke: '#1ED760' }
          }
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

interface ClubCardProps {
  club: Club;
  membership?: ClubMembership | null;
}

// (removed unused STATUS_* constants)

const STATUS_GRADIENT_COLORS = {
  cadet: ["#ec4899", "#be185d"], // Pink gradient - matches our primary brand
  resident: ["#3b82f6", "#1d4ed8"], // Blue gradient
  headliner: ["#8b5cf6", "#7c3aed"], // Purple gradient  
  superfan: ["#f59e0b", "#d97706"], // Gold/amber gradient for max tier
};


export default function ClubCard({
  club,
  membership: propMembership,
}: ClubCardProps) {
  const { user, isAuthenticated, isInWalletApp } = useUnifiedAuth();
  const { requireAuth } = useAuthAction();
  const { login: privyLogin } = usePrivy();
  const [showDetails, setShowDetails] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();

  // Get club images for enhanced display
  const { data: images, primaryImage } = useClubImages(club.id);

  // Get user's membership for this club - only when authenticated
  const { data: fetchedMembership } = useUserClubMembership(
    isAuthenticated ? (user?.id || null) : null, 
    club.id
  );
  
  // Use prop membership if provided, otherwise use fetched
  const membership = propMembership || fetchedMembership;
  const isMember = Boolean(membership);
  
  // Get unified points data - only when authenticated and has membership
  const enabled = Boolean(club.id && isMember && isAuthenticated);
  const { breakdown } = useUnifiedPoints(club.id, { enabled });
  
  const joinClubMutation = useJoinClub();

  // Status calculation - use effective status from database (includes temporary boosts)
  const currentStatus = breakdown?.status.current || membership?.current_status || 'cadet';
  const currentPoints = breakdown?.wallet.status_points ?? membership?.points ?? 0;
  const nextStatus = breakdown?.status.next_status || getNextStatus(currentStatus);
  
  // Progress calculation - show progress relative to current tier
  const statusProgress = useMemo(() => {
    if (!membership) return 0; // No membership = no progress
    if (!nextStatus) return 100; // Already at max status
    
    const currentThreshold = STATUS_THRESHOLDS[currentStatus];
    const nextThreshold = STATUS_THRESHOLDS[nextStatus];
    
    // Guard against division by zero
    if (nextThreshold === currentThreshold) {
      return 100;
    }
    
    // Calculate progress relative to current tier: (currentPoints - currentThreshold) / (nextThreshold - currentThreshold)
    const relativePoints = currentPoints - currentThreshold;
    const tierRange = nextThreshold - currentThreshold;
    const progress = Math.min(100, Math.max(0, (relativePoints / tierRange) * 100));
    
    return progress;
  }, [currentPoints, nextStatus, membership, currentStatus]);

  // (removed unused StatusIcon)

  const performJoin = async () => {
    if (!user?.id) return;
    try {
      await joinClubMutation.mutateAsync({ clubId: club.id });
      toast({ title: "Membership added!", description: `You've successfully joined ${club.name}` });
    } catch (error) {
      console.error('Error joining club:', error);
      toast({ title: "Failed to add membership", description: "Please try again later", variant: "destructive" });
    }
  };

  const handleJoinClub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If user is not authenticated, trigger login
    if (!isAuthenticated) {
      if (isInWalletApp) {
        // Wallet app: require auth then perform join
        requireAuth('membership', () => { void performJoin(); });
      } else {
        // In web context, directly open Privy modal
        privyLogin();
      }
      return;
    }
    
    // User is authenticated, proceed with joining club
    await performJoin();
  };

  const handleQRScan = (data: string) => {
    setShowQRScanner(false);
    // QRScanner handles '/tap' internally; treat everything else as generic
    if (data.startsWith('http')) {
      toast({ title: "QR Code Detected", description: "Opening link..." });
      const w = window.open(data, '_blank');
      if (w) w.opener = null; // prevent reverse tabnabbing
      return;
    }
    toast({ title: "QR Code Detected", description: data });
  };

  const getTierGradientColors = (tier: ClubStatus) => {
    return STATUS_GRADIENT_COLORS[tier] ?? STATUS_GRADIENT_COLORS.cadet;
  };

  const tierColors = getTierGradientColors(currentStatus);

  const handleClick = () => {
    setShowDetails(true);
  };

  return (
    <>
      <div
        id={`club-card-${club.id}`}
        className={cn(
          "relative flex flex-col items-center p-4 cursor-pointer transition-all duration-300",
          "hover:scale-105"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        <div className="relative">
          <CircleProgress
            value={membership ? statusProgress : 0}
            maxValue={100}
            size={120}
            strokeWidth={4}
            useGradient={true}
            gradientColors={tierColors}
            gradientId={`club-${club.id}-ring`}
            className="absolute inset-0"
          />
          
          <div className="relative w-[104px] h-[104px] m-2">
            {primaryImage || club.image_url ? (
              <Image
                src={primaryImage?.file_path || club.image_url || "/placeholder.svg"}
                alt={primaryImage?.alt_text || club.name}
                width={104}
                height={104}
                className="w-full h-full object-cover rounded-full"
                priority={false}
              />
            ) : (
              <div className="w-full h-full bg-primary/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">
                  {club.name.charAt(0)}
                </span>
              </div>
            )}
            
            {!membership && (
              <button
                type="button"
                aria-label={`Join ${club.name}`}
                title={`Join ${club.name}`}
                className={cn(
                  "absolute inset-0 bg-black/40 rounded-full flex items-center justify-center transition-opacity duration-300",
                  isHovered ? "opacity-100" : "opacity-0"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJoinClub(e);
                }}
              >
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                  {joinClubMutation.isPending ? (
                    <Spinner size="sm" color="slate" />
                  ) : (
                    <Plus size={20} className="text-black" />
                  )}
                </div>
              </button>
            )}

            {membership && (
              <button
                type="button"
                aria-label="Open QR scanner"
                title="Open QR scanner"
                className="absolute -bottom-1 -right-1 p-1 bg-background rounded-full border-2"
                style={{ borderColor: tierColors[0] }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQRScanner(true);
                }}
              >
                <QrCode size={16} style={{ color: tierColors[0] }} />
              </button>
            )}
          </div>
        </div>
        
        <div className="text-center mt-3">
          <h3 className="font-medium text-foreground text-sm mb-1">
            {club.name}
          </h3>
          {membership ? (
            <div className="text-xs text-muted-foreground">
              <span style={{ color: tierColors[0] }} className="font-medium">
                {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
              </span>
              <span className="mx-1">•</span>
              <span>{Math.round(statusProgress)}%</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {club.city && (
                <>
                  {club.city}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      
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
