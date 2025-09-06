"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft,
  Gift, 
  Check, 
  Calendar,
  MapPin,
  Users,
  Clock,
  Mail,
  Phone,
  ExternalLink,
  Copy,
  Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

interface UnlockRedemption {
  id: string;
  user_id: string;
  unlock_id: string;
  club_id: string;
  redeemed_at: string;
  metadata: {
    unlock_title: string;
    unlock_type: string;
    user_status_at_redemption: string;
    user_points_at_redemption: number;
  };
}

interface Unlock {
  id: string;
  title: string;
  description: string;
  unlock_type: string;
  metadata?: {
    redemption_instructions?: string;
    expiry_date?: string;
    location?: string;
    capacity?: number;
    contact_email?: string;
    contact_phone?: string;
    external_link?: string;
    presale_code?: string;
    access_code?: string;
  };
}

interface PerkRedemptionConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  redemption: UnlockRedemption;
  unlock: Unlock;
  clubName: string;
}

const UNLOCK_TYPE_LABELS: Record<string, string> = {
  presale_access: "Presale Access",
  line_skip: "Line Skip",
  backstage_pass: "Backstage Pass",
  studio_visit: "Studio Visit",
  vinyl_lottery: "Vinyl Lottery",
  merch_discount: "Merch Discount",
  meet_greet: "Meet & Greet",
  exclusive_content: "Exclusive Content",
};

export default function PerkRedemptionConfirmation({
  isOpen,
  onClose,
  redemption,
  unlock,
  clubName
}: PerkRedemptionConfirmationProps) {
  const { toast } = useToast();
  const [showCelebration, setShowCelebration] = useState(false);

  // Trigger celebration on mount
  useEffect(() => {
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      
    if (isOpen) {
      setShowCelebration(!prefersReduced);
      // Trigger confetti
      const timeoutId = setTimeout(() => {
        if (prefersReduced) return;
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.4 },
          colors: ['#FFD700', '#FFA500', '#FF69B4', '#9370DB', '#00CED1'],
        });
      }, 300);
      
      // Cleanup
      return () => {
        clearTimeout(timeoutId);
        confetti.reset(); // Reset confetti if component unmounts
      };
    }
  }, [isOpen]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "Code copied!",
        description: "Perk code has been copied to your clipboard",
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please manually copy the code",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    const shareText = `Just redeemed ${unlock.title} from ${clubName}! 🎉`;
    try {
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Share text copied!",
        description: "Share your achievement with others",
      });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleExternalLink = (url: string) => {
    try {
      const urlObj = new URL(url);
      // Only allow http and https protocols
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        toast({
          title: "Invalid link",
          description: "Only HTTP and HTTPS links are allowed.",
          variant: "destructive",
        });
        return;
      }
      
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        title: "Invalid URL",
        description: "The provided link is not valid.",
        variant: "destructive",
      });
    }
  };

  if (!isOpen) return null;

  const unlockTypeLabel = UNLOCK_TYPE_LABELS[unlock.unlock_type] || unlock.unlock_type;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] bg-[#0E0E14]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="relative w-full h-full overflow-y-auto bg-[#0E0E14]"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-br from-primary/20 to-purple-600/20 px-6 py-12">
            {/* Back button */}
            <button
              onClick={onClose}
              className="absolute left-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Share button */}
            <button
              onClick={handleShare}
              className="absolute right-4 top-12 rounded-full bg-black/40 backdrop-blur-sm p-3 text-white hover:bg-black/60 transition-colors"
            >
              <Share2 className="h-6 w-6" />
            </button>

            {/* Success animation */}
            <div className="flex flex-col items-center text-center mt-16">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: showCelebration ? 1 : 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="relative mb-6"
              >
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="h-12 w-12 text-green-400" />
                </div>
                {/* Pulsing rings */}
                <div className="absolute inset-0 rounded-full border-2 border-green-400/30 animate-ping" />
                <div className="absolute inset-2 rounded-full border-2 border-green-400/20 animate-ping" style={{ animationDelay: '0.2s' }} />
              </motion.div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <h1 className="text-3xl font-bold text-white mb-2">
                  Perk Redeemed! 🎉
                </h1>
                <p className="text-xl text-white/80 mb-4">
                  {unlock.title}
                </p>
                <Badge variant="secondary" className="text-sm">
                  {unlockTypeLabel}
                </Badge>
              </motion.div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-8">
            {/* Key Information Card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
            >
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Your Perk Details
              </h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-white mb-2">Description</h3>
                  <p className="text-gray-300">{unlock.description}</p>
                </div>

                {/* Access codes */}
                {unlock.metadata?.presale_code && (
                  <div>
                    <h3 className="font-medium text-white mb-2">Presale Code</h3>
                    <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                      <code className="text-primary font-mono text-lg flex-1">
                        {unlock.metadata.presale_code}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (unlock.metadata?.presale_code) {
                            handleCopyCode(unlock.metadata.presale_code);
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {unlock.metadata?.access_code && (
                  <div>
                    <h3 className="font-medium text-white mb-2">Access Code</h3>
                    <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                      <code className="text-primary font-mono text-lg flex-1">
                        {unlock.metadata.access_code}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (unlock.metadata?.access_code) {
                            handleCopyCode(unlock.metadata.access_code);
                          }
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Instructions Card */}
            {unlock.metadata?.redemption_instructions && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="bg-blue-900/20 border border-blue-800/30 rounded-2xl p-6"
              >
                <h2 className="text-xl font-semibold text-white mb-4">
                  How to Use This Perk
                </h2>
                <p className="text-gray-300 leading-relaxed">
                  {unlock.metadata.redemption_instructions}
                </p>
              </motion.div>
            )}

            {/* Details Grid */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="grid grid-cols-1 gap-4"
            >
              {unlock.metadata?.location && (
                <div className="flex items-center gap-3 p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                  <MapPin className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-white">Location</p>
                    <p className="text-gray-400">{unlock.metadata.location}</p>
                  </div>
                </div>
              )}

              {unlock.metadata?.expiry_date && (
                <div className="flex items-center gap-3 p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                  <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-white">Valid Until</p>
                    <p className="text-gray-400">
                      {(() => {
                        try {
                          const date = new Date(unlock.metadata.expiry_date);
                          if (isNaN(date.getTime())) {
                            return unlock.metadata.expiry_date || '—';
                          }
                          return date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          });
                        } catch {
                          return unlock.metadata.expiry_date || '—';
                        }
                      })()}
                    </p>
                  </div>
                </div>
              )}

              {unlock.metadata?.capacity && (
                <div className="flex items-center gap-3 p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                  <Users className="h-5 w-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-white">Capacity</p>
                    <p className="text-gray-400">Limited to {unlock.metadata.capacity} people</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-4 bg-gray-900/30 rounded-xl border border-gray-800">
                <Clock className="h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-white">Redeemed</p>
                  <p className="text-gray-400">
                    {(() => {
                      if (!redemption.redeemed_at) return 'Not available';
                      try {
                        const date = new Date(redemption.redeemed_at);
                        if (isNaN(date.getTime())) {
                          return 'Not available';
                        }
                        return date.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        });
                      } catch {
                        return 'Not available';
                      }
                    })()}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Contact Information */}
            {(unlock.metadata?.contact_email || unlock.metadata?.contact_phone) && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800"
              >
                <h2 className="text-xl font-semibold text-white mb-4">
                  Need Help?
                </h2>
                <div className="space-y-3">
                  {unlock.metadata?.contact_email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-primary" />
                      <a 
                        href={`mailto:${unlock.metadata.contact_email}`}
                        className="text-primary hover:underline"
                      >
                        {unlock.metadata.contact_email}
                      </a>
                    </div>
                  )}
                  {unlock.metadata?.contact_phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <a 
                        href={`tel:${unlock.metadata.contact_phone}`}
                        className="text-primary hover:underline"
                      >
                        {unlock.metadata.contact_phone}
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* External Link */}
            {unlock.metadata?.external_link && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.0 }}
              >
                <Button
                  onClick={() => {
                    if (unlock.metadata?.external_link) {
                      handleExternalLink(unlock.metadata.external_link);
                    }
                  }}
                  className="w-full bg-primary hover:bg-primary/90 text-white py-4 text-lg"
                >
                  <ExternalLink className="h-5 w-5 mr-2" />
                  Continue to {unlockTypeLabel}
                </Button>
              </motion.div>
            )}

            {/* Footer notice */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-4 text-center"
            >
              <p className="text-yellow-200 text-sm">
                📧 Instructions have been sent to your email/phone. 
                Save this page for reference!
              </p>
            </motion.div>

            {/* Bottom spacing for safe area */}
            <div className="h-8" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
