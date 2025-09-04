import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's internal ID (handle both Privy and Farcaster users)
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get global points breakdown across all clubs
    const { data: globalData, error: globalError } = await supabase
      .from('point_wallets')
      .select(`
        balance_pts,
        earned_pts,
        purchased_pts,
        spent_pts,
        escrowed_pts,
        club_id,
        clubs!inner(name, is_active)
      `)
      .eq('user_id', user.id)
      .eq('clubs.is_active', true); // Only active clubs

    if (globalError) {
      throw globalError;
    }

    // Calculate totals
    const totals = (globalData || []).reduce((acc, wallet) => {
      return {
        total_balance: acc.total_balance + wallet.balance_pts,
        total_earned: acc.total_earned + wallet.earned_pts,
        total_purchased: acc.total_purchased + wallet.purchased_pts,
        total_spent: acc.total_spent + wallet.spent_pts,
        total_escrowed: acc.total_escrowed + wallet.escrowed_pts,
      };
    }, {
      total_balance: 0,
      total_earned: 0,
      total_purchased: 0,
      total_spent: 0,
      total_escrowed: 0,
    });

    // Get club breakdown
    const club_breakdown = (globalData || []).map(wallet => ({
      club_id: wallet.club_id,
      club_name: wallet.clubs.name,
      balance_pts: wallet.balance_pts,
      earned_pts: wallet.earned_pts,
      purchased_pts: wallet.purchased_pts,
    })).filter(club => club.balance_pts > 0); // Only show clubs with points

    // Calculate USD equivalent (unified peg: 100 points = $1)
    const total_usd_value = totals.total_balance / 100;

    return NextResponse.json({
      global_balance: {
        total_points: totals.total_balance,
        total_earned_points: totals.total_earned,
        total_purchased_points: totals.total_purchased,
        total_spent_points: totals.total_spent,
        total_escrowed_points: totals.total_escrowed,
        total_usd_value: parseFloat(total_usd_value.toFixed(2)),
        active_clubs_count: club_breakdown.length,
        total_clubs_with_points: club_breakdown.length,
      },
      club_breakdown,
      system_info: {
        peg_rate: 100, // 100 points = $1
        display_currency: 'USD',
        last_updated: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('Error fetching global points balance:', error);
    return NextResponse.json({ error: 'Failed to fetch global balance' }, { status: 500 });
  }
}
