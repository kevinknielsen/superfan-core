import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useUnifiedAuth } from '@/lib/unified-auth-context';

export interface ClubWithOptionalMembership {
  id: string;
  name: string;
  description?: string;
  city?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  membership?: {
    id: string;
    current_status: string;
    points: number;
    join_date: string;
    last_activity_at: string;
    points_breakdown?: {
      total_balance: number;
      earned_points: number;
      purchased_points: number;
      status_points: number;
      current_status: string;
      next_status: string | null;
      progress_to_next: number;
    };
  };
}

export interface DashboardData {
  user: {
    id: string;
    privy_id: string;
  };
  clubs: ClubWithOptionalMembership[];
}

/**
 * Optimized hook that fetches all dashboard data in a single API call
 * Replaces separate useClubs() + useUserClubMemberships() + individual points calls
 */
export function useDashboardData() {
  const { user } = useUnifiedAuth();
  const { getAccessToken } = usePrivy();
  const userKey = user?.id ?? 'anon';
  
  return useQuery({
    queryKey: ['dashboard-data', userKey],
    queryFn: async ({ signal }): Promise<DashboardData> => {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/dashboard', {
        signal,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch dashboard data`);
      }

      return response.json();
    },
    staleTime: 30000, // 30 seconds - good balance for dashboard data
    gcTime: 300000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false, // Avoid unnecessary refetches
  });
}

/**
 * Helper hook to get filtered clubs for the dashboard
 * Derived from the unified dashboard data
 */
export function useFilteredDashboardClubs(searchQuery: string = '') {
  const { data: dashboardData, ...queryState } = useDashboardData();

  const filteredData = React.useMemo(() => {
    if (!dashboardData) {
      return {
        userClubs: [],
        discoverClubs: [],
      };
    }

    // Split clubs into user clubs (with membership) and discover clubs (without membership)
    const userClubs = dashboardData.clubs
      .filter(club => club.membership)
      .sort((a, b) => {
        const activityA = a.membership?.last_activity_at || a.created_at;
        const activityB = b.membership?.last_activity_at || b.created_at;
        const tA = Date.parse(activityA) || 0;
        const tB = Date.parse(activityB) || 0;
        return tB - tA;
      });

    const discoverClubs = dashboardData.clubs
      .filter(club => !club.membership)
      .filter(club => {
        if (!searchQuery) return true;
        
        const query = searchQuery.toLowerCase();
        return (
          club.name.toLowerCase().includes(query) ||
          (club.description || '').toLowerCase().includes(query) ||
          (club.city || '').toLowerCase().includes(query)
        );
      });

    return {
      userClubs,
      discoverClubs,
    };
  }, [dashboardData, searchQuery]);

  return {
    ...filteredData,
    isLoading: queryState.isLoading,
    error: queryState.error,
    refetch: queryState.refetch,
  };
}

// Re-export for backwards compatibility if needed
export { useDashboardData as useOptimizedDashboard };
