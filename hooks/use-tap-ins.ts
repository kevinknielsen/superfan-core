import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUnifiedAuth } from '@/lib/unified-auth-context';

export interface TapIn {
  id: string;
  user_id: string;
  club_id: string;
  source: string;
  points_earned: number;
  location?: string;
  metadata: any;
  created_at: string;
}

export interface TapInResponse {
  success: boolean;
  tap_in: TapIn;
  points_earned: number;
  total_points: number;
  current_status: string;
  previous_status: string;
  status_changed: boolean;
  club_name: string;
  membership: any;
}

export interface TapInRequest {
  club_id: string;
  source: string;
  location?: string;
  points_earned?: number;
  metadata?: any;
}

// Get tap-in history for a user/club
export function useTapIns(clubId: string | null, limit: number = 10) {
  return useQuery({
    queryKey: ['tap-ins', clubId, limit],
    queryFn: async (): Promise<TapIn[]> => {
      if (!clubId) return [];

      const params = new URLSearchParams({
        club_id: clubId,
        limit: limit.toString(),
      });

      const response = await fetch(`/api/tap-in?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tap-ins');
      }

      return response.json();
    },
    enabled: !!clubId,
  });
}

// Create a new tap-in
export function useTapIn() {
  const queryClient = useQueryClient();
  const { user } = useUnifiedAuth();

  return useMutation({
    mutationFn: async (tapInData: TapInRequest): Promise<TapInResponse> => {
      const response = await fetch('/api/tap-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tapInData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create tap-in');
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['tap-ins', variables.club_id] });
      queryClient.invalidateQueries({ queryKey: ['user-club-membership', user?.id, variables.club_id] });
      queryClient.invalidateQueries({ queryKey: ['user-club-memberships', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-club-data', user?.id, variables.club_id] });
    },
  });
}

// Quick tap-in actions for common scenarios
export function useQuickTapIn() {
  const tapInMutation = useTapIn();

  const showEntry = (clubId: string, location?: string) => {
    return tapInMutation.mutateAsync({
      club_id: clubId,
      source: 'show_entry',
      location,
      metadata: { quick_action: 'show_entry' }
    });
  };

  const merchPurchase = (clubId: string, location?: string) => {
    return tapInMutation.mutateAsync({
      club_id: clubId,
      source: 'merch_purchase',
      location,
      metadata: { quick_action: 'merch_purchase' }
    });
  };

  const qrScan = (clubId: string, source: string, location?: string, metadata?: any) => {
    return tapInMutation.mutateAsync({
      club_id: clubId,
      source,
      location,
      metadata: { quick_action: 'qr_scan', ...metadata }
    });
  };

  const linkTap = (clubId: string, source: string = 'link') => {
    return tapInMutation.mutateAsync({
      club_id: clubId,
      source,
      metadata: { quick_action: 'link_tap' }
    });
  };

  return {
    showEntry,
    merchPurchase,
    qrScan,
    linkTap,
    isLoading: tapInMutation.isPending,
    error: tapInMutation.error,
  };
}

// Get tap-in analytics for a club (admin use)
export function useTapInAnalytics(clubId: string | null) {
  return useQuery({
    queryKey: ['tap-in-analytics', clubId],
    queryFn: async () => {
      if (!clubId) return null;

      // This would be implemented when we add analytics endpoints
      // For now, return placeholder data
      return {
        total_tap_ins: 0,
        points_distributed: 0,
        top_sources: [],
        recent_activity: [],
      };
    },
    enabled: !!clubId,
  });
}

// Point values for different tap-in sources (matches API)
export const POINT_VALUES = {
  qr_code: 20,
  nfc: 20,
  link: 10,
  show_entry: 100,
  merch_purchase: 50,
  presave: 40,
  default: 10
} as const;

// Helper to get point value for a source
export function getPointValue(source: string): number {
  return POINT_VALUES[source as keyof typeof POINT_VALUES] || POINT_VALUES.default;
}