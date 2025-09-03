import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

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

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get comprehensive wallet data using the computed view
    const { data: walletView, error: walletError } = await supabase
      .from('v_point_wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    // If wallet doesn't exist, create a default one or return empty state
    if (walletError || !walletView) {
      console.log('Wallet not found, checking if user needs wallet creation:', { userId: user.id, clubId, error: walletError?.message });
      
      // Check if the user has a club membership first
      const { data: membership } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'User is not a member of this club' }, { status: 404 });
      }

      // Return empty wallet state for new members
      return NextResponse.json({
        wallet: {
          id: 'temp',
          total_balance: 0,
          earned_points: 0,
          purchased_points: 0,
          spent_points: 0,
          escrowed_points: 0,
          status_points: 0,
          last_activity: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        status: {
          current: membership.current_status || 'cadet',
          current_threshold: 0,
          next_status: 'resident',
          next_threshold: 500,
          progress_to_next: 0,
          points_to_next: 500
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

    // Get membership status for context
    const { data: membership, error: membershipError } = await supabase
      .from('club_memberships')
      .select('current_status, points, join_date')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    // Get transaction breakdown by source
    const { data: transactionBreakdown, error: transactionError } = await supabase
      .from('point_transactions')
      .select('source, type, sum:pts.sum(), count:pts.count()')
      .eq('wallet_id', walletView.id)
      .not('source', 'is', null)
      .group('source, type')
      .order('source');

    if (transactionError) {
      console.error('Error fetching transaction breakdown:', transactionError);
    }

    // Get recent transactions for activity feed
    const { data: recentTransactions, error: recentError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('wallet_id', walletView.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('Error fetching recent transactions:', recentError);
    }

    // Calculate status thresholds and progress
    const statusThresholds = {
      cadet: 0,
      resident: 500,
      headliner: 1500,
      superfan: 4000
    };

    const currentStatus = membership?.current_status || 'cadet';
    const statusPoints = walletView.status_pts || 0; // Points that count toward status
    const currentThreshold = statusThresholds[currentStatus as keyof typeof statusThresholds];
    const nextStatus = currentStatus === 'superfan' ? null : 
      currentStatus === 'headliner' ? 'superfan' :
      currentStatus === 'resident' ? 'headliner' : 'resident';
    const nextThreshold = nextStatus ? statusThresholds[nextStatus as keyof typeof statusThresholds] : null;

    // Calculate spending power breakdown
    const spendingPower = {
      total_spendable: walletView.balance_pts,
      purchased_available: walletView.purchased_pts, // Always spendable
      earned_available: Math.max(0, walletView.earned_pts - currentThreshold), // Available above status threshold
      earned_locked_for_status: Math.min(walletView.earned_pts, currentThreshold), // Locked to maintain status
      escrowed: walletView.escrowed_pts || 0 // Committed to pre-orders
    };

    // Process transaction breakdown for easier consumption
    const processedBreakdown = (transactionBreakdown || []).reduce((acc: any, item: any) => {
      const key = `${item.source}_${item.type}`;
      acc[key] = {
        total_points: item.sum || 0,
        transaction_count: item.count || 0
      };
      return acc;
    }, {});

    return NextResponse.json({
      wallet: {
        id: walletView.id,
        total_balance: walletView.balance_pts,
        earned_points: walletView.earned_pts,
        purchased_points: walletView.purchased_pts,
        spent_points: walletView.spent_pts,
        escrowed_points: walletView.escrowed_pts || 0,
        status_points: statusPoints, // Points that count toward status (earned - escrowed)
        last_activity: walletView.last_activity_at,
        created_at: walletView.created_at
      },
      status: {
        current: currentStatus,
        current_threshold: currentThreshold,
        next_status: nextStatus,
        next_threshold: nextThreshold,
        progress_to_next: nextThreshold ? Math.min(100, (statusPoints / nextThreshold) * 100) : 100,
        points_to_next: nextThreshold ? Math.max(0, nextThreshold - statusPoints) : 0
      },
      spending_power: spendingPower,
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
