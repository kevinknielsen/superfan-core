import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TapIn, TapInSource, ClubMembership } from '@/types/club.types';
import { calculateTapInPoints, calculateStatus } from '@/types/club.types';

// Get user's tap-in history for a club
export function useUserTapIns(privyUserId: string | null, clubId: string | null, limit = 50) {
  return useQuery({
    queryKey: ['user-tap-ins', privyUserId, clubId, limit],
    queryFn: async (): Promise<TapIn[]> => {
      if (!privyUserId || !clubId) return [];

      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyUserId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return []; // User not found
        throw userError;
      }

      const { data, error } = await supabase
        .from('tap_ins')
        .select('*')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
    enabled: !!privyUserId && !!clubId,
  });
}

// Get tap-in statistics for a user in a club
export function useUserTapInStats(privyUserId: string | null, clubId: string | null) {
  return useQuery({
    queryKey: ['user-tap-in-stats', privyUserId, clubId],
    queryFn: async () => {
      if (!privyUserId || !clubId) return null;

      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyUserId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return null; // User not found
        throw userError;
      }

      // Get aggregated tap-in data
      const { data, error } = await supabase
        .from('tap_ins')
        .select('source, points_earned, created_at')
        .eq('user_id', user.id)
        .eq('club_id', clubId);

      if (error) throw error;

      const stats = {
        total_tap_ins: data?.length || 0,
        total_points_earned: data?.reduce((sum, t) => sum + t.points_earned, 0) || 0,
        sources: {} as Record<TapInSource, number>,
        recent_activity: data?.slice(0, 5) || [],
        this_week: 0,
        this_month: 0,
      };

      // Calculate source breakdown and time-based stats
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      data?.forEach((tapIn) => {
        const source = tapIn.source as TapInSource;
        stats.sources[source] = (stats.sources[source] || 0) + 1;

        const tapInDate = new Date(tapIn.created_at);
        if (tapInDate > weekAgo) stats.this_week++;
        if (tapInDate > monthAgo) stats.this_month++;
      });

      return stats;
    },
    enabled: !!privyUserId && !!clubId,
  });
}

// Record a tap-in and update user's points/status
export function useTapIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      privyUserId,
      clubId,
      source,
      location,
      metadata = {},
    }: {
      privyUserId: string;
      clubId: string;
      source: TapInSource;
      location?: string;
      metadata?: Record<string, any>;
    }) => {
      // First get the user from our database
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyUserId)
        .single();

      if (userError) throw userError;

      // Calculate points for this tap-in
      const pointsEarned = calculateTapInPoints(source, metadata);

      // Start a transaction to record tap-in and update membership
      const { data: tapIn, error: tapInError } = await supabase
        .from('tap_ins')
        .insert({
          user_id: user.id,
          club_id: clubId,
          source,
          points_earned: pointsEarned,
          location,
          metadata,
        })
        .select()
        .single();

      if (tapInError) throw tapInError;

      // Get current membership
      const { data: membership, error: membershipError } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();

      if (membershipError) throw membershipError;

      // Calculate new points and status
      const newPoints = membership.points + pointsEarned;
      const newStatus = calculateStatus(newPoints);

      // Update membership with new points and status
      const { data: updatedMembership, error: updateError } = await supabase
        .from('club_memberships')
        .update({
          points: newPoints,
          current_status: newStatus,
          last_activity_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Record in points ledger
      await supabase
        .from('points_ledger')
        .insert({
          user_id: user.id,
          club_id: clubId,
          delta: pointsEarned,
          reason: 'tap_in',
          reference_id: tapIn.id,
        });

      return {
        tapIn,
        membership: updatedMembership,
        pointsEarned,
        statusChange: newStatus !== membership.current_status ? {
          from: membership.current_status,
          to: newStatus,
        } : null,
      };
    },
    onSuccess: (_, { privyUserId, clubId }) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['user-tap-ins', privyUserId, clubId] });
      queryClient.invalidateQueries({ queryKey: ['user-tap-in-stats', privyUserId, clubId] });
      queryClient.invalidateQueries({ queryKey: ['user-club-membership', privyUserId, clubId] });
      queryClient.invalidateQueries({ queryKey: ['user-club-data', privyUserId, clubId] });
      queryClient.invalidateQueries({ queryKey: ['user-club-memberships', privyUserId] });
    },
  });
}

// Generate a tap-in link (for QR codes or direct links)
export function useGenerateTapInLink() {
  return useMutation({
    mutationFn: async ({
      clubId,
      source,
      location,
      metadata = {},
    }: {
      clubId: string;
      source: TapInSource;
      location?: string;
      metadata?: Record<string, any>;
    }) => {
      // Generate a secure tap-in token/link
      const tapInData = {
        clubId,
        source,
        location,
        metadata,
        timestamp: Date.now(),
      };

      // In a real implementation, you might encrypt this or store it with an expiry
      const encodedData = btoa(JSON.stringify(tapInData));
      const baseUrl = window.location.origin;
      
      return `${baseUrl}/tap-in?data=${encodedData}`;
    },
  });
}

// Process a tap-in from a link/QR code
export function useProcessTapInLink() {
  const tapInMutation = useTapIn();

  return useMutation({
    mutationFn: async ({
      privyUserId,
      encodedData,
    }: {
      privyUserId: string;
      encodedData: string;
    }) => {
      try {
        const tapInData = JSON.parse(atob(encodedData));
        
        // Validate the data (check timestamp, ensure it's not too old)
        const now = Date.now();
        const linkAge = now - tapInData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (linkAge > maxAge) {
          throw new Error('Tap-in link has expired');
        }

        // Process the tap-in
        return await tapInMutation.mutateAsync({
          privyUserId,
          clubId: tapInData.clubId,
          source: tapInData.source,
          location: tapInData.location,
          metadata: tapInData.metadata,
        });
      } catch (error) {
        throw new Error('Invalid tap-in link');
      }
    },
  });
}
