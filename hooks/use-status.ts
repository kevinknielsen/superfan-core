import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface StatusThreshold {
  id: string;
  status: string;
  min_points: number;
  created_at: string;
}

export interface UserStatus {
  currentPoints: number;
  statusName: string;
  pointsToNext: number | null;
  nextStatusName: string | null;
  progress: number; // 0-1 for progress bars
}

// Get all status thresholds
export function useStatusThresholds() {
  return useQuery({
    queryKey: ['status-thresholds'],
    queryFn: async (): Promise<StatusThreshold[]> => {
      const { data, error } = await supabase
        .from('status_thresholds')
        .select('*')
        .order('min_points');

      if (error) throw error;
      return data || [];
    },
  });
}

// Get user's current status by calculating points from tap-ins and points_ledger
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useUserStatus(userId: string | null) {
  const { data: thresholds } = useStatusThresholds();

  return useQuery({
    queryKey: ['user-status', userId],
    queryFn: async (): Promise<UserStatus | null> => {
      if (!userId || !thresholds) return null;

      // Determine if this is a Farcaster ID or Privy ID
      const isFarcaster = userId.startsWith('farcaster:');
      
      // Whitelist column names to prevent SQL injection
      const userIdColumn = isFarcaster ? 'farcaster_id' : 'privy_id';
      if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
        throw new Error('Invalid ID type');
      }

      // First get our internal user by auth ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq(userIdColumn, userId)
        .single();

      if (userError) {
        if (userError.code === 'PGRST116') return null; // User not found
        throw userError;
      }

      // Calculate current points from points_ledger
      const { data: pointsData, error: pointsError } = await supabase
        .from('points_ledger')
        .select('delta')
        .eq('user_id', user.id);

      if (pointsError) throw pointsError;

      // Sum up all point deltas
      const currentPoints = pointsData.reduce((sum, entry) => sum + entry.delta, 0);

      // Find current status and next status
      const sortedThresholds = [...thresholds].sort((a, b) => a.min_points - b.min_points);
      
      let currentStatus = sortedThresholds[0]; // Default to lowest status
      let nextStatus: StatusThreshold | null = null;

      for (let i = 0; i < sortedThresholds.length; i++) {
        if (currentPoints >= sortedThresholds[i].min_points) {
          currentStatus = sortedThresholds[i];
          nextStatus = sortedThresholds[i + 1] || null;
        } else {
          break;
        }
      }

      // Calculate progress to next status
      let progress = 0;
      let pointsToNext: number | null = null;

      if (nextStatus) {
        const pointsInCurrentTier = currentPoints - currentStatus.min_points;
        const pointsNeededForTier = nextStatus.min_points - currentStatus.min_points;
        progress = Math.min(pointsInCurrentTier / pointsNeededForTier, 1);
        pointsToNext = nextStatus.min_points - currentPoints;
      } else {
        // Already at max status
        progress = 1;
        pointsToNext = null;
      }

      return {
        currentPoints,
        statusName: currentStatus.status,
        pointsToNext,
        nextStatusName: nextStatus?.status || null,
        progress,
      };
    },
    enabled: !!userId && !!thresholds,
  });
}

// Check if user has minimum status for unlock
// Accepts either privy_id or farcaster_id (format: "farcaster:12345")
export function useStatusAccess(userId: string | null, requiredStatusName: string) {
  const { data: userStatus } = useUserStatus(userId);
  const { data: thresholds } = useStatusThresholds();
  
  const hasAccess = (() => {
    if (!userStatus || !thresholds) return false;
    
    const requiredThreshold = thresholds.find(t => t.status === requiredStatusName);
    if (!requiredThreshold) return false;
    
    return userStatus.currentPoints >= requiredThreshold.min_points;
  })();

  return {
    hasAccess,
    userStatus,
    currentPoints: userStatus?.currentPoints || 0,
    requiredPoints: thresholds?.find(t => t.status === requiredStatusName)?.min_points || 0,
  };
}
