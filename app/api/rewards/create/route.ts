import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';
import { isAdmin } from '@/lib/security';

const CreateRewardSchema = z.object({
  club_id: z.string().uuid(),
  kind: z.enum(['ACCESS', 'PRESALE_LOCK', 'VARIANT']),
  title: z.string().min(1),
  description: z.string().optional(),
  points_price: z.number().int().positive(),
  inventory: z.number().int().min(0).nullable().optional(),
  window_start: z.string().datetime().nullable().optional(),
  window_end: z.string().datetime().nullable().optional(),
  settle_mode: z.enum(['ZERO', 'PRR']).default('ZERO'),
});

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const rewardData = CreateRewardSchema.parse(body);

    // Get club details to check ownership
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, owner_id, name')
      .eq('id', rewardData.club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: 'Club not found' },
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
    const isClubOwner = club.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can create rewards' },
        { status: 403 }
      );
    }

    // Validate window dates
    if (rewardData.window_start && rewardData.window_end) {
      if (new Date(rewardData.window_start) >= new Date(rewardData.window_end)) {
        return NextResponse.json(
          { error: 'Window start must be before window end' },
          { status: 400 }
        );
      }
    }

    // Set default inventory for different reward types
    if (rewardData.inventory === undefined) {
      switch (rewardData.kind) {
        case 'ACCESS':
          rewardData.inventory = null; // Unlimited
          break;
        case 'PRESALE_LOCK':
          rewardData.inventory = null; // Unlimited
          break;
        case 'VARIANT':
          rewardData.inventory = 1; // Default to 1 for physical items
          break;
      }
    }

    // Create reward
    const { data: newReward, error: createError } = await supabase
      .from('rewards')
      .insert({
        ...rewardData,
        status: 'active',
      })
      .select('*')
      .single();

    if (createError) {
      throw createError;
    }

    return NextResponse.json({
      reward: newReward,
      message: 'Reward created successfully',
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating reward:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create reward' },
      { status: 500 }
    );
  }
}
