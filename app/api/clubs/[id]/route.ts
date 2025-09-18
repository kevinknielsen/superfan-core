import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/api/supabase';

/**
 * GET /api/clubs/[id]
 * Get a single club by ID (public endpoint for QR tap-in flow)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const supabase = createServiceClient();
    
    const { data: club, error } = await supabase
      .from('clubs')
      .select(`
        id,
        name,
        description,
        city,
        image_url,
        is_active,
        created_at
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching club:', error);
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Calculate member count
    const { count: memberCount, error: countError } = await supabase
      .from('club_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('club_id', id)
      .eq('status', 'active');

    if (countError) {
      console.error('Error counting members:', countError);
      // Don't fail the request, just set member count to 0
      club.member_count = 0;
    } else {
      club.member_count = memberCount || 0;
    }

    return NextResponse.json(club);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}