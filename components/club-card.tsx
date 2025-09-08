"use client";

import type React from "react";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Star, Crown, Trophy, Shield, Plus, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ClubDetailsModal from "./club-details-modal";
import dynamic from "next/dynamic";
const QRScanner = dynamic(() => import("./qr-scanner"), { ssr: false });
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useAuthAction } from "@/lib/universal-auth-context";
import { useRouter } from "next/navigation";
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
  const fillPercentage = Math.min(value / maxValue, 1);
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
              {gradientColors.map((color, index) => (
                <stop
                  key={index}
                  offset={`${(index / (gradientColors.length - 1)) * 100}%`}
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

const STATUS_GRADIENT_COLORS = {
  cadet: ["#ec4899", "#be185d"], // Pink gradient - matches our primary brand
  resident: ["#3b82f6", "#1d4ed8"], // Blue gradient
  headliner: ["#8b5cf6", "#7c3aed"], // Purple gradient  
  superfan: ["#f59e0b", "#d97706"], // Gold/amber gradient for max tier
};


export default function ClubCard({
  club,
  index,
  membership: propMembership,
}: ClubCardProps) {
  const { user, isAuthenticated } = useUnifiedAuth();
  const { requireAuth } = useAuthAction();
  const [showDetails, setShowDetails] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
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
  
  // Get unified points data - same as club details modal
  const { breakdown } = useUnifiedPoints(club.id);
  
  const joinClubMutation = useJoinClub();

  // Status calculation - use unified points for consistency
  const currentStatus = membership?.current_status || 'cadet';
  const currentPoints = breakdown?.wallet.earned_points || membership?.points || 0;
  const nextStatus = getNextStatus(currentStatus);
  const pointsToNext = getPointsToNext(currentPoints, currentStatus);
  
  // Progress calculation - show overall progress toward next tier
  const statusProgress = useMemo(() => {
    if (!membership) return 0; // No membership = no progress
    if (!nextStatus) return 100; // Already at max status
    
    const nextThreshold = STATUS_THRESHOLDS[nextStatus];
    // Calculate overall progress from 0 to next tier threshold
    const progress = Math.min(100, Math.max(0, (currentPoints / nextThreshold) * 100));
    
    return progress;
  }, [currentPoints, nextStatus, membership]);

  // Visual indicators
  const StatusIcon = STATUS_ICONS[currentStatus];

  const handleJoinClub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    requireAuth('membership', async () => {
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
    });
  };

  const handleQRScan = (data: string) => {
    console.log('QR Code scanned:', data);
    setShowQRScanner(false);
    
    // Check if it's a tap-in URL for this club
    if (data.includes('/tap') && data.includes(`club=${club.id}`)) {
      try {
        const url = new URL(data);
        // Extract the path and search params for local navigation
        const tapPath = `${url.pathname}${url.search}`;
        router.push(tapPath);
      } catch (error) {
        // If URL parsing fails, try direct navigation
        router.push(data.replace(window.location.origin, ''));
      }
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

  const getTierGradientColors = (tier: string) => {
    return STATUS_GRADIENT_COLORS[tier as keyof typeof STATUS_GRADIENT_COLORS] || STATUS_GRADIENT_COLORS.cadet;
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
            className="absolute inset-0"
          />
          
          <div className="relative w-[104px] h-[104px] m-2">
            {primaryImage || club.image_url ? (
              <img
                src={primaryImage?.file_path || club.image_url || "/placeholder.svg"}
                alt={primaryImage?.alt_text || club.name}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div className="w-full h-full bg-primary/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">
                  {club.name.charAt(0)}
                </span>
              </div>
            )}
            
            {!membership && (
              <div 
                className={cn(
                  "absolute inset-0 bg-black/40 rounded-full flex items-center justify-center transition-opacity duration-300",
                  isHovered ? "opacity-100" : "opacity-0"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJoinClub(e);
                }}
              >
                {joinClubMutation.isPending ? (
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <Spinner size="sm" color="black" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <Plus size={20} className="text-black" />
                  </div>
                )}
              </div>
            )}

            {membership && (
              <div 
                className="absolute -bottom-1 -right-1 p-1 bg-background rounded-full border-2"
                style={{ borderColor: tierColors[0] }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQRScanner(true);
                }}
              >
                <QrCode size={16} style={{ color: tierColors[0] }} />
              </div>
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
