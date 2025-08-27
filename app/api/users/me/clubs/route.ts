import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUser } from '@/lib/user-management';

/**
 * GET /api/users/me/clubs
 * Get current user's club memberships
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

    // Ensure user exists in our system
    const user = await getOrCreateUser({
      privyId: auth.userId,
    });

    // Get user's club memberships with club details
    const { data: memberships, error } = await supabase
      .from('club_memberships')
      .select(`
        *,
        club:clubs(*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false });

    if (error) {
      console.error('Error fetching user clubs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch club memberships' },
        { status: 500 }
      );
    }

    return NextResponse.json({ memberships: memberships || [] });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
