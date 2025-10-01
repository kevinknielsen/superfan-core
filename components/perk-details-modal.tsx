"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, MapPin, Users, ExternalLink, Mail, MessageSquare, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/points";

// TypeScript interfaces for perk metadata
interface CreditCampaignMetadata {
  is_credit_campaign: true;
  credit_cost: number; // 1 credit = $1
  cogs_cents?: number;
  image_url?: string;
  image_alt?: string;
  [key: string]: unknown;
}

interface RegularPerkMetadata {
  is_credit_campaign?: false;
  image_url?: string;
  image_alt?: string;
  [key: string]: unknown;
}

type PerkMetadata = CreditCampaignMetadata | RegularPerkMetadata;

// Type guard functions for safe metadata access
function isCreditCampaignMetadata(metadata: PerkMetadata | undefined): metadata is CreditCampaignMetadata {
  return !!metadata && metadata.is_credit_campaign === true && typeof metadata.credit_cost === 'number';
}

interface PerkDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  perk: {
    title: string;
    description: string;
    type: string;
    reward_type?: string; // For determining delivery time
    rules?: {
      event_date?: string;
      location?: string;
      capacity?: number;
      instructions?: string;
      contact_email?: string;
      external_link?: string;
    };
    metadata?: PerkMetadata;
    club_info?: {
      id: string;
      name: string;
      image_url?: string | null;
    };
  } | null;
  redemption: {
    id: string;
    redeemed_at: string;
    metadata?: {
      access_code?: string;
      event_date?: string;
      location?: string;
    } & Record<string, unknown>;
  } | null;
  clubName: string;
  onPurchase?: () => void;
}

export default function PerkDetailsModal({
  isOpen,
  onClose,
  perk,
  redemption,
  clubName,
  onPurchase
}: PerkDetailsModalProps) {
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  if (!isOpen || !perk) return null;

  // NEW: Support preview mode (no redemption)
  const isPreviewMode = !redemption;

  // Extract relevant data from perk and redemption (handle preview mode)
  const eventDate = perk.rules?.event_date || redemption?.metadata?.event_date;
  const eventDateObj = eventDate ? new Date(eventDate) : null;
  const hasValidDate = !!(eventDateObj && !isNaN(eventDateObj.getTime()));
  const location = perk.rules?.location || redemption?.metadata?.location;
  const capacity = perk.rules?.capacity;
  
  // Access code only shows when item is actually redeemed (campaign funded + tickets_redeemed > 0)
  // For campaign items, just purchasing doesn't grant access yet
  const isCampaignItem = isCreditCampaignMetadata(perk.metadata);
  const isActuallyRedeemed = isCampaignItem 
    ? (redemption as any)?.tickets_redeemed > 0 
    : !!redemption;
  const accessCode = isActuallyRedeemed ? redemption?.metadata?.access_code : undefined;
  
  const instructions = perk.rules?.instructions || perk.description;
  const contactEmail = perk.rules?.contact_email;
  const externalLink = perk.rules?.external_link;

  const handleResendDetails = async () => {
    setIsResending(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      // Call notification API to resend redemption details
      const response = await fetch('/api/notifications/perk-redemption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          redemption_id: redemption?.id,
          resend: true,
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        toast({
          title: "Details sent!",
          description: "Check your email for updated redemption details.",
        });
      } else {
        // Parse server error details
        let errorMessage = "Please try again later.";
        try {
          const errorData = await response.json() as { error?: string };
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Fallback to text if JSON parsing fails
          try {
            errorMessage = await response.text() || errorMessage;
          } catch {
            // Keep default message if both fail
          }
        }
        
        toast({
          title: "Failed to resend",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error resending details:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        toast({
          title: "Request timeout",
          description: "The request took too long. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Network error",
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsResending(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perk-modal-title"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="relative w-full h-full max-w-[430px] bg-[#0E0E14] md:rounded-3xl md:shadow-2xl md:max-h-[932px] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-800 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800/50 text-white hover:bg-gray-700/50 transition-colors z-10"
              aria-label="Close"
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
            <h1 id="perk-modal-title" className="text-lg font-semibold text-white text-center flex-1 mx-4">
              {clubName}
            </h1>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Item Image Display */}
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-black">
                {perk.metadata?.image_url ? (
                  // Display campaign item image
                  <>
                    <img 
                      src={perk.metadata.image_url}
                      alt={perk.metadata.image_alt || perk.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Dark overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
                  </>
                ) : (
                  // Fallback black background
                  <div className="absolute inset-0 bg-black" />
                )}
                
                {/* Overlay Text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="text-4xl font-bold mb-2 drop-shadow-lg">{perk.title}</div>
                    {/* Only show date/location for events, not credit cost (redundant) */}
                    {hasValidDate && (
                      <div className="text-lg opacity-90 drop-shadow-lg">
                        {eventDateObj!.toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        })}
                      </div>
                    )}
                    {location && (
                      <div className="text-sm opacity-80 mt-2 drop-shadow-lg">{location}</div>
                    )}
                  </div>
                </div>
                <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 text-xs text-white">
                  1 of 1
                </div>
              </div>

              {/* Title and Date */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">{perk.title}</h2>
                {hasValidDate && (
                  <p className="text-gray-400">
                    {eventDateObj!.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </div>

              {/* Club Info */}
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden">
                  {perk.club_info?.image_url ? (
                    <img 
                      src={perk.club_info.image_url} 
                      alt={clubName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-semibold text-sm">
                      {clubName.charAt(0)}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-medium text-white">{clubName}</p>
                  <p className="text-sm text-gray-400">Club</p>
                </div>
              </div>

              {/* Event Details */}
              {(hasValidDate || location || capacity !== undefined) && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Event Details</h3>
                  <div className="space-y-3">
                    {hasValidDate && (
                      <div className="flex items-center gap-3 text-gray-300">
                        <Calendar className="h-5 w-5 text-gray-400" />
                        <span>
                          {eventDateObj!.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center gap-3 text-gray-300">
                        <MapPin className="h-5 w-5 text-gray-400" />
                        <span>{location}</span>
                      </div>
                    )}
                    {capacity !== undefined && (
                      <div className="flex items-center gap-3 text-gray-300">
                        <Users className="h-5 w-5 text-gray-400" />
                        <span>Limited to {capacity} attendees</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Credit Campaign Information (1 credit = $1) */}
              {isCreditCampaignMetadata(perk.metadata) && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Campaign Item Details</h3>
                  <div className="space-y-3">
                    <div className="text-gray-300">
                      Costs {perk.metadata.credit_cost} credit{perk.metadata.credit_cost !== 1 ? 's' : ''}
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-400">Delivery</span>
                      <span className="text-sm text-gray-300 font-medium">
                        {perk.reward_type === 'digital_product' ? 'Immediate' : '2 months'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Items are fulfilled after campaign reaches its funding goal
                    </div>
                  </div>
                </div>
              )}

              {/* Access Information */}
              {accessCode && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Access Information</h3>
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700 p-4">
                    <p className="text-sm text-gray-400 mb-2">Access Code</p>
                    <p className="font-mono text-lg text-white tracking-wider">{accessCode}</p>
                  </div>
                </div>
              )}

              {/* Instructions */}
              {instructions && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Instructions</h3>
                  <div className="text-gray-300 leading-relaxed">
                    {instructions}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="space-y-3">
                {contactEmail && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full bg-gray-800/50 border-gray-700 text-white hover:bg-gray-700/50"
                    onClick={() => window.open(`mailto:${contactEmail}`, '_blank', 'noopener,noreferrer')}
                  >
                    <Mail className="h-5 w-5 mr-2" />
                    Contact Support
                  </Button>
                )}
                {externalLink && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full bg-gray-800/50 border-gray-700 text-white hover:bg-gray-700/50"
                    onClick={() => window.open(externalLink, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-5 w-5 mr-2" />
                    External Link
                  </Button>
                )}
              </div>

              {/* Comments Section - Placeholder for future */}
              {false && (
                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Comments</h3>
                  <div className="flex items-center gap-3 text-gray-400">
                    <MessageSquare className="h-5 w-5" />
                    <span className="text-sm">No comments yet</span>
                  </div>
                </div>
              )}

              {/* Bottom spacing for fixed button */}
              <div className="h-20" />
            </div>
          </div>

          {/* Enhanced Action Button - Support both preview and redemption modes */}
          <div className="relative bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0E0E14] via-[#0E0E14]/95 to-transparent md:rounded-b-3xl flex-shrink-0">
            {isPreviewMode || !isActuallyRedeemed ? (
              // Preview mode - trigger purchase for credit campaigns
              <Button
                onClick={() => {
                  if (isCreditCampaignMetadata(perk.metadata) && onPurchase) {
                    onClose();
                    onPurchase(); // Trigger purchase flow
                  } else {
                    onClose();
                  }
                }}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 rounded-xl"
              >
                {isCreditCampaignMetadata(perk.metadata) ? (
                  'Commit Credits'
                ) : (
                  'Close Preview'
                )}
              </Button>
            ) : (
              // Redemption mode - existing resend functionality
              <Button
                onClick={handleResendDetails}
                disabled={isResending}
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl"
                aria-busy={isResending}
                aria-live="polite"
              >
                {isResending ? 'Sending...' : 'Resend Details'}
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
