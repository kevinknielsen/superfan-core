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

    // Get global points breakdown across all clubs using the same view as breakdown API
    const { data: globalData, error: globalError } = await supabase
      .from('v_point_wallets')
      .select(`
        balance_pts,
        earned_pts,
        purchased_pts,
        spent_pts,
        escrowed_pts,
        status_pts,
        club_id,
        clubs!inner(name, is_active)
      `)
      .eq('user_id', user.id)
      .eq('clubs.is_active', true); // Only active clubs

    if (globalError) {
      console.error('Global points query error:', globalError);
      console.error('Error details:', {
        message: globalError.message,
        details: globalError.details,
        hint: globalError.hint,
        code: globalError.code
      });
      throw globalError;
    }

    // Debug logging for admin users
    console.log(`[Global Balance] User ${user.id} query results:`, {
      walletCount: (globalData || []).length,
      wallets: globalData?.map(w => ({
        club_id: w.club_id,
        club_name: w.clubs?.name,
        balance_pts: w.balance_pts,
        earned_pts: w.earned_pts
      }))
    });
    
    if ((globalData || []).length === 0) {
      console.log('[Global Balance] No point wallets found - checking if user has memberships...');
      
      // Check if user has club memberships without wallets
      const { data: memberships } = await supabase
        .from('club_memberships')
        .select('club_id, clubs!inner(name)')
        .eq('user_id', user.id);
        
      console.log('[Global Balance] User memberships:', memberships?.length || 0);
    }

    // Calculate totals
    const totals = (globalData || []).reduce((acc, wallet: any) => {
      const balance = wallet.balance_pts ?? 0;
      const earned = wallet.earned_pts ?? 0;
      const purchased = wallet.purchased_pts ?? 0;
      const spent = wallet.spent_pts ?? 0;
      const escrowed = wallet.escrowed_pts ?? 0;
      return {
        total_balance: acc.total_balance + balance,
        total_earned: acc.total_earned + earned,
        total_purchased: acc.total_purchased + purchased,
        total_spent: acc.total_spent + spent,
        total_escrowed: acc.total_escrowed + escrowed,
      };
    }, {
      total_balance: 0,
      total_earned: 0,
      total_purchased: 0,
      total_spent: 0,
      total_escrowed: 0,
    });

    // Get club breakdown
    const club_breakdown = (globalData || []).map((wallet: any) => ({
      club_id: wallet.club_id,
      club_name: wallet.clubs?.name || 'Unknown Club',
      balance_pts: wallet.balance_pts ?? 0,
      earned_pts: wallet.earned_pts ?? 0,
      purchased_pts: wallet.purchased_pts ?? 0,
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
