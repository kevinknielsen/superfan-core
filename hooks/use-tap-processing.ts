/**
 * Custom hook to manage tap-in processing logic
 * Consolidates processing state and API calls
 */

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';

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

interface TapProcessingState {
  isProcessing: boolean;
  tapResult: TapInResponse | null;
  error: string | null;
  animationComplete: boolean;
}

interface TapProcessingActions {
  processTapIn: (params: TapInParams) => Promise<void>;
  clearError: () => void;
  setAnimationComplete: (complete: boolean) => void;
}

interface TapInParams {
  clubId: string;
  source: string;
  qrId?: string;
  location?: string;
  data?: string;
  getAuthHeaders: () => Promise<{ Authorization: string }>;
}

export function useTapProcessing(): TapProcessingState & TapProcessingActions {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [tapResult, setTapResult] = useState<TapInResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  const processingStarted = useRef(false);

  const triggerCelebration = useCallback((result: TapInResponse) => {
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
  }, []);

  const processTapIn = useCallback(async ({
    clubId,
    source,
    qrId,
    location,
    data,
    getAuthHeaders
  }: TapInParams) => {
    // Prevent duplicate processing
    if (processingStarted.current) {
      return;
    }
    
    processingStarted.current = true;
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
      const errorMessage = err instanceof Error ? err.message : "Failed to process tap-in";
      setError(errorMessage);
      toast({
        title: "Tap-in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      processingStarted.current = false;
    }
  }, [toast, triggerCelebration]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setAnimationCompleteCallback = useCallback((complete: boolean) => {
    setAnimationComplete(complete);
  }, []);

  return {
    isProcessing,
    tapResult,
    error,
    animationComplete,
    processTapIn,
    clearError,
    setAnimationComplete: setAnimationCompleteCallback
  };
}
