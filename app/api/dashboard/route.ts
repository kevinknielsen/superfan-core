import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { STATUS_THRESHOLDS, computeStatus, getNextStatus as computeNext } from '@/lib/points';

interface DashboardData {
  user: {
    id: string;
    privy_id: string;
  };
  clubs: Array<{
    id: string;
    name: string;
    description?: string;
    city?: string;
    image_url?: string;
    is_active: boolean;
    created_at: string;
    // Only include membership data if user is a member
    membership?: {
      id: string;
      current_status: string;
      points: number;
      join_date: string;
      last_activity_at: string;
      // Include basic points breakdown for performance
      points_breakdown?: {
        total_balance: number;
        earned_points: number;
        purchased_points: number;
        status_points: number;
        current_status: string;
        next_status: string | null;
        progress_to_next: number;
      };
    };
  }>;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's internal ID (single query)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, privy_id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all clubs with user's membership data in ONE query using a LEFT JOIN
    const { data: clubsWithMemberships, error: clubsError } = await supabase
      .from('clubs')
      .select(`
        id,
        name,
        description,
        city,
        image_url,
        is_active,
        created_at,
        club_memberships!left (
          id,
          current_status,
          points,
          join_date,
          last_activity_at
        )
      `)
      .eq('is_active', true)
      .eq('club_memberships.user_id', user.id)
      .order('created_at', { ascending: false });

    if (clubsError) {
      throw clubsError;
    }

    // Get points data for user's memberships in batch
    const membershipClubIds = clubsWithMemberships
      ?.filter(club => club.club_memberships && club.club_memberships.length > 0)
      .map(club => club.id) || [];

    let pointsData: Record<string, any> = {};
    if (membershipClubIds.length > 0) {
      // Use the computed view for efficient points lookup
      const { data: walletsData } = await supabase
        .from('v_point_wallets')
        .select('club_id, balance_pts, earned_pts, purchased_pts, status_pts')
        .eq('user_id', user.id)
        .in('club_id', membershipClubIds);

      // Index by club_id for quick lookup
      pointsData = (walletsData || []).reduce((acc, wallet) => {
        const statusPoints = wallet.status_pts || 0;
        const current = computeStatus(statusPoints);
        const next = computeNext(current);
        const currentThreshold = STATUS_THRESHOLDS[current];
        const nextThreshold = next ? STATUS_THRESHOLDS[next] : null;

        acc[wallet.club_id] = {
          total_balance: wallet.balance_pts || 0,
          earned_points: wallet.earned_pts || 0,
          purchased_points: wallet.purchased_pts || 0,
          status_points: statusPoints,
          current_status: current,
          next_status: next,
          progress_to_next: nextThreshold
            ? Math.min(100, Math.max(0, ((statusPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
            : 100,
        };
        return acc;
      }, {} as Record<string, any>);
    }

    // Transform the data to include points breakdown with memberships
    const transformedClubs = clubsWithMemberships?.map(club => {
      const membership = club.club_memberships?.[0]; // LEFT JOIN returns array
      
      return {
        id: club.id,
        name: club.name,
        description: club.description,
        city: club.city,
        image_url: club.image_url,
        is_active: club.is_active,
        created_at: club.created_at,
        ...(membership && {
          membership: {
            id: membership.id,
            current_status: membership.current_status,
            points: membership.points,
            join_date: membership.join_date,
            last_activity_at: membership.last_activity_at,
            points_breakdown: pointsData[club.id]
          }
        })
      };
    }) || [];

    const responseData: DashboardData = {
      user: {
        id: user.id,
        privy_id: user.privy_id,
      },
      clubs: transformedClubs,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
