import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';

interface SyncUserParams {
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
}

/**
 * Hook to sync user data from Privy to Supabase
 * Call this after successful Privy authentication to ensure user exists in our database
 */
export function useUserSync() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SyncUserParams) => {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch('/api/users/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to sync user' }));
        throw new Error(error.error || 'Failed to sync user');
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log('[User Sync Hook] User synced successfully:', data.user?.id);
      // Invalidate any user-related queries to refetch with updated data
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
    onError: (error) => {
      console.error('[User Sync Hook] Failed to sync user:', error);
    },
  });
}
