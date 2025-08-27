import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface StatusThreshold {
  id: string;
  name: string;
  points_required: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserStatus {
  currentPoints: number;
  statusName: string;
  statusDescription: string | null;
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
        .order('points_required');

      if (error) throw error;
      return data || [];
    },
  });
}

// Get user's current status by calculating points from tap-ins and points_ledger
export function useUserStatus(privyUserId: string | null) {
  const { data: thresholds } = useStatusThresholds();

  return useQuery({
    queryKey: ['user-status', privyUserId],
    queryFn: async (): Promise<UserStatus | null> => {
      if (!privyUserId || !thresholds) return null;

      // First get our internal user by Privy ID
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('privy_id', privyUserId)
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
      const sortedThresholds = [...thresholds].sort((a, b) => a.points_required - b.points_required);
      
      let currentStatus = sortedThresholds[0]; // Default to lowest status
      let nextStatus: StatusThreshold | null = null;

      for (let i = 0; i < sortedThresholds.length; i++) {
        if (currentPoints >= sortedThresholds[i].points_required) {
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
        const pointsInCurrentTier = currentPoints - currentStatus.points_required;
        const pointsNeededForTier = nextStatus.points_required - currentStatus.points_required;
        progress = Math.min(pointsInCurrentTier / pointsNeededForTier, 1);
        pointsToNext = nextStatus.points_required - currentPoints;
      } else {
        // Already at max status
        progress = 1;
        pointsToNext = null;
      }

      return {
        currentPoints,
        statusName: currentStatus.name,
        statusDescription: currentStatus.description,
        pointsToNext,
        nextStatusName: nextStatus?.name || null,
        progress,
      };
    },
    enabled: !!privyUserId && !!thresholds,
  });
}

// Check if user has minimum status for unlock
export function useStatusAccess(privyUserId: string | null, requiredStatusName: string) {
  const { data: userStatus } = useUserStatus(privyUserId);
  const { data: thresholds } = useStatusThresholds();
  
  const hasAccess = (() => {
    if (!userStatus || !thresholds) return false;
    
    const requiredThreshold = thresholds.find(t => t.name === requiredStatusName);
    if (!requiredThreshold) return false;
    
    return userStatus.currentPoints >= requiredThreshold.points_required;
  })();

  return {
    hasAccess,
    userStatus,
    currentPoints: userStatus?.currentPoints || 0,
    requiredPoints: thresholds?.find(t => t.name === requiredStatusName)?.points_required || 0,
  };
}
