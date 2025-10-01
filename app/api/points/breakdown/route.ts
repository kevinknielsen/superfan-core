import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { STATUS_THRESHOLDS, STATUS_ORDER, computeStatus, getNextStatus as computeNext, calculateStatusProgress, calculateSpendingPower } from '@/lib/points';

// Helper function to get tiers that are higher than the given tier
function getHigherTiers(currentTier: string): string[] {
  const currentIndex = STATUS_ORDER.indexOf(currentTier as any);
  if (currentIndex === -1) return [];
  return STATUS_ORDER.slice(currentIndex + 1);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get('clubId');

    if (!clubId) {
      return NextResponse.json({ error: 'clubId required' }, { status: 400 });
    }

    // Single query to get user ID and wallet data using a JOIN
    // Query by privy_id OR farcaster_id depending on auth type
    // Whitelist column names for security
    const userIdColumn = auth.type === 'farcaster' ? 'users.farcaster_id' : 'users.privy_id';
    if (!['users.farcaster_id', 'users.privy_id'].includes(userIdColumn)) {
      return NextResponse.json({ error: 'Invalid auth type' }, { status: 400 });
    }
    
    const { data: walletData, error: walletError } = await supabase
      .from('v_point_wallets')
      .select(`
        *,
        users!inner (
          id
        )
      `)
      .eq(userIdColumn, auth.userId)
      .eq('club_id', clubId)
      .single();

    const user = walletData?.users;
    const walletView = walletData;

    // If wallet doesn't exist, we need to get user ID separately and check membership
    if (walletError || !walletView || !user) {
      // Get user ID separately if not available from JOIN
      let userId = user?.id;
      if (!userId) {
        // Query by privy_id OR farcaster_id depending on auth type
        // Whitelist column names for security
        const userIdColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
        if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
          return NextResponse.json({ error: 'Invalid auth type' }, { status: 400 });
        }
        
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq(userIdColumn, auth.userId)
          .single();

        if (userError || !userData) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        userId = userData.id;
      }
      
      // Check if the user has a club membership first
      const { data: membership } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('club_id', clubId)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'User is not a member of this club' }, { status: 404 });
      }

      // Get effective tier considering temporary boosts (even for users without wallets)
      const { data: tierData, error: tierError } = await supabase
        .rpc('check_tier_qualification', {
          p_user_id: userId,
          p_club_id: clubId,
          p_target_tier: 'superfan', // Check highest tier to get all info
          p_rolling_window_days: 60
        });

      let current, next, currentThreshold, nextThreshold, pointsToNext, progressPercentage;
      let effectiveStatusPoints;

      if (tierError || !tierData || tierData.length === 0) {
        // Fallback to basic status calculation
        current = computeStatus(0);
        next = computeNext(current);
        currentThreshold = STATUS_THRESHOLDS[current];
        nextThreshold = next ? STATUS_THRESHOLDS[next] : null;
        pointsToNext = nextThreshold ? nextThreshold - 0 : null;
        progressPercentage = 0;
        effectiveStatusPoints = 0;
      } else {
        // Use effective tier from database (considers temporary boosts)
        const tierInfo = tierData[0];
        current = tierInfo.effective_tier;
        next = computeNext(current); // Calculate next tier since DB function doesn't provide it
        currentThreshold = STATUS_THRESHOLDS[current as keyof typeof STATUS_THRESHOLDS];
        nextThreshold = next ? STATUS_THRESHOLDS[next] : null;
        
        // Calculate effective status points and points to next
        effectiveStatusPoints = tierInfo.has_active_boost 
          ? STATUS_THRESHOLDS[current as keyof typeof STATUS_THRESHOLDS] // Show the threshold points for the boosted tier
          : 0; // Show 0 when no wallet and no boost
        
        pointsToNext = nextThreshold ? nextThreshold - effectiveStatusPoints : null;
        progressPercentage = nextThreshold ? Math.min(100, Math.max(0, ((effectiveStatusPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100)) : 100;
      }

      // Check if there are any available rewards in higher tiers
      // If no rewards available in higher tiers, show "Maximum Status!"
      let hasRewardsInHigherTiers = false;
      if (next) {
        const higherTiers = getHigherTiers(next);
        if (higherTiers.length > 0) {
          const { data: higherTierRewards, error: rewardsError } = await supabase
            .from('tier_rewards')
            .select('tier')
            .eq('club_id', clubId)
            .eq('is_active', true)
            .in('tier', higherTiers); // Use correct tier hierarchy
        
          if (!rewardsError && higherTierRewards && higherTierRewards.length > 0) {
            hasRewardsInHigherTiers = true;
          }
        }
      }

      // Override next status if no rewards available in higher tiers
      if (!hasRewardsInHigherTiers) {
        next = null;
        nextThreshold = null;
        pointsToNext = null;
        progressPercentage = 100;
      }


      const response = {
        wallet: {
          id: null,
          total_balance: 0,
          earned_points: 0,
          purchased_points: 0,
          spent_points: 0,
          escrowed_points: 0,
          status_points: effectiveStatusPoints,
          last_activity: null,
          created_at: null
        },
        status: {
          current,
          current_threshold: currentThreshold,
          next_status: next,
          next_threshold: nextThreshold,
          progress_to_next: nextThreshold ? 0 : 100,
          points_to_next: pointsToNext
        },
        spending_power: {
          total_spendable: 0,
          purchased_available: 0,
          earned_available: 0,
          earned_locked_for_status: 0,
          escrowed: 0
        },
        transaction_breakdown: {},
        recent_activity: [],
        club_membership: {
          join_date: membership.join_date,
          total_points_in_club: membership.points || 0
        }
      };
      
      return NextResponse.json(response);
    }

    // Get membership and recent transactions in parallel for better performance
    const [membershipResult, transactionsResult] = await Promise.all([
      supabase
        .from('club_memberships')
        .select('current_status, points, join_date')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single(),
      supabase
        .from('point_transactions')
        .select('id, type, pts, source, created_at')
        .eq('wallet_id', walletView.id)
        .order('created_at', { ascending: false })
        .limit(3)
    ]);

    const { data: membership, error: membershipError } = membershipResult;
    const { data: recentTransactions, error: recentError } = transactionsResult;

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('Membership fetch error:', membershipError);
    }

    if (recentError) {
      console.error('Error fetching recent transactions:', recentError);
    }

    // Get effective tier considering temporary boosts
    let current, next, currentThreshold, nextThreshold, pointsToNext, progressPercentage;
    let effectiveStatusPoints;
    
    const { data: tierData, error: tierError } = await supabase
      .rpc('check_tier_qualification', {
        p_user_id: user.id,
        p_club_id: clubId,
        p_target_tier: 'superfan', // Check highest tier to get all info
        p_rolling_window_days: 60
      });

    if (tierError || !tierData || tierData.length === 0) {
      // Fallback to status_pts calculation
      const statusPoints = walletView.status_pts || 0;
      const result = calculateStatusProgress(statusPoints);
      current = result.current;
      next = result.next;
      currentThreshold = result.currentThreshold;
      nextThreshold = result.nextThreshold;
      pointsToNext = result.pointsToNext;
      progressPercentage = result.progressPercentage;
      effectiveStatusPoints = statusPoints;
    } else {
      // Use effective tier from database (considers temporary boosts)
      const tierInfo = tierData[0]; // Get first row
      const effectiveTier = tierInfo.effective_tier;
      current = effectiveTier;
      next = computeNext(current);
      currentThreshold = STATUS_THRESHOLDS[current as keyof typeof STATUS_THRESHOLDS];
      nextThreshold = next ? STATUS_THRESHOLDS[next as keyof typeof STATUS_THRESHOLDS] : null;
      // Calculate effective status points first
      effectiveStatusPoints = tierData && tierData.length > 0 && tierData[0].has_active_boost 
        ? STATUS_THRESHOLDS[current as keyof typeof STATUS_THRESHOLDS] // Show the threshold points for the boosted tier
        : (walletView.status_pts || 0); // Show actual earned points when not boosted
      
      pointsToNext = nextThreshold ? nextThreshold - effectiveStatusPoints : 0;
      progressPercentage = nextThreshold ? Math.min(100, Math.max(0, ((effectiveStatusPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100)) : 100;
    }


    // Check if there are any available rewards in higher tiers
    // If no rewards available in higher tiers, show "Maximum Status!"
    let hasRewardsInHigherTiers = false;
    if (next) {
      const higherTiers = getHigherTiers(next);
      if (higherTiers.length > 0) {
        const { data: higherTierRewards, error: rewardsError } = await supabase
          .from('tier_rewards')
          .select('tier')
          .eq('club_id', clubId)
          .eq('is_active', true)
          .in('tier', higherTiers); // Use correct tier hierarchy
        
        if (!rewardsError && higherTierRewards && higherTierRewards.length > 0) {
          hasRewardsInHigherTiers = true;
        }
      }
    }

    // Override next status if no rewards available in higher tiers
    if (!hasRewardsInHigherTiers) {
      next = null;
      nextThreshold = null;
      pointsToNext = null;
      progressPercentage = 100;
    }

    // Calculate spending power breakdown using shared helper
    const earned = walletView.earned_pts || 0;
    const escrowed = walletView.escrowed_pts || 0;
    const purchased = walletView.purchased_pts || 0;
    
    const spendingPowerData = calculateSpendingPower(
      earned,
      purchased,
      escrowed,
      current,
      true // preserveStatus = true for status protection
    );

    // Simplified transaction breakdown (empty for performance)
    const processedBreakdown: Record<string, number> = {};

    return NextResponse.json({
      wallet: {
        id: walletView.id,
        total_balance: walletView.balance_pts,
        earned_points: walletView.earned_pts,
        purchased_points: walletView.purchased_pts,
        spent_points: walletView.spent_pts,
        escrowed_points: walletView.escrowed_pts || 0,
        status_points: effectiveStatusPoints,
        last_activity: walletView.last_activity_at,
        created_at: walletView.created_at
      },
      status: {
        current,
        current_threshold: currentThreshold,
        next_status: next,
        next_threshold: nextThreshold,
        progress_to_next: progressPercentage,
        points_to_next: pointsToNext
      },
      spending_power: {
        total_spendable: spendingPowerData.totalSpendable,
        purchased_available: spendingPowerData.purchasedAvailable,
        earned_available: spendingPowerData.earnedAvailable,
        earned_locked_for_status: spendingPowerData.earnedLockedForStatus,
        escrowed: spendingPowerData.escrowed,
      },
      transaction_breakdown: processedBreakdown,
      recent_activity: recentTransactions || [],
      club_membership: {
        join_date: membership?.join_date,
        total_points_in_club: membership?.points || 0
      }
    });

  } catch (error) {
    console.error('Error fetching points breakdown:', error);
    return NextResponse.json({ error: 'Failed to fetch points breakdown' }, { status: 500 });
  }
}
