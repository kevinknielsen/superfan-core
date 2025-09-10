/**
 * Custom hook to manage QR parameters and club info loading
 * Simplifies parameter validation and club data fetching
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

interface QRParams {
  qrId: string | null;
  clubId: string | null;
  source: string | null;
  data: string | null;
  location: string | null;
}

interface QRState {
  params: QRParams;
  clubInfo: any | null;
  isLoadingClub: boolean;
  hasValidQRParams: boolean;
  paramError: string | null;
}

export function useTapQRParams(): QRState {
  const searchParams = useSearchParams();
  const [clubInfo, setClubInfo] = useState<any>(null);
  const [isLoadingClub, setIsLoadingClub] = useState(false);
  const [paramError, setParamError] = useState<string | null>(null);

  // Extract and memoize QR parameters
  const params: QRParams = useMemo(() => ({
    qrId: searchParams.get('qr'),
    clubId: searchParams.get('club'),
    source: searchParams.get('source'),
    data: searchParams.get('data'),
    location: searchParams.get('location'),
  }), [searchParams]);

  // Validate QR parameters
  const hasValidQRParams = useMemo(() => {
    return !!(params.clubId && params.source);
  }, [params.clubId, params.source]);

  // Load club information
  useEffect(() => {
    const loadClubInfo = async () => {
      if (!params.clubId) {
        setParamError("Invalid QR code - missing club information");
        setClubInfo(null);
        return;
      }

      if (!params.source) {
        setParamError("Invalid QR code - missing source information");
        setClubInfo(null);
        return;
      }

      setIsLoadingClub(true);
      setParamError(null);

      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 10000); // 10 second timeout

        try {
          const response = await fetch(`/api/clubs/${params.clubId}`, {
            signal: controller.signal
          });
          
          // Clear timeout on successful response
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const club = await response.json();
            setClubInfo(club);
            setParamError(null);
          } else {
            setClubInfo(null);
            setParamError("Club not found");
          }
        } catch (fetchError: any) {
          // Clear timeout in case of error
          clearTimeout(timeoutId);
          
          if (fetchError.name === 'AbortError') {
            // Handle timeout specifically
            console.error("Request timeout loading club:", fetchError);
            setClubInfo(null);
            setParamError("Request timed out. Please check your connection and try again.");
          } else {
            // Handle other fetch errors
            throw fetchError;
          }
        }
      } catch (error) {
        console.error("Error loading club:", error);
        setClubInfo(null);
        setParamError("Failed to load club information");
      } finally {
        setIsLoadingClub(false);
      }
    };

    // Reset state when parameters change
    setClubInfo(null);
    setParamError(null);
    
    loadClubInfo();
  }, [params.clubId, params.source]);

  return {
    params,
    clubInfo,
    isLoadingClub,
    hasValidQRParams,
    paramError
  };
}
