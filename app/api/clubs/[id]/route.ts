import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';

/**
 * GET /api/clubs/[id]
 * Get a specific club's details including USDC wallet address
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;

    const { data: club, error } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Club not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(club);
  } catch (error) {
    console.error('[Club API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch club' },
      { status: 500 }
    );
  }
}
