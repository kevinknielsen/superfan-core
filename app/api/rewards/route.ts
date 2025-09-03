import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isRewardAvailable } from '@/lib/points';

const RewardsQuerySchema = z.object({
  communityId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const communityId = url.searchParams.get('communityId');

    if (!communityId) {
      return NextResponse.json(
        { error: 'communityId parameter is required' },
        { status: 400 }
      );
    }

    // Validate the community ID format
    const { communityId: validatedCommunityId } = RewardsQuerySchema.parse({
      communityId
    });

    // Get all active rewards for the community
    const { data: rewards, error: rewardsError } = await supabase
      .from('rewards')
      .select(`
        id,
        club_id,
        kind,
        title,
        description,
        points_price,
        inventory,
        window_start,
        window_end,
        settle_mode,
        status,
        created_at,
        updated_at
      `)
      .eq('club_id', validatedCommunityId)
      .eq('status', 'active')
      .order('points_price', { ascending: true });

    if (rewardsError) {
      throw rewardsError;
    }

    // Filter rewards by availability and add computed fields
    const availableRewards = (rewards || []).map(reward => {
      const available = isRewardAvailable(reward);
      const now = new Date();
      
      let availabilityReason = '';
      if (!available) {
        if (reward.window_start && new Date(reward.window_start) > now) {
          availabilityReason = 'Window not started';
        } else if (reward.window_end && new Date(reward.window_end) < now) {
          availabilityReason = 'Window ended';
        } else if (reward.inventory !== null && reward.inventory <= 0) {
          availabilityReason = 'Out of stock';
        } else {
          availabilityReason = 'Inactive';
        }
      }

      return {
        ...reward,
        available,
        availability_reason: availabilityReason,
        // Add time window info
        is_timed: !!(reward.window_start || reward.window_end),
        window_active: reward.window_start && reward.window_end ? 
          now >= new Date(reward.window_start) && now <= new Date(reward.window_end) :
          true,
      };
    });

    // Get community info
    const { data: community, error: communityError } = await supabase
      .from('clubs')
      .select('id, name, city, image_url')
      .eq('id', validatedCommunityId)
      .single();

    if (communityError) {
      throw communityError;
    }

    return NextResponse.json({
      community,
      rewards: availableRewards,
      total_count: availableRewards.length,
      available_count: availableRewards.filter(r => r.available).length,
    });

  } catch (error) {
    console.error('Error fetching rewards:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch rewards' },
      { status: 500 }
    );
  }
}
