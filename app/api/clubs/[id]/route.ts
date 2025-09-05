import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';

/**
 * GET /api/clubs/[id]
 * Get a single club by ID (public endpoint for QR tap-in flow)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    
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

    return NextResponse.json(club);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}