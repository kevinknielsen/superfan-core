import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';
import { 
  getOrCreatePointWallet, 
  updateWalletBalance, 
  isRewardAvailable,
  calculateHoldExpiry 
} from '@/lib/points';

const RedeemRequestSchema = z.object({
  rewardId: z.string().uuid(),
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
    const { rewardId } = RedeemRequestSchema.parse(body);

    // Get internal user ID from Privy ID
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

    // Get reward details
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select('*')
      .eq('id', rewardId)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json(
        { error: 'Reward not found' },
        { status: 404 }
      );
    }

    // Check if reward is available
    if (!isRewardAvailable(reward)) {
      return NextResponse.json(
        { error: 'Reward is not currently available' },
        { status: 400 }
      );
    }

    // Get user's point wallet for this community
    const wallet = await getOrCreatePointWallet(internalUser.id, reward.club_id);

    // Check if user has enough points
    if (wallet.balance_pts < reward.points_price) {
      return NextResponse.json(
        { error: 'Insufficient points', 
          required: reward.points_price, 
          available: wallet.balance_pts 
        },
        { status: 400 }
      );
    }

    // Process redemption based on reward type
    let redemptionState: 'HELD' | 'CONFIRMED' = 'CONFIRMED';
    let holdExpiresAt: string | undefined;
    let shouldDeductPoints = true;
    let shouldDecrementInventory = true;

    switch (reward.kind) {
      case 'ACCESS':
        // Immediate confirmation, points deducted
        redemptionState = 'CONFIRMED';
        shouldDeductPoints = true;
        shouldDecrementInventory = false; // ACCESS rewards don't have inventory
        break;

      case 'PRESALE_LOCK':
        // Hold state with expiry, no immediate point deduction
        redemptionState = 'HELD';
        holdExpiresAt = calculateHoldExpiry(24); // 24 hour hold
        shouldDeductPoints = false;
        shouldDecrementInventory = false; // Don't decrement inventory until confirmed
        break;

      case 'VARIANT':
        // Immediate confirmation, decrement inventory
        redemptionState = 'CONFIRMED';
        shouldDeductPoints = true;
        shouldDecrementInventory = true;
        break;
    }

    // Check inventory for VARIANT rewards
    if (reward.kind === 'VARIANT' && reward.inventory !== null && reward.inventory <= 0) {
      return NextResponse.json(
        { error: 'Reward is out of stock' },
        { status: 400 }
      );
    }

    // Create redemption record
    const { data: redemption, error: redemptionError } = await supabase
      .from('reward_redemptions')
      .insert({
        user_id: internalUser.id,
        club_id: reward.club_id,
        reward_id: rewardId,
        points_spent: reward.points_price,
        state: redemptionState,
        hold_expires_at: holdExpiresAt,
        metadata: {
          reward_kind: reward.kind,
          reward_title: reward.title,
        }
      })
      .select('*')
      .single();

    if (redemptionError) {
      throw redemptionError;
    }

    // Deduct points if needed
    if (shouldDeductPoints) {
      await updateWalletBalance(
        wallet.id,
        -reward.points_price,
        'SPEND',
        {
          ref: redemption!.id
        }
      );
    }

    // Decrement inventory if needed
    if (shouldDecrementInventory && reward.inventory !== null) {
      await supabase
        .from('rewards')
        .update({ 
          inventory: Math.max(0, reward.inventory - 1) 
        })
        .eq('id', rewardId);
    }

    // Get updated wallet balance
    const { data: updatedWallet } = await supabase
      .from('point_wallets')
      .select('balance_pts')
      .eq('id', wallet.id)
      .single();

    return NextResponse.json({
      redemption: {
        id: redemption!.id,
        reward_id: rewardId,
        reward_title: reward.title,
        reward_kind: reward.kind,
        points_spent: reward.points_price,
        state: redemptionState,
        hold_expires_at: holdExpiresAt,
        created_at: redemption!.created_at,
      },
      wallet: {
        balance_pts: updatedWallet?.balance_pts || wallet.balance_pts,
        points_deducted: shouldDeductPoints,
      },
      message: getRedemptionMessage(reward.kind, redemptionState),
    });

  } catch (error) {
    console.error('Error processing redemption:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process redemption' },
      { status: 500 }
    );
  }
}

function getRedemptionMessage(kind: string, state: string): string {
  switch (kind) {
    case 'ACCESS':
      return 'Access granted! You can now use this reward.';
    case 'PRESALE_LOCK':
      return 'Presale slot reserved! You have 24 hours to complete your purchase.';
    case 'VARIANT':
      return 'Reward claimed! Check your redemption details for pickup/delivery information.';
    default:
      return state === 'CONFIRMED' ? 'Reward redeemed successfully!' : 'Reward reserved!';
  }
}
