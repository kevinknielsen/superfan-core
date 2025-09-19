/**
 * Custom hook to manage tap-in processing logic
 * Consolidates processing state and API calls
 */

import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { TapInResponse } from '@/hooks/use-tap-ins';

interface AdditionalData {
  location?: string;
  metadata?: Record<string, any>;
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

  const triggerCelebration = useCallback(async (result: TapInResponse) => {
    // Guard against SSR
    if (typeof window === 'undefined') return;

    try {
      // Dynamically import confetti only in browser
      const { default: confetti } = await import('canvas-confetti');

      // Confetti burst
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
      });

      // Status upgrade confetti with async delay
      if (result.status_changed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        confetti({
          particleCount: 150,
          spread: 120,
          origin: { y: 0.5 },
          colors: ['#FFD700', '#FFA500', '#FF69B4', '#9370DB'],
        });
      }

      setAnimationComplete(true);
    } catch (error) {
      console.warn('Failed to load confetti library:', error);
      // Still complete the animation even if confetti fails
      setAnimationComplete(true);
    }
  }, [setAnimationComplete]);

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
          // Normalize URL-safe base64 and add padding if needed
          let normalizedData = data.replace(/-/g, '+').replace(/_/g, '/');
          while (normalizedData.length % 4) {
            normalizedData += '=';
          }

          let decodedString: string;
          if (typeof window !== 'undefined' && typeof atob === 'function') {
            // Browser environment
            decodedString = atob(normalizedData);
          } else {
            // SSR/Node environment
            decodedString = Buffer.from(normalizedData, 'base64').toString('utf-8');
          }

          const decoded = JSON.parse(decodedString) as AdditionalData;
          additionalData = decoded;
          
          // Debug log for points extraction
          if (process.env.NODE_ENV === 'development' && decoded.points) {
            console.log('[TapProcessing] Extracted dynamic points from QR:', decoded.points);
          }
        } catch (e) {
          console.warn("Could not decode QR data:", e);
        }
      }

      const tapInPayload = {
        club_id: clubId,
        source: source,
        location: location || additionalData.location,
        // Include dynamic points from QR data if available
        ...(additionalData.points && typeof additionalData.points === 'number' && {
          points_earned: additionalData.points
        }),
        metadata: {
          qr_id: qrId,
          scanned_at: new Date().toISOString(),
          ...additionalData.metadata
        }
      };

      // Generate idempotency key for double-submit protection
      const idempotencyKey = `tap-in-${clubId}-${source}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get authentication headers
      const authHeaders = await getAuthHeaders();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch('/api/tap-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...authHeaders,
        },
        body: JSON.stringify(tapInPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = 'Failed to process tap-in';
        
        try {
          // First try to parse as JSON
          const errorData = await response.json() as { 
            error?: string; 
            message?: string; 
            detail?: string; 
            error_code?: string;
          };
          
          // Check common error fields in order of preference
          errorMessage = errorData.error || errorData.message || errorData.detail || errorMessage;
          
          // Include error code in the error message for special handling
          if (errorData.error_code) {
            errorMessage = `${errorMessage}|ERROR_CODE:${errorData.error_code}`;
          }
        } catch (jsonError) {
          try {
            // If JSON parsing fails, try to get text content
            const textContent = await response.text();
            if (textContent && textContent.trim()) {
              errorMessage = textContent.trim();
            } else {
              // Fall back to status text or default message
              errorMessage = response.statusText || errorMessage;
            }
          } catch (textError) {
            // Final fallback to status text or default
            errorMessage = response.statusText || errorMessage;
          }
        }
        
        throw new Error(errorMessage);
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
        void triggerCelebration(result);
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
