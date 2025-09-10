import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getAccessToken } from '@privy-io/react-auth';
import { useErrorHandler, createMutationErrorHandler } from '@/lib/frontend-error-handling';

export interface PointsBreakdown {
  wallet: {
    id: string;
    total_balance: number;
    earned_points: number;
    purchased_points: number;
    spent_points: number;
    escrowed_points: number;
    status_points: number;
    last_activity: string;
    created_at: string;
  };
  status: {
    current: string;
    current_threshold: number;
    next_status: string | null;
    next_threshold: number | null;
    progress_to_next: number;
    points_to_next: number;
  };
  spending_power: {
    total_spendable: number;
    purchased_available: number;
    earned_available: number;
    earned_locked_for_status: number;
    escrowed: number;
  };
  transaction_breakdown: Record<string, { total_points: number; transaction_count: number }>;
  recent_activity: any[];
  club_membership: {
    join_date?: string;
    total_points_in_club: number;
  };
}

export interface SpendPointsRequest {
  clubId: string;
  pointsToSpend: number;
  preserveStatus?: boolean;
  description: string;
  referenceId?: string;
}

export interface TransferPointsRequest {
  clubId: string;
  recipientEmail?: string;
  recipientPrivyId?: string;
  pointsToTransfer: number;
  message?: string;
  transferType?: 'purchased_only' | 'any';
}

export function useUnifiedPoints(clubId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { handlePointsError } = useErrorHandler();

  // Fetch points breakdown
  const {
    data: breakdown,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['points-breakdown', clubId],
    queryFn: async (): Promise<PointsBreakdown> => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        if (process.env.NODE_ENV === 'development') console.log(`[useUnifiedPoints] Fetching breakdown for club ${clubId}...`);
        const response = await fetch(`/api/points/breakdown?clubId=${clubId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });
        
        if (process.env.NODE_ENV === 'development') console.log(`[useUnifiedPoints] Response status: ${response.status}`);
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch points breakdown`);
        }
        
        return response.json() as Promise<PointsBreakdown>;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timed out - please try again');
        }
        throw error;
      }
    },
    enabled: !!clubId,
    staleTime: 30000, // 30 seconds - balance between freshness and performance
    gcTime: 300000, // 5 minutes - reasonable cache duration
    retry: 1, // Only retry once on failure
    refetchOnWindowFocus: false // Don't refetch when window gains focus
  });

  // Spend points mutation
  const spendPointsMutation = useMutation({
    mutationFn: async (request: SpendPointsRequest) => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      const response = await fetch('/api/points/spend', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorPayload: any;
        try {
          errorPayload = await response.json();
        } catch {
          const text = await response.text().catch(() => '');
          errorPayload = text ? { error: text } : { error: `HTTP ${response.status}` };
        }
        throw errorPayload;
      }

      return response.json() as any;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['points-breakdown', clubId] });
      toast({
        title: "Points Spent! 🎉",
        description: `Successfully spent ${data.transaction?.points_spent || 'some'} points`,
      });
    },
    onError: (error: any) => {
      handlePointsError(error);
    },
  });

  // Transfer points mutation
  const transferPointsMutation = useMutation({
    mutationFn: async (request: TransferPointsRequest) => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      const response = await fetch('/api/points/transfer', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        let errorPayload: any;
        try {
          errorPayload = await response.json();
        } catch {
          const text = await response.text().catch(() => '');
          errorPayload = text ? { error: text } : { error: `HTTP ${response.status}` };
        }
        throw errorPayload;
      }

      return response.json() as any;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['points-breakdown', clubId] });
      toast({
        title: "Transfer Successful! 📤",
        description: `Sent ${data.transfer?.points_transferred || 'some'} points to ${data.transfer?.recipient_email || 'recipient'}`,
      });
    },
    onError: (error: any) => {
      handlePointsError(error);
    },
  });

  // Fetch spending history
  const useSpendingHistory = (limit = 50) => {
    return useQuery({
      queryKey: ['spending-history', clubId, limit],
      queryFn: async () => {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/points/spend?clubId=${clubId}&limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch spending history');
        }
        return response.json();
      },
      enabled: !!clubId,
    });
  };

  // Fetch transfer history
  const useTransferHistory = (limit = 50) => {
    return useQuery({
      queryKey: ['transfer-history', clubId, limit],
      queryFn: async () => {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/points/transfer?clubId=${clubId}&limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        });
        if (!response.ok) {
          throw new Error('Failed to fetch transfer history');
        }
        return response.json();
      },
      enabled: !!clubId,
    });
  };

  // Helper functions
  const canSpend = useCallback((amount: number, preserveStatus = false) => {
    if (!breakdown) return false;
    
    if (preserveStatus) {
      return breakdown.spending_power.purchased_available + 
             breakdown.spending_power.earned_available >= amount;
    }
    
    return breakdown.spending_power.total_spendable >= amount;
  }, [breakdown]);

  const canTransfer = useCallback((amount: number) => {
    if (!breakdown) return false;
    return breakdown.spending_power.purchased_available >= amount;
  }, [breakdown]);

  const getStatusProgress = useCallback(() => {
    if (!breakdown?.status.next_threshold) return null;
    
    return {
      current: breakdown.status.current,
      next: breakdown.status.next_status,
      progress: breakdown.status.progress_to_next,
      pointsNeeded: breakdown.status.points_to_next,
      currentPoints: breakdown.wallet.status_points,
      nextThreshold: breakdown.status.next_threshold,
    };
  }, [breakdown]);

  // Use shared formatter from lib/points

  return {
    // Data
    breakdown,
    isLoading,
    error,
    
    // Actions
    spendPoints: spendPointsMutation.mutateAsync,
    transferPoints: transferPointsMutation.mutateAsync,
    refetch,
    
    // Loading states
    isSpending: spendPointsMutation.isPending,
    isTransferring: transferPointsMutation.isPending,
    
    // History hooks
    useSpendingHistory,
    useTransferHistory,
    
    // Helper functions
    canSpend,
    canTransfer,
    getStatusProgress,
    formatPoints,
    
    // Quick access to common values
    totalBalance: breakdown?.wallet.total_balance || 0,
    earnedPoints: breakdown?.wallet.earned_points || 0,
    purchasedPoints: breakdown?.wallet.purchased_points || 0,
    statusPoints: breakdown?.wallet.status_points || 0,
    currentStatus: breakdown?.status.current || 'cadet',
    spendablePoints: breakdown?.spending_power.total_spendable || 0,
  };
}

// Re-export consolidated status utilities and formatter
import { getStatusInfo, getAllStatusInfo, STATUS_CONFIG, formatPoints } from '@/lib/points';

export { 
  getStatusInfo,
  getAllStatusInfo as getAllStatuses,
  STATUS_CONFIG as statusConfig 
};

// Utility hook for status information - now uses consolidated logic
export function useStatusInfo() {
  const getStatusInfoCallback = useCallback((status: string) => {
    return getStatusInfo(status as any);
  }, []);

  const getAllStatusesCallback = useCallback(() => {
    return getAllStatusInfo();
  }, []);

  return {
    getStatusInfo: getStatusInfoCallback,
    getAllStatuses: getAllStatusesCallback,
    statusConfig: STATUS_CONFIG,
  };
}
