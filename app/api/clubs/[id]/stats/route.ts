import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';
import { isAdmin } from '@/lib/security';
import { calculateCoverageRatio, getWeekStart } from '@/lib/points';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clubId = params.id;

    // Get club details to check ownership
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, owner_id, name')
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Get internal user to check ownership
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user owns the club or is admin
    const isClubOwner = club.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can view stats' },
        { status: 403 }
      );
    }

    // Get this week's stats
    const weekStart = getWeekStart();
    const { data: weeklyStats, error: weeklyError } = await supabase
      .from('weekly_upfront_stats')
      .select('*')
      .eq('club_id', clubId)
      .eq('week_start', weekStart)
      .single();

    // If no stats for this week, create empty stats
    const thisWeekStats = weeklyStats || {
      gross_cents: 0,
      platform_fee_cents: 0,
      reserve_delta_cents: 0,
      upfront_cents: 0,
    };

    // Get total outstanding points (optimized with database aggregation)
    const { data: pointsSum, error: walletsError } = await supabase
      .from('point_wallets')
      .select('sum:balance_pts.sum()')
      .eq('club_id', clubId)
      .single();

    if (walletsError) {
      throw walletsError;
    }

    const outstandingPoints = Number(pointsSum?.sum || 0);

    // Get total redemptions count
    const { count: totalRedemptions, error: redemptionsError } = await supabase
      .from('reward_redemptions')
      .select('*', { head: true, count: 'exact' })
      .eq('club_id', clubId);

    if (redemptionsError) {
      throw redemptionsError;
    }

    // Get active rewards count
    const { count: activeRewards, error: rewardsError } = await supabase
      .from('rewards')
      .select('*', { head: true, count: 'exact' })
      .eq('club_id', clubId)
      .eq('status', 'active');

    if (rewardsError) {
      throw rewardsError;
    }

    // Get total members (point wallet holders)
    const { count: totalMembers, error: membersError } = await supabase
      .from('point_wallets')
      .select('*', { head: true, count: 'exact' })
      .eq('club_id', clubId);

    if (membersError) {
      throw membersError;
    }

    // Calculate coverage ratio
    const coverageRatio = await calculateCoverageRatio(clubId);

    // Get recent transactions (last 10)
    const { data: recentTransactions, error: transactionsError } = await supabase
      .from('point_transactions')
      .select(`
        *,
        point_wallets!inner (
          club_id
        )
      `)
      .eq('point_wallets.club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (transactionsError) {
      console.error('Error fetching transactions:', transactionsError);
    }

    return NextResponse.json({
      club: {
        id: club.id,
        name: club.name,
      },
      this_week_stats: {
        gross_cents: thisWeekStats.gross_cents,
        platform_fee_cents: thisWeekStats.platform_fee_cents,
        reserve_delta_cents: thisWeekStats.reserve_delta_cents,
        upfront_cents: thisWeekStats.upfront_cents,
        week_start: weekStart,
      },
      totals: {
        outstanding_points: outstandingPoints,
        total_redemptions: totalRedemptions || 0,
        active_rewards: activeRewards || 0,
        total_members: totalMembers || 0,
      },
      financial: {
        coverage_ratio: coverageRatio,
        // For MVP, reserve target equals simulated NAV (corrected math: subtract both fees and reserves)
        simulated_nav_cents: Math.ceil(outstandingPoints * 0.6 * (1 - 0.15 - 0.10)), // Using default settle rate with proper deductions
        modeled_liability_cents: Math.ceil(outstandingPoints * 0.6 * (1 - 0.15 - 0.10)),
      },
      recent_activity: recentTransactions || [],
    });

  } catch (error) {
    console.error('Error fetching club stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch club stats' },
      { status: 500 }
    );
  }
}
