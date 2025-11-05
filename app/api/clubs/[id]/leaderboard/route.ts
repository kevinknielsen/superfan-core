import { NextResponse } from "next/server";
import { supabase } from "@/app/api/supabase";

/**
 * GET /api/clubs/[id]/leaderboard
 * Get leaderboard for a club - only members who have made purchases, ordered by total invested amount
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: clubId } = await params;
    
    if (!clubId) {
      return NextResponse.json(
        { error: "Club ID is required" },
        { status: 400 }
      );
    }

    // Get active memberships for this club, ordered by points (descending)
    // Filter to only members who have made purchases (credit_purchases OR reward_claims)
    // Join with users table to get user names
    
    // First, get all memberships
    // Status points come from point_wallets.earned_pts, not club_memberships.points
    const { data: allMemberships, error: membershipsError } = await supabase
      .from('club_memberships')
      .select(`
        id,
        user_id,
        current_status,
        last_activity_at,
        join_date,
        created_at,
        user:users!club_memberships_user_id_fkey (
          id,
          name,
          email
        )
      `)
      .eq('club_id', clubId)
      .eq('status', 'active');

    if (membershipsError) {
      console.error('[Leaderboard] Error fetching memberships:', membershipsError);
      return NextResponse.json(
        { error: "Failed to fetch memberships" },
        { status: 500 }
      );
    }

    if (!allMemberships || allMemberships.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    // Get all user IDs who have made purchases (from credit_purchases or reward_claims)
    const userIds = allMemberships.map(m => m.user_id);
    
    // Get status points from point_wallets for these users
    // Status points = earned_pts from point_wallets (not club_memberships.points)
    const { data: wallets, error: walletsError } = await supabase
      .from('point_wallets')
      .select('user_id, earned_pts')
      .eq('club_id', clubId)
      .in('user_id', userIds);
    
    if (walletsError) {
      console.error('[Leaderboard] Error fetching point wallets:', walletsError);
    }
    
    // Create a map of user_id -> earned_pts (status points)
    const statusPointsByUser = new Map<string, number>();
    wallets?.forEach(w => {
      statusPointsByUser.set(w.user_id, w.earned_pts || 0);
    });
    
    // Get credit_purchases with amounts
    const { data: creditPurchases, error: creditError } = await supabase
      .from('credit_purchases')
      .select('user_id, price_paid_cents')
      .eq('club_id', clubId)
      .eq('status', 'completed')
      .in('user_id', userIds);

    if (creditError) {
      console.error('[Leaderboard] Error fetching credit purchases:', creditError);
    }

    // Get reward_claims (purchased items) with amounts
    const { data: rewardClaims, error: rewardError } = await supabase
      .from('reward_claims')
      .select('user_id, paid_price_cents')
      .eq('club_id', clubId)
      .in('user_id', userIds);

    if (rewardError) {
      console.error('[Leaderboard] Error fetching reward claims:', rewardError);
    }

    // Calculate total invested per user (in cents)
    const totalInvestedByUser = new Map<string, number>();
    
    // Add credit purchases
    creditPurchases?.forEach(p => {
      const current = totalInvestedByUser.get(p.user_id) || 0;
      totalInvestedByUser.set(p.user_id, current + (p.price_paid_cents || 0));
    });
    
    // Add reward claims
    rewardClaims?.forEach(r => {
      const current = totalInvestedByUser.get(r.user_id) || 0;
      totalInvestedByUser.set(r.user_id, current + (r.paid_price_cents || 0));
    });

    // Filter memberships to only those who have made purchases
    const memberships = allMemberships.filter(m => totalInvestedByUser.has(m.user_id));
    
    // Add total invested to each membership and sort by invested amount (descending)
    const membershipsWithInvested = memberships.map(m => ({
      ...m,
      total_invested_cents: totalInvestedByUser.get(m.user_id) || 0
    }));
    
    const sortedMemberships = membershipsWithInvested
      .sort((a, b) => b.total_invested_cents - a.total_invested_cents)
      .slice(0, 100);

    // Transform the data to flatten user info
    // Use earned_pts from point_wallets as status points (not club_memberships.points)
    const leaderboard = sortedMemberships.map((membership: any) => ({
      id: membership.id,
      user_id: membership.user_id,
      points: statusPointsByUser.get(membership.user_id) || 0, // Status points from point_wallets
      total_invested_cents: membership.total_invested_cents || 0,
      current_status: membership.current_status || 'cadet',
      last_activity_at: membership.last_activity_at,
      join_date: membership.join_date,
      created_at: membership.created_at,
      user: {
        id: membership.user?.id,
        name: membership.user?.name || (membership.user?.email ? membership.user.email.split('@')[0] : 'Anonymous'),
        email: membership.user?.email,
      }
    })) || [];

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error('[Leaderboard] Unexpected error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

