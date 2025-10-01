import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUserFromAuth } from '@/lib/user-management';

/**
 * GET /api/membership/me
 * Get current user's membership status
 * Supports both Privy (web) and Farcaster (wallet app) users
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Ensure user exists in our system - handles both Privy and Farcaster
    const user = await getOrCreateUserFromAuth(auth);

    // Get user's membership with plan details
    const { data: membership, error } = await supabase
      .from('memberships')
      .select(`
        *,
        plan:membership_plans(*)
      `)
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching membership:', error);
      return NextResponse.json(
        { error: 'Failed to fetch membership' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      membership: membership || null,
      user: {
        id: user.id,
        privy_id: user.privy_id,
        farcaster_id: user.farcaster_id,
        email: user.email,
        name: user.name,
      }
    });
  } catch (error) {
    console.error('Error in /api/membership/me:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
