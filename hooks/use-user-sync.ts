import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useFarcaster } from '@/lib/farcaster-context';

interface SyncUserParams {
  // Privy user fields
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  
  // Farcaster user fields
  farcasterUsername?: string | null;
  farcasterDisplayName?: string | null;
  farcasterPfpUrl?: string | null;
}

/**
 * Hook to sync user data from Privy or Farcaster to Supabase
 * Call this after successful authentication to ensure user exists in our database
 * Supports both Privy (web) and Farcaster (wallet app) authentication
 */
export function useUserSync() {
  const { getAccessToken } = usePrivy();
  const { isInWalletApp, user: farcasterUser } = useFarcaster();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SyncUserParams) => {
      let headers: HeadersInit;
      
      if (isInWalletApp && farcasterUser) {
        // Farcaster authentication
        const fid = farcasterUser.fid;
        
        // Validate FID exists and is a valid numeric value
        if (fid == null || !Number.isFinite(fid) || !Number.isInteger(fid) || fid <= 0) {
          throw new Error(`Invalid Farcaster FID: expected positive integer, got ${fid} (type: ${typeof fid})`);
        }
        
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Farcaster farcaster:${fid}`,
        };
      } else {
        // Privy authentication
        const accessToken = await getAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token available');
        }
        
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        };
      }

      const response = await fetch('/api/users/sync', {
        method: 'POST',
        headers,
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
