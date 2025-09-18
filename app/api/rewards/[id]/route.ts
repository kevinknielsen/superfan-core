import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';
import { isAdmin } from '@/lib/security.server';

const RewardUpdateSchema = z.object({
  kind: z.enum(['ACCESS', 'PRESALE_LOCK', 'VARIANT']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  points_price: z.number().int().positive().optional(),
  inventory: z.number().int().min(0).nullable().optional(),
  window_start: z.string().datetime().nullable().optional(),
  window_end: z.string().datetime().nullable().optional(),
  settle_mode: z.enum(['ZERO', 'PRR']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: rewardId } = await params;
    const body = await request.json();
    const updateData = RewardUpdateSchema.parse(body);

    // Get reward details
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select(`
        *,
        clubs!inner (
          owner_id
        )
      `)
      .eq('id', rewardId)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json(
        { error: 'Reward not found' },
        { status: 404 }
      );
    }

    // Get internal user to check ownership
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user owns the club or is admin
    const isClubOwner = reward.clubs.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can update rewards' },
        { status: 403 }
      );
    }

    // Validate window dates
    if (updateData.window_start && updateData.window_end) {
      if (new Date(updateData.window_start) >= new Date(updateData.window_end)) {
        return NextResponse.json(
          { error: 'Window start must be before window end' },
          { status: 400 }
        );
      }
    }

    // Update reward
    const { data: updatedReward, error: updateError } = await supabase
      .from('rewards')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rewardId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      reward: updatedReward,
      message: 'Reward updated successfully',
    });

  } catch (error) {
    console.error('Error updating reward:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update reward' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: rewardId } = await params;

    // Get reward details
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select(`
        *,
        clubs!inner (
          owner_id
        )
      `)
      .eq('id', rewardId)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json(
        { error: 'Reward not found' },
        { status: 404 }
      );
    }

    // Get internal user to check ownership
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user owns the club or is admin
    const isClubOwner = reward.clubs.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can delete rewards' },
        { status: 403 }
      );
    }

    // Check if there are any redemptions for this reward
    const { data: redemptions, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .select('id')
      .eq('reward_id', rewardId)
      .limit(1);

    if (redemptionError) {
      throw redemptionError;
    }

    if (redemptions && redemptions.length > 0) {
      // Instead of deleting, deactivate the reward
      const { data: deactivatedReward, error: deactivateError } = await supabase
        .from('rewards')
        .update({
          status: 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rewardId)
        .select('*')
        .single();

      if (deactivateError) {
        throw deactivateError;
      }

      return NextResponse.json({
        reward: deactivatedReward,
        message: 'Reward deactivated (has existing redemptions)',
        action: 'deactivated',
      });
    }

    // Delete the reward if no redemptions exist
    const { error: deleteError } = await supabase
      .from('rewards')
      .delete()
      .eq('id', rewardId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      message: 'Reward deleted successfully',
      action: 'deleted',
    });

  } catch (error) {
    console.error('Error deleting reward:', error);
    return NextResponse.json(
      { error: 'Failed to delete reward' },
      { status: 500 }
    );
  }
}
