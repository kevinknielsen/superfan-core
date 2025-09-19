import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';

/**
 * GET /api/clubs
 * Get all active clubs for discovery
 */
export async function GET(request: NextRequest) {
  try {
    const { data: clubs, error } = await supabase
      .from('clubs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching clubs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch clubs' },
        { status: 500 }
      );
    }

    // Calculate member count for all clubs in a single query
    const clubIds = clubs.map(club => club.id);
    
    let memberCountMap: Record<string, number> = {};
    
    if (clubIds.length > 0) {
      const { data: memberCounts, error: countError } = await supabase
        .from('club_memberships')
        .select('club_id')
        .eq('status', 'active')
        .in('club_id', clubIds);

      if (countError) {
        console.error('Error counting members:', countError);
        // Fallback to 0 for all clubs if count query fails
        memberCountMap = {};
      } else {
        // Group by club_id and count occurrences
        memberCountMap = (memberCounts || []).reduce((acc, membership) => {
          const clubId = membership.club_id;
          acc[clubId] = (acc[clubId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
      }
    }

    // Map clubs to include member_count
    const clubsWithMemberCount = clubs.map(club => ({
      ...club,
      member_count: memberCountMap[club.id] || 0
    }));

    return NextResponse.json({ clubs: clubsWithMemberCount });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
