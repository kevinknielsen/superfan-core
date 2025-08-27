import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';

/**
 * GET /api/clubs/[clubId]
 * Get a specific club with its unlocks
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clubId: string } }
) {
  try {
    const { clubId } = params;

    // Get club details
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single();

    if (clubError) {
      if (clubError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Club not found' },
          { status: 404 }
        );
      }
      throw clubError;
    }

    // Get unlocks for this club
    const { data: unlocks, error: unlocksError } = await supabase
      .from('unlocks')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('min_status');

    if (unlocksError) {
      console.error('Error fetching unlocks:', unlocksError);
      return NextResponse.json(
        { error: 'Failed to fetch club unlocks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      club: {
        ...club,
        unlocks: unlocks || [],
        unlock_count: unlocks?.length || 0,
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
