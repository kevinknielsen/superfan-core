"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Star, Trophy, Crown, Users, Zap, Sparkles, MapPin, QrCode } from "lucide-react";
import confetti from "canvas-confetti";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import { STATUS_COLORS, STATUS_ICONS } from "@/types/club.types";
import { usePrivy } from "@privy-io/react-auth";
import { useFarcaster } from "@/lib/farcaster-context";
import { POINT_VALUES } from "@/hooks/use-tap-ins";

interface AdditionalData {
  location?: string;
  metadata?: Record<string, any>;
}

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


function TapPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, isInWalletApp } = useUnifiedAuth();
  const { toast } = useToast();
  const { getAccessToken, login } = usePrivy();
  const { user: farcasterUser } = useFarcaster();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [tapResult, setTapResult] = useState<TapInResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const processingStarted = useRef(false);
  const autoLoginTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Extract QR parameters
  const qrId = searchParams.get('qr');
  const clubId = searchParams.get('club');
  const source = searchParams.get('source');
  const data = searchParams.get('data');
  const location = searchParams.get('location');

  // Load club information first (even for unauthenticated users)
  const [clubInfo, setClubInfo] = useState<any>(null);
  
  // Reset processing when URL parameters change
  useEffect(() => {
    processingStarted.current = false;
    setTapResult(null);
    setError(null);
    
    // Clear any pending auto-login timer
    if (autoLoginTimerRef.current) {
      clearTimeout(autoLoginTimerRef.current);
      autoLoginTimerRef.current = null;
    }
    
    // Always load club info first
    if (clubId) {
      loadClubInfo();
    } else {
      setError("Invalid QR code - missing club information");
    }
  }, [qrId, clubId, source]);

  // Process tap-in only after authentication
  useEffect(() => {
    if (!authLoading && isAuthenticated && user && clubInfo && !processingStarted.current) {
      if (!source) {
        setError("Invalid QR code - missing source information");
        return;
      }
      
      processingStarted.current = true;
      processTapIn();
    }
  }, [authLoading, isAuthenticated, user, clubInfo, source]);

  const handleAuthAndTapIn = async () => {
    try {
      // Clear auto-login timer if user clicks manually
      if (autoLoginTimerRef.current) {
        clearTimeout(autoLoginTimerRef.current);
        autoLoginTimerRef.current = null;
      }

      // If already authenticated, process tap-in directly
      if (isAuthenticated && user && clubInfo) {
        if (!processingStarted.current) {
          processingStarted.current = true;
          processTapIn();
        }
        return;
      }

      // Skip Privy login in wallet app context
      if (isInWalletApp) {
        console.warn("Cannot trigger Privy login in wallet app context");
        return;
      }

      await login();
      // After login, the useEffect will automatically process the tap-in
    } catch (error) {
      console.error("Authentication failed:", error);
      setError("Authentication failed. Please try again.");
    }
  };

  // Auto-trigger Privy login modal when club info loads for unauthenticated users
  useEffect(() => {
    if (!authLoading && !isAuthenticated && !isInWalletApp && clubInfo && !processingStarted.current) {
      // Small delay to let the user see the club preview first
      autoLoginTimerRef.current = setTimeout(() => {
        handleAuthAndTapIn();
      }, 5000); // 5 second delay to show the club preview
      
      return () => {
        if (autoLoginTimerRef.current) {
          clearTimeout(autoLoginTimerRef.current);
          autoLoginTimerRef.current = null;
        }
      };
    }
  }, [authLoading, isAuthenticated, isInWalletApp, clubInfo]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoLoginTimerRef.current) {
        clearTimeout(autoLoginTimerRef.current);
      }
    };
  }, []);

  const loadClubInfo = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}`);
      if (response.ok) {
        const club = await response.json();
        setClubInfo(club);
      } else {
        setError("Club not found");
      }
    } catch (error) {
      console.error("Error loading club:", error);
      setError("Failed to load club information");
    }
  };

  // Get authentication headers based on context
  const getAuthHeaders = async (): Promise<{ Authorization: string }> => {
    if (isInWalletApp) {
      // Wallet app: use Farcaster authentication
      const farcasterUserId = farcasterUser?.fid?.toString();
      if (!farcasterUserId) {
        throw new Error("Farcaster user not found in wallet app");
      }
      return {
        Authorization: `Farcaster farcaster:${farcasterUserId}`,
      };
    } else {
      // Web app: use Privy authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("User not logged in");
      }
      return {
        Authorization: `Bearer ${accessToken}`,
      };
    }
  };

  const processTapIn = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Decode additional data if present
      let additionalData: AdditionalData = {};
      if (data) {
        try {
          const decoded = JSON.parse(atob(data)) as AdditionalData;
          additionalData = decoded;
        } catch (e) {
          console.warn("Could not decode QR data:", e);
        }
      }

      const tapInPayload = {
        club_id: clubId,
        source: source,
        location: location || additionalData.location,
        metadata: {
          qr_id: qrId,
          scanned_at: new Date().toISOString(),
          ...additionalData.metadata
        }
      };

      // Get authentication headers
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch('/api/tap-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(tapInPayload),
      });

      if (!response.ok) {
        let errorData: { error?: string };
        try {
          errorData = await response.json() as { error?: string };
        } catch {
          errorData = { error: 'Invalid response from server' };
        }
        throw new Error(errorData.error || 'Failed to process tap-in');
      }

      let result: TapInResponse;
      try {
        result = await response.json() as TapInResponse;
      } catch {
        throw new Error('Invalid response format from server');
      }
      setTapResult(result);

      // Trigger celebration animation
      setTimeout(() => {
        triggerCelebration(result);
      }, 500);

      // Show success toast
      toast({
        title: "Points earned! 🎉",
        description: `+${result.points_earned} points in ${result.club_name}`,
      });

    } catch (err) {
      console.error("Tap-in error:", err);
      setError(err instanceof Error ? err.message : "Failed to process tap-in");
      toast({
        title: "Tap-in failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerCelebration = (result: TapInResponse) => {
    // Confetti burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
    });

    // Status upgrade confetti
    if (result.status_changed) {
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 120,
          origin: { y: 0.5 },
          colors: ['#FFD700', '#FFA500', '#FF69B4', '#9370DB'],
        });
      }, 1000);
    }

    setAnimationComplete(true);
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = STATUS_ICONS[status as keyof typeof STATUS_ICONS] || Users;
    return IconComponent;
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "text-gray-400";
  };

  // Show split-screen club preview for unauthenticated users
  if (!authLoading && !isAuthenticated && clubInfo) {
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
              className="w-80 h-96 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 pb-8 relative overflow-hidden"
              animate={{
                rotateY: [0, 3, 0, -3, 0],
                rotateX: [0, 2, 0, -2, 0],
                scale: [1, 1.02, 1],
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
              {/* Card glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-purple-500/20 opacity-50" />
              
              {/* Card content */}
              <div className="relative z-10 h-full flex flex-col">
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
                  <p className="text-slate-400 text-sm text-center">{clubInfo.description}</p>
                  {clubInfo.city && (
                    <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                      <MapPin className="h-3 w-3" />
                      {clubInfo.city}
                    </div>
                  )}
                </div>

                {/* Status preview */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Status</span>
                    <span className="text-purple-400 text-sm">Ready to Join</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Points</span>
                    <span className="text-green-400 text-sm">+{POINT_VALUES[source as keyof typeof POINT_VALUES] || POINT_VALUES.default} on join</span>
                  </div>
                </div>

                {/* QR Code indicator */}
                <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-slate-400">
                    <QrCode className="w-4 h-4" />
                    <span className="text-xs">QR Code Scanned</span>
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
                  className="w-full h-80 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 pb-8 relative overflow-hidden"
                  animate={{
                    rotateY: [0, 3, 0, -3, 0],
                    rotateX: [0, 2, 0, -2, 0],
                    scale: [1, 1.02, 1],
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
                  {/* Card glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-purple-500/20 opacity-50" />
                  
                  {/* Card content */}
                  <div className="relative z-10 h-full flex flex-col">
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
                      <p className="text-slate-400 text-xs text-center leading-relaxed">{clubInfo.description}</p>
                      {clubInfo.city && (
                        <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                          <MapPin className="h-3 w-3" />
                          {clubInfo.city}
                        </div>
                      )}
                    </div>

                    {/* Status preview */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs">Status</span>
                        <span className="text-purple-400 text-xs">Ready to Join</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs">Points</span>
                        <span className="text-green-400 text-xs">+{POINT_VALUES[source as keyof typeof POINT_VALUES] || POINT_VALUES.default} on join</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {/* Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Join {clubInfo.name}
              </h1>
              <p className="text-muted-foreground">
                Sign in to join and earn points
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
                  +{POINT_VALUES[source as keyof typeof POINT_VALUES] || POINT_VALUES.default} points
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

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
                    onClick={() => router.push('/dashboard')}
                    className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    Return to Dashboard
                  </button>
                  
                  <button
                    onClick={() => router.push(`/dashboard?club=${tapResult.membership.club_id}`)}
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
