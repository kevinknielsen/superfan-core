"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, MapPin, Users, ExternalLink, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PerkDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  perk: {
    title: string;
    description: string;
    type: string;
    rules?: {
      event_date?: string;
      location?: string;
      capacity?: number;
      instructions?: string;
      contact_email?: string;
      external_link?: string;
    };
    metadata?: Record<string, unknown>;
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
}

export default function PerkDetailsModal({
  isOpen,
  onClose,
  perk,
  redemption,
  clubName,
}: PerkDetailsModalProps) {
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  if (!isOpen || !perk || !redemption) return null;

  // Extract relevant data from perk and redemption
  const eventDate = perk.rules?.event_date || redemption.metadata?.event_date;
  const eventDateObj = eventDate ? new Date(eventDate) : null;
  const hasValidDate = !!(eventDateObj && !isNaN(eventDateObj.getTime()));
  const location = perk.rules?.location || redemption.metadata?.location;
  const capacity = perk.rules?.capacity;
  const accessCode = redemption.metadata?.access_code;
  const instructions = perk.rules?.instructions || perk.description;
  const contactEmail = perk.rules?.contact_email;
  const externalLink = perk.rules?.external_link;

  const handleResendDetails = async () => {
    setIsResending(true);
    try {
      // Call notification API to resend redemption details
      const response = await fetch('/api/notifications/perk-redemption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          redemption_id: redemption.id,
          resend: true,
        }),
      });

      if (response.ok) {
        toast({
          title: "Details sent!",
          description: "Check your email for updated redemption details.",
        });
      } else {
        toast({
          title: "Failed to resend",
          description: "Please try again later.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error resending details:', error);
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
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
          className="fixed inset-0 bg-[#0E0E14] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-800">
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
              {/* Event Image Placeholder - Similar to screenshot */}
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-blue-500 to-teal-400">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-white">
                    <div className="text-4xl font-bold mb-2">{perk.title}</div>
                    {hasValidDate && (
                      <div className="text-lg opacity-90">
                        {eventDateObj!.toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        })}
                      </div>
                    )}
                    {location && (
                      <div className="text-sm opacity-80 mt-2">{location}</div>
                    )}
                  </div>
                </div>
                <div className="absolute bottom-4 right-4 bg-black/20 rounded-lg px-2 py-1 text-xs text-white">
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
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {clubName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-white">{clubName}</p>
                  <p className="text-sm text-gray-400">Event Host</p>
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

              {/* Comments Section Header - Like Screenshot */}
              <div className="border-t border-gray-800 pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Comments</h3>
                <div className="flex items-center gap-3 text-gray-400">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm">No comments yet</span>
                </div>
              </div>

              {/* Bottom spacing for fixed button */}
              <div className="h-20" />
            </div>
          </div>

          {/* Fixed Action Button */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0E0E14] via-[#0E0E14]/95 to-transparent">
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
