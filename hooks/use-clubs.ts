import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Club, ClubMembership, ClubWithMembership, UserClubData } from '@/types/club.types';

// Get all clubs (for discovery)
export function useClubs() {
  return useQuery({
    queryKey: ['clubs'],
    queryFn: async (): Promise<Club[]> => {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

// Get a specific club with its unlocks
export function useClub(clubId: string | null) {
  return useQuery({
    queryKey: ['club', clubId],
    queryFn: async (): Promise<ClubWithMembership | null> => {
      if (!clubId) return null;

      const { data: club, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (clubError) throw clubError;

      // Get unlocks for this club
      const { data: unlocks, error: unlocksError } = await supabase
        .from('unlocks')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('min_status');

      if (unlocksError) throw unlocksError;

      return {
        ...club,
        unlocks: unlocks || [],
        unlock_count: unlocks?.length || 0,
      };
    },
    enabled: !!clubId,
  });
}

// Get user's club memberships
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useUserClubMemberships(userId: string | null) {
  return useQuery({
    queryKey: ['user-club-memberships', userId],
    queryFn: async (): Promise<ClubMembership[]> => {
      if (!userId) return [];

      // Determine if this is a Farcaster ID or Privy ID
      const isFarcaster = userId.startsWith('farcaster:');
      
      // Whitelist column names to prevent SQL injection
      const userIdColumn = isFarcaster ? 'farcaster_id' : 'privy_id';
      if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
        throw new Error('Invalid ID type');
      }

      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq(userIdColumn, userId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return []; // User not found
        throw userError;
      }

      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          club:clubs(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

// Get user's membership to a specific club
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useUserClubMembership(userId: string | null, clubId: string | null) {
  return useQuery({
    queryKey: ['user-club-membership', userId, clubId],
    queryFn: async (): Promise<ClubMembership | null> => {
      if (!userId || !clubId) return null;

      // Determine if this is a Farcaster ID or Privy ID
      const isFarcaster = userId.startsWith('farcaster:');
      
      // Whitelist column names to prevent SQL injection
      const userIdColumn = isFarcaster ? 'farcaster_id' : 'privy_id';
      if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
        throw new Error('Invalid ID type');
      }

      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq(userIdColumn, userId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return null; // User not found
        throw userError;
      }

      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          club:clubs(*)
        `)
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No membership found
        throw error;
      }
      return data;
    },
    enabled: !!userId && !!clubId,
  });
}

// Get complete user club data (membership + unlocks + recent activity)
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useUserClubData(userId: string | null, clubId: string | null) {
  return useQuery({
    queryKey: ['user-club-data', userId, clubId],
    queryFn: async (): Promise<UserClubData | null> => {
      if (!userId || !clubId) return null;

      // Determine if this is a Farcaster ID or Privy ID
      const isFarcaster = userId.startsWith('farcaster:');
      
      // Whitelist column names to prevent SQL injection
      const userIdColumn = isFarcaster ? 'farcaster_id' : 'privy_id';
      if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
        throw new Error('Invalid ID type');
      }

      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq(userIdColumn, userId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return null; // User not found
        throw userError;
      }

      // Get membership with club data
      const { data: membership, error: membershipError } = await supabase
        .from('club_memberships')
        .select(`
          *,
          club:clubs(*)
        `)
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();

      if (membershipError) {
        if (membershipError.code === 'PGRST116') return null; // No membership
        throw membershipError;
      }

      // Get unlocks for this club
      const { data: unlocks, error: unlocksError } = await supabase
        .from('unlocks')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('min_status');

      if (unlocksError) throw unlocksError;

      // Get recent tap-ins
      const { data: tapIns, error: tapInsError } = await supabase
        .from('tap_ins')
        .select('*')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (tapInsError) throw tapInsError;

      return {
        membership,
        club: membership.club,
        unlocks: unlocks || [],
        recent_tap_ins: tapIns || [],
        house_account: undefined, // House accounts removed in tier rewards system
      };
    },
    enabled: !!userId && !!clubId,
  });
}

// Join a club
export function useJoinClub() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clubId }: { clubId: string }) => {
      // Get authentication headers for unified auth
      const { getAuthHeaders } = await import('@/app/api/sdk');
      const authHeaders = await getAuthHeaders();
      
      // Use the authenticated API endpoint which handles user lookup/creation
      const response = await fetch(`/api/clubs/${clubId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to join club' }));
        throw new Error(errorData.error || 'Failed to join club');
      }

      return response.json();
    },
    onSuccess: (_, { clubId }) => {
      // Invalidate all club-related queries since we don't have privyUserId here
      queryClient.invalidateQueries({ queryKey: ['user-club-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['user-club-membership'] });
      queryClient.invalidateQueries({ queryKey: ['user-club-data'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
  });
}

// Check if user can access an unlock
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useCanAccessUnlock(userId: string | null, clubId: string | null, minStatus: string) {
  const { data: membership } = useUserClubMembership(userId, clubId);

  if (!membership) return false;

  const statusOrder = ['cadet', 'resident', 'headliner', 'superfan'];
  const userStatusIndex = statusOrder.indexOf(membership.current_status);
  const requiredStatusIndex = statusOrder.indexOf(minStatus);

  return userStatusIndex >= requiredStatusIndex;
}
