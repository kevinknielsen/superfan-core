import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUser } from '@/lib/user-management';
import { calculateTapInPoints, calculateStatus } from '@/types/club.types';
import type { TapInSource } from '@/types/club.types';

/**
 * POST /api/tap-in
 * Record a tap-in and update user's points/status
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { clubId, source, location, metadata = {} } = body;

    if (!clubId || !source) {
      return NextResponse.json(
        { error: 'Missing required fields: clubId, source' },
        { status: 400 }
      );
    }

    // Ensure user exists in our system
    const user = await getOrCreateUser({
      privyId: auth.userId,
    });

    // Verify user is a member of this club
    const { data: membership, error: membershipError } = await supabase
      .from('club_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .eq('status', 'active')
      .single();

    if (membershipError) {
      if (membershipError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Not a member of this club' },
          { status: 403 }
        );
      }
      throw membershipError;
    }

    // Calculate points for this tap-in
    const pointsEarned = calculateTapInPoints(source as TapInSource, metadata);

    // Record the tap-in
    const { data: tapIn, error: tapInError } = await supabase
      .from('tap_ins')
      .insert({
        user_id: user.id,
        club_id: clubId,
        source,
        points_earned: pointsEarned,
        location,
        metadata,
      })
      .select()
      .single();

    if (tapInError) {
      console.error('Error recording tap-in:', tapInError);
      return NextResponse.json(
        { error: 'Failed to record tap-in' },
        { status: 500 }
      );
    }

    // Calculate new points and status
    const newPoints = membership.points + pointsEarned;
    const newStatus = calculateStatus(newPoints);
    const statusChanged = newStatus !== membership.current_status;

    // Update membership with new points and status
    const { data: updatedMembership, error: updateError } = await supabase
      .from('club_memberships')
      .update({
        points: newPoints,
        current_status: newStatus,
        last_activity_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating membership:', updateError);
      return NextResponse.json(
        { error: 'Failed to update membership' },
        { status: 500 }
      );
    }

    // Record in points ledger
    const { error: ledgerError } = await supabase
      .from('points_ledger')
      .insert({
        user_id: user.id,
        club_id: clubId,
        delta: pointsEarned,
        reason: 'tap_in',
        reference_id: tapIn.id,
      });

    if (ledgerError) {
      console.error('Error recording points ledger:', ledgerError);
      // Don't fail the request for ledger errors, but log them
    }

    const response = {
      tapIn,
      membership: updatedMembership,
      pointsEarned,
      statusChange: statusChanged ? {
        from: membership.current_status,
        to: newStatus,
      } : null,
      message: statusChanged 
        ? `Congratulations! You've reached ${newStatus} status!`
        : `+${pointsEarned} points earned!`
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
