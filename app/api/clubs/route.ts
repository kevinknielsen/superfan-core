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

    // Calculate member count for each club
    const clubsWithMemberCount = await Promise.all(
      clubs.map(async (club) => {
        const { count: memberCount, error: countError } = await supabase
          .from('club_memberships')
          .select('*', { count: 'exact', head: true })
          .eq('club_id', club.id)
          .eq('status', 'active');

        return {
          ...club,
          member_count: countError ? 0 : (memberCount || 0)
        };
      })
    );

    return NextResponse.json({ clubs: clubsWithMemberCount });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
