import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUser } from '@/lib/user-management';

/**
 * POST /api/clubs/[clubId]/join
 * Join a club (create club membership)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clubId = params.id;

    // Ensure user exists in our system
    const user = await getOrCreateUser({
      privyId: auth.userId,
    });

    // Check if club exists
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name, is_active')
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

    if (!club.is_active) {
      return NextResponse.json(
        { error: 'Club is not active' },
        { status: 400 }
      );
    }

    // Check if user is already a member
    const { data: existingMembership, error: checkError } = await supabase
      .from('club_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingMembership) {
      return NextResponse.json(
        { error: 'Already a member of this club' },
        { status: 400 }
      );
    }

    // Create club membership
    const { data: membership, error: membershipError } = await supabase
      .from('club_memberships')
      .insert({
        user_id: user.id,
        club_id: clubId,
        points: 0,
        current_status: 'cadet',
        status: 'active',
      })
      .select(`
        *,
        club:clubs(*)
      `)
      .single();

    if (membershipError) {
      console.error('Error creating membership:', membershipError);
      return NextResponse.json(
        { error: 'Failed to join club' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      membership,
      message: `Successfully joined ${club.name}!`
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
