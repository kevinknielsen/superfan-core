"use client";

import React, { useEffect, Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Crown, Users, Zap, Sparkles, MapPin, QrCode } from "lucide-react";
import Header from "@/components/header";
import ClubDetailsModal from "@/components/club-details-modal";
import { STATUS_COLORS, STATUS_ICONS } from "@/types/club.types";
import { TAP_IN_POINT_VALUES } from "@/lib/points";

// New custom hooks for cleaner separation of concerns
import { useTapQRParams } from "@/hooks/use-tap-qr-params";
import { useTapAuthentication } from "@/hooks/use-tap-authentication";
import { useTapProcessing } from "@/hooks/use-tap-processing";

interface TapInResponse {
  success: boolean;
  tap_in: any;
  points_earned: number;
  total_points: number;
  current_status: string;
  previous_status: string;
  status_changed: boolean;
  club_name: string;
  membership: any;
}

// Helper function to normalize base64url to base64
function normalizeBase64(str: string): string {
  // Replace base64url characters with base64 equivalents
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (normalized.length % 4) {
    normalized += '=';
  }
  return normalized;
}

// Helper function to get point value with dynamic QR data support
function getPointValue(source?: string, qrData?: string): number {
  // First try to parse points from QR data if available
  if (qrData) {
    let parsedData: any = null;
    
    // Strategy 1: Try base64url/base64 decode then JSON parse
    try {
      const normalizedData = normalizeBase64(qrData);
      const decodedData = atob(normalizedData);
      parsedData = JSON.parse(decodedData);
    } catch (error) {
      console.warn('Base64 decode failed, trying direct JSON parse:', error);
      
      // Strategy 2: Try parsing qrData directly as JSON
      try {
        parsedData = JSON.parse(qrData);
      } catch (jsonError) {
        console.warn('Direct JSON parse failed:', jsonError);
        // Continue to fallback
      }
    }
    
    // Extract and validate points if we got parsed data
    if (parsedData?.points) {
      const points = Number(parsedData.points);
      if (Number.isFinite(points)) {
        // Clamp to sane range: min 0, max 10000
        return Math.max(0, Math.min(10000, points));
      }
    }
  }
  
  // Fallback to default point values by source
  if (!source) return TAP_IN_POINT_VALUES.default;
  
  switch (source) {
    case 'qr':
    case 'qr_code':
      return TAP_IN_POINT_VALUES.qr_code;
    case 'nfc':
      return TAP_IN_POINT_VALUES.nfc;
    case 'link':
      return TAP_IN_POINT_VALUES.link;
    case 'show_entry':
      return TAP_IN_POINT_VALUES.show_entry;
    case 'merch_purchase':
      return TAP_IN_POINT_VALUES.merch_purchase;
    case 'presave':
      return TAP_IN_POINT_VALUES.presave;
    default:
      return TAP_IN_POINT_VALUES.default;
  }
}

// Helper function to get source label with qr/qr_code mapping
function getSourceLabel(source?: string): string {
  if (!source) return 'Tap Detected';
  
  switch (source) {
    case 'qr':
    case 'qr_code':
      return 'QR Code Scanned';
    case 'nfc':
      return 'NFC Tap Detected';
    case 'link':
      return 'Link Opened';
    default:
      return 'Tap Detected';
  }
}

function TapPageContent() {
  const router = useRouter();
  const [showClubDetails, setShowClubDetails] = useState(false);
  const [scrollToRewards, setScrollToRewards] = useState(false);
  
  // Extract QR parameters and load club info
  const { 
    params: { qrId, clubId, source, data, location }, 
    clubInfo, 
    isLoadingClub,
    hasValidQRParams, 
    paramError 
  } = useTapQRParams();

  // Handle authentication flow
  const {
    isReady: authReady,
    needsAuth,
    authError,
    triggerAuth,
    getAuthHeaders
  } = useTapAuthentication({
    clubInfo,
    hasValidQRParams,
    autoLoginDelay: 10000
  });

  // Handle tap-in processing
  const { isProcessing, tapResult, error: processingError, processTapIn } = useTapProcessing();

  // Consolidate all errors into one
  const error = paramError || authError || processingError;

  // Process tap-in when ready
  useEffect(() => {
    if (authReady && clubId && source) {
      processTapIn({
        clubId,
        source,
        qrId: qrId || undefined,
        location: location || undefined,
        data: data || undefined,
        getAuthHeaders
      });
    }
  }, [authReady, clubId, source, qrId, location, data, processTapIn, getAuthHeaders]);

  // Manual authentication handler
  const handleAuthAndTapIn = () => {
    triggerAuth();
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = STATUS_ICONS[status as keyof typeof STATUS_ICONS] || Users;
    return IconComponent;
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "text-gray-400";
  };

  // Show loading state while club info is loading
  if (isLoadingClub) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading club information...</p>
        </div>
      </div>
    );
  }

  // Show split-screen club preview for unauthenticated users
  if (needsAuth && clubInfo) {
    return (
      <div className="min-h-screen bg-background flex">
        {/* Left Side - Club Membership Card (Desktop only) */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 items-center justify-center relative overflow-hidden">
          {/* Background decorative elements */}
          <motion.div
            className="absolute top-20 left-10 w-32 h-32 rounded-full bg-primary/10 blur-3xl"
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute bottom-20 right-10 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl"
            animate={{
              y: [0, 20, 0],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />

          {/* Membership Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative"
            style={{ perspective: "1000px" }}
          >
            <motion.div 
              className="w-80 h-[420px] border border-slate-700 rounded-xl relative overflow-hidden"
              animate={{
                rotateY: [-5, 12, -5, 15, -5],
                rotateX: [2, -8, 2, -10, 2],
                rotateZ: [0, 3, 0, -3, 0],
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "center center",
              }}
            >
              {/* Blurred background image */}
              {clubInfo.image_url && (
                <div className="absolute inset-0 scale-110 blur-lg opacity-95">
                  <img
                    src={clubInfo.image_url}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800/40 via-slate-900/30 to-slate-900/50" />
              
              {/* Card glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-purple-500/20 opacity-50" />
              
              {/* Card content */}
              <div className="relative z-10 h-full flex flex-col p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-white font-semibold">{clubInfo.name}</span>
                  </div>
                  <div className="text-xs text-slate-400">MEMBER</div>
                </div>

                {/* Club info */}
                <div className="flex-1 flex flex-col items-center justify-center mb-6">
                  <motion.div
                    className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-600 mb-4"
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                  >
                    {clubInfo.image_url ? (
                      <img
                        src={clubInfo.image_url}
                        alt={clubInfo.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                        <Crown className="w-12 h-12 text-primary" />
                      </div>
                    )}
                  </motion.div>
                      <h3 className="text-white font-semibold text-lg mb-2">{clubInfo.name}</h3>
                  <p className="text-slate-400 text-sm text-center" style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {clubInfo.description}
                  </p>
                  {clubInfo.city && (
                    <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                      <MapPin className="h-3 w-3" />
                      {clubInfo.city}
                    </div>
                  )}
                </div>

                {/* Club stats */}
                <div className="mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Members</span>
                    <span className="text-blue-400 text-sm">{clubInfo.member_count || 0} joined</span>
                  </div>
                </div>

                {/* Source indicator */}
                <div className="mt-auto pt-4 border-t border-slate-700 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-slate-400">
                    <QrCode className="w-4 h-4" />
                    <span className="text-xs">{getSourceLabel(source || undefined)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Right Side - Authentication (Mobile full width) */}
        <div className="w-full lg:w-1/2 bg-background flex items-center justify-center p-8">
          <motion.div
            className="w-full max-w-md"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Mobile Club Card - show above title on mobile */}
            <div className="lg:hidden mb-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="mx-auto w-64"
                style={{ perspective: "1000px" }}
              >
                <motion.div 
                  className="w-full h-[340px] border border-slate-700 rounded-xl relative overflow-hidden"
                  animate={{
                    rotateY: [-3, 8, -3, 10, -3],
                    rotateX: [1, -5, 1, -7, 1],
                    rotateZ: [0, 2, 0, -2, 0],
                    scale: [1, 1.04, 1],
                  }}
                  transition={{
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  style={{
                    transformStyle: "preserve-3d",
                    transformOrigin: "center center",
                  }}
                >
                  {/* Blurred background image */}
                  {clubInfo.image_url && (
                    <div className="absolute inset-0 scale-110 blur-lg opacity-95">
                      <img
                        src={clubInfo.image_url}
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800/40 via-slate-900/30 to-slate-900/50" />
                  
                  {/* Card glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-purple-500/20 opacity-50" />
                  
                  {/* Card content */}
                  <div className="relative z-10 h-full flex flex-col p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-white font-medium text-sm">{clubInfo.name}</span>
                      </div>
                      <div className="text-xs text-slate-400">MEMBER</div>
                    </div>

                    {/* Club info */}
                    <div className="flex-1 flex flex-col items-center justify-center mb-6">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-600 mb-4">
                        {clubInfo.image_url ? (
                          <img
                            src={clubInfo.image_url}
                            alt={clubInfo.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                            <Crown className="w-10 h-10 text-primary" />
                          </div>
                        )}
                      </div>
                      <h3 className="text-white font-medium text-base mb-2">{clubInfo.name}</h3>
                      <p className="text-slate-400 text-xs text-center leading-relaxed" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {clubInfo.description}
                      </p>
                      {clubInfo.city && (
                        <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                          <MapPin className="h-3 w-3" />
                          {clubInfo.city}
                        </div>
                      )}
                    </div>

                    {/* Club stats */}
                    <div className="mt-auto mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs">Members</span>
                        <span className="text-blue-400 text-xs">{clubInfo.member_count || 0} joined</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                ADD {clubInfo.name}
              </h1>
              <p className="text-muted-foreground">
                Join the Club and Earn Points
              </p>
            </div>

            {/* Points Preview */}
            <motion.div
              className="text-center mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full">
                <span className="text-green-400 font-medium">
                  +{getPointValue(source || undefined, data || undefined)} points
                </span>
              </div>
            </motion.div>

            {/* Big Claim Points Button (like Vault's yellow button) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <button
                onClick={handleAuthAndTapIn}
                className="w-full h-16 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white rounded-2xl font-bold text-lg transition-all duration-200 flex items-center justify-center shadow-lg"
              >
                Claim Points
              </button>
            </motion.div>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-xs text-muted-foreground">
                Secure authentication powered by Privy
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Authentication loading is now handled within the useTapAuthentication hook
  // No separate loading state needed here

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="mb-6">
              <div className="h-16 w-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Tap-in Failed</h1>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />
        
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-md mx-auto">
          
          {/* Processing State */}
          {isProcessing && (
            <motion.div
              className="text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="mb-6">
                <motion.div
                  className="h-20 w-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Zap className="h-10 w-10 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-bold mb-2">Processing Tap-in...</h1>
                <p className="text-muted-foreground">Earning your points</p>
              </div>
            </motion.div>
          )}

          {/* Success State */}
          {tapResult && (
            <AnimatePresence>
              <motion.div
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                {/* Success Icon */}
                <motion.div
                  className="mb-6"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <div className="h-20 w-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-10 w-10 text-green-500" />
                  </div>
                  
                  <motion.h1
                    className="text-3xl font-bold mb-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                  >
                    Tap-in Successful! 🎉
                  </motion.h1>
                </motion.div>

                {/* Points Animation */}
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  <div className="bg-[#0F141E] rounded-xl p-6 border border-primary/20">
                    <motion.div
                      className="text-4xl font-bold text-primary mb-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                    >
                      +{tapResult.points_earned}
                    </motion.div>
                    <p className="text-sm text-muted-foreground mb-4">Points earned</p>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Points:</span>
                      <span className="font-medium">{tapResult.total_points.toLocaleString()}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-muted-foreground">Club:</span>
                      <span className="font-medium">{tapResult.club_name}</span>
                    </div>
                  </div>
                </motion.div>

                {/* Status Display */}
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                >
                  {tapResult.status_changed ? (
                    <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-6 border border-purple-500/30">
                      <motion.div
                        className="flex items-center justify-center mb-4"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.2, type: "spring", stiffness: 200 }}
                      >
                        <Sparkles className="h-6 w-6 text-purple-400 mr-2" />
                        <span className="text-lg font-bold">Status Upgraded!</span>
                        <Sparkles className="h-6 w-6 text-purple-400 ml-2" />
                      </motion.div>
                      
                      <div className="flex items-center justify-center space-x-4">
                        <div className="text-center">
                          <div className={`${getStatusColor(tapResult.previous_status)} mb-1`}>
                            {React.createElement(getStatusIcon(tapResult.previous_status), { className: "h-6 w-6 mx-auto" })}
                          </div>
                          <span className="text-xs text-muted-foreground capitalize">
                            {tapResult.previous_status}
                          </span>
                        </div>
                        
                        <motion.div
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 1.4 }}
                        >
                          →
                        </motion.div>
                        
                        <div className="text-center">
                          <motion.div
                            className={`${getStatusColor(tapResult.current_status)} mb-1`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 1.5, type: "spring" }}
                          >
                            {React.createElement(getStatusIcon(tapResult.current_status), { className: "h-6 w-6 mx-auto" })}
                          </motion.div>
                          <span className="text-xs font-medium capitalize">
                            {tapResult.current_status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#0F141E] rounded-xl p-4 border border-[#1E1E32]/20">
                      <div className="flex items-center justify-center">
                        <div className={`${getStatusColor(tapResult.current_status)} mr-2`}>
                          {React.createElement(getStatusIcon(tapResult.current_status), { className: "h-5 w-5" })}
                        </div>
                        <span className="font-medium capitalize">
                          {tapResult.current_status} Status
                        </span>
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Actions */}
                <motion.div
                  className="space-y-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.6 }}
                >
                  <button
                    onClick={() => {
                      setScrollToRewards(true);
                      if (process.env.NODE_ENV !== 'production') console.log('View Available Rewards clicked:', { clubInfo });
                      setShowClubDetails(true);
                    }}
                    className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    View Available Rewards
                  </button>
                  
                  <button
                    onClick={() => {
                      setScrollToRewards(false);
                      if (process.env.NODE_ENV !== 'production') console.log('View Club Details clicked:', { clubInfo });
                      setShowClubDetails(true);
                    }}
                    className="w-full px-6 py-3 bg-[#0F141E] text-white rounded-lg hover:bg-[#131822] transition-colors border border-[#1E1E32]/20"
                  >
                    View Club Details
                  </button>
                </motion.div>

              </motion.div>
            </AnimatePresence>
          )}

        </div>
      </div>
      </div>

      {/* Club Details Modal */}
      {showClubDetails && clubInfo && (
        <ClubDetailsModal
          club={clubInfo}
          membership={tapResult?.membership}
          isOpen={showClubDetails}
          onClose={() => setShowClubDetails(false)}
          scrollToRewards={scrollToRewards}
        />
      )}
    </>
  );
}

export default function TapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <TapPageContent />
    </Suspense>
  );
}
