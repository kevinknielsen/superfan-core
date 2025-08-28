import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generatePurchaseBundles } from '@/lib/points';

export interface PointWallet {
  id: string;
  club_id: string;
  balance_pts: number;
  last_activity_at: string;
  clubs: {
    id: string;
    name: string;
    city?: string;
    image_url?: string;
  };
  recent_transactions: Array<{
    id: string;
    type: 'PURCHASE' | 'BONUS' | 'SPEND' | 'REFUND';
    pts: number;
    created_at: string;
    usd_gross_cents?: number;
  }>;
}

export interface Reward {
  id: string;
  club_id: string;
  kind: 'ACCESS' | 'PRESALE_LOCK' | 'VARIANT';
  title: string;
  description?: string;
  points_price: number;
  inventory?: number;
  window_start?: string;
  window_end?: string;
  settle_mode: 'ZERO' | 'PRR';
  status: 'active' | 'inactive';
  available: boolean;
  availability_reason: string;
  is_timed: boolean;
  window_active: boolean;
}

export interface RewardsResponse {
  community: {
    id: string;
    name: string;
    city?: string;
    image_url?: string;
  };
  rewards: Reward[];
  total_count: number;
  available_count: number;
}

export interface Community {
  id: string;
  name: string;
  city?: string;
  image_url?: string;
  point_sell_cents: number;
  point_settle_cents: number;
}

// Hook to fetch user's point wallets
export function usePointWallets() {
  return useQuery({
    queryKey: ['point-wallets'],
    queryFn: async (): Promise<{ wallets: PointWallet[] }> => {
      const response = await fetch('/api/points/wallets');
      if (!response.ok) {
        throw new Error('Failed to fetch wallets');
      }
      return response.json();
    },
  });
}

// Hook to get wallet for specific club
export function useClubPointWallet(clubId: string) {
  const { data, ...rest } = usePointWallets();
  const wallet = data?.wallets.find(w => w.club_id === clubId);
  
  return {
    data: wallet,
    ...rest
  };
}

// Hook to fetch rewards for a club
export function useClubRewards(clubId: string) {
  return useQuery({
    queryKey: ['rewards', clubId],
    queryFn: async (): Promise<RewardsResponse> => {
      const response = await fetch(`/api/rewards?communityId=${clubId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch rewards');
      }
      return response.json();
    },
    enabled: !!clubId,
  });
}

// Hook to fetch community details (for pricing)
export function useCommunity(clubId: string) {
  return useQuery({
    queryKey: ['community', clubId],
    queryFn: async (): Promise<Community> => {
      const response = await fetch(`/api/clubs/${clubId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch community');
      }
      return response.json();
    },
    enabled: !!clubId,
  });
}

// Hook to purchase points
export function usePurchasePoints() {
  return useMutation({
    mutationFn: async ({ 
      communityId, 
      bundleId 
    }: { 
      communityId: string; 
      bundleId: string;
    }) => {
      const response = await fetch('/api/points/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          bundleId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create purchase session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Open Stripe checkout in new tab
      window.open(data.url, '_blank', 'noopener,noreferrer');
    },
  });
}

// Hook to redeem rewards
export function useRedeemReward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rewardId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to redeem reward');
      }

      return response.json();
    },
    onSuccess: (data, rewardId) => {
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['point-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['rewards'] });
      
      return data;
    },
  });
}

// Utility function to get purchase bundles for a club
export function useClubPurchaseBundles(clubId: string) {
  const { data: community } = useCommunity(clubId);
  
  if (!community) return [];
  
  return generatePurchaseBundles(community.point_sell_cents);
}
