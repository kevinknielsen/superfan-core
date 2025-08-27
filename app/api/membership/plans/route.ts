import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';

export async function GET(request: NextRequest) {
  try {
    const { data: plans, error } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('Error fetching membership plans:', error);
      return NextResponse.json(
        { error: 'Failed to fetch membership plans' },
        { status: 500 }
      );
    }

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
