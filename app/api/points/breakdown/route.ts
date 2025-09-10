import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { STATUS_THRESHOLDS, computeStatus, getNextStatus as computeNext, calculateStatusProgress, calculateSpendingPower } from '@/lib/points';

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
    const { data: walletData, error: walletError } = await supabase
      .from('v_point_wallets')
      .select(`
        *,
        users!inner (
          id
        )
      `)
      .eq('users.privy_id', auth.userId)
      .eq('club_id', clubId)
      .single();

    const user = walletData?.users;
    const walletView = walletData;

    // If wallet doesn't exist, we need to get user ID separately and check membership
    if (walletError || !walletView || !user) {
      console.log('Wallet not found, checking if user needs wallet creation:', { error: walletError?.message });
      
      // Get user ID separately if not available from JOIN
      let userId = user?.id;
      if (!userId) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('privy_id', auth.userId)
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

      // Return empty wallet state for new members
      const current = computeStatus(0);
      const next = computeNext(current);
      const currentThreshold = STATUS_THRESHOLDS[current];
      const nextThreshold = next ? STATUS_THRESHOLDS[next] : null;

      return NextResponse.json({
        wallet: {
          id: null,
          total_balance: 0,
          earned_points: 0,
          purchased_points: 0,
          spent_points: 0,
          escrowed_points: 0,
          status_points: 0,
          last_activity: null,
          created_at: null
        },
        status: {
          current,
          current_threshold: currentThreshold,
          next_status: next,
          next_threshold: nextThreshold,
          progress_to_next: nextThreshold ? 0 : 100,
          points_to_next: nextThreshold ? nextThreshold - 0 : 0
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
      });
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

    // Compute status and thresholds from status_pts using shared helpers
    const statusPoints = walletView.status_pts || 0; // Points that count toward status
    const { current, next, currentThreshold, nextThreshold, pointsToNext, progressPercentage } = 
      calculateStatusProgress(statusPoints);

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
        status_points: statusPoints,
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
