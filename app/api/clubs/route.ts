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

    return NextResponse.json({ clubs });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
