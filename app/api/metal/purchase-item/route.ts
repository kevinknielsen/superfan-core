import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import crypto from "node:crypto";

// Type assertion for enhanced features
// TODO: Replace with proper Supabase typing when Database types are available
// import type { Database } from '@/types/database.types';
// const supabaseTyped = supabase as unknown as SupabaseClient<Database>;
const supabaseAny = supabase as any;

/**
 * POST /api/metal/purchase-item
 * Record a Metal presale item purchase in our database
 * This is for tier rewards/campaign items (not direct credits)
 * Writes to reward_claims table
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as any;
    const { 
      tier_reward_id,
      club_id, 
      campaign_id,
      amount_paid_cents,
      original_price_cents,
      discount_applied_cents,
      tx_hash,
      metal_holder_id,
      metal_holder_address,
      user_tier
    } = body;

    // Validate inputs
    if (!tier_reward_id || typeof tier_reward_id !== 'string') {
      return NextResponse.json({ error: 'tier_reward_id is required' }, { status: 400 });
    }

    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!amount_paid_cents || !Number.isInteger(amount_paid_cents) || amount_paid_cents <= 0) {
      return NextResponse.json({ error: 'amount_paid_cents must be a positive integer' }, { status: 400 });
    }

    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json({ error: 'tx_hash is required for USDC transaction tracking' }, { status: 400 });
    }

    if (original_price_cents !== undefined && (!Number.isInteger(original_price_cents) || original_price_cents < 0)) {
      return NextResponse.json({ error: 'original_price_cents must be a non-negative integer' }, { status: 400 });
    }

    if (discount_applied_cents !== undefined && (!Number.isInteger(discount_applied_cents) || discount_applied_cents < 0)) {
      return NextResponse.json({ error: 'discount_applied_cents must be a non-negative integer' }, { status: 400 });
    }

    if (campaign_id !== undefined && typeof campaign_id !== 'string') {
      return NextResponse.json({ error: 'campaign_id must be a string' }, { status: 400 });
    }

    // Get the user from our database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = user.id;

    // Get tier reward info
    const { data: tierReward, error: tierRewardError } = await supabaseAny
      .from('tier_rewards')
      .select('id, title, tier, reward_type, ticket_cost, is_ticket_campaign, campaign_id')
      .eq('id', tier_reward_id)
      .single();

    if (tierRewardError || !tierReward) {
      return NextResponse.json({ error: 'Tier reward not found' }, { status: 404 });
    }

    // Generate secure access code
    const generateAccessCode = (): string => {
      return 'AC' + crypto.randomBytes(8).toString('hex').toUpperCase();
    };

    // Detect if this is a credit/ticket campaign item
    const isCreditCampaign = tierReward.is_ticket_campaign && tierReward.campaign_id;
    const ticketsPurchased = isCreditCampaign ? (tierReward.ticket_cost || 0) : 0;

    // Create reward claim record
    const claimData = {
      user_id: actualUserId,
      club_id: club_id,
      reward_id: tier_reward_id,
      campaign_id: campaign_id || tierReward.campaign_id || null,
      claim_method: 'metal_presale',
      user_tier_at_claim: user_tier || 'cadet',
      user_points_at_claim: 0,
      original_price_cents: original_price_cents || amount_paid_cents,
      paid_price_cents: amount_paid_cents,
      discount_applied_cents: discount_applied_cents || 0,
      usdc_tx_hash: tx_hash,
      payment_method: 'metal_presale',
      upgrade_transaction_id: null,
      upgrade_amount_cents: null,
      refund_status: 'none',
      access_status: 'granted',
      access_code: generateAccessCode(),
      claimed_at: new Date().toISOString(),
      // Credit/ticket tracking
      is_ticket_claim: isCreditCampaign,
      tickets_purchased: ticketsPurchased,
      tickets_available: ticketsPurchased,
      tickets_redeemed: 0,
      metadata: {
        metal_holder_id: metal_holder_id,
        metal_holder_address: metal_holder_address,
        payment_type: 'usdc_base'
      }
    };

    const { data: claim, error: claimError } = await supabaseAny
      .from('reward_claims')
      .insert(claimData)
      .select('id, access_code')
      .single();

    if (claimError) {
      // Check if this is a duplicate transaction error (unique constraint violation)
      if ((claimError as any).code === '23505') {
        const { data: existingClaim } = await supabaseAny
          .from('reward_claims')
          .select('id, access_code')
          .eq('usdc_tx_hash', tx_hash)
          .single();
        
        if (existingClaim) {
          console.log(`Metal item purchase already recorded for tx: ${tx_hash}`);
          return NextResponse.json({ 
            success: true,
            message: 'Purchase already recorded',
            claim_id: existingClaim.id,
            access_code: existingClaim.access_code,
            tier_reward_title: tierReward.title,
            campaign_updated: false
          });
        }
      }
      
      console.error('Failed to create Metal item claim:', claimError);
      return NextResponse.json({ 
        error: 'Failed to record purchase',
        details: claimError.message 
      }, { status: 500 });
    }

    console.log(`✅ Recorded Metal item purchase: ${tierReward.title} for user ${actualUserId}`);

    // Update campaign progress if campaign_id provided
    if (campaign_id) {
      // For campaign items, credit full original price to campaign (not discounted amount)
      const campaignCreditCents = original_price_cents || amount_paid_cents;
      
      const { error: campaignUpdateError } = await supabaseAny
        .rpc('increment_campaigns_ticket_progress', {
          p_campaign_id: campaign_id,
          p_increment_current_funding_cents: campaignCreditCents,
          p_increment_stripe_received_cents: amount_paid_cents,
          p_increment_total_tickets_sold: ticketsPurchased
        });

      if (campaignUpdateError) {
        console.error('Failed to update campaign progress:', campaignUpdateError);
        // Don't fail the whole operation, just log the error
      } else {
        console.log(`✅ Updated campaign ${campaign_id} progress by $${campaignCreditCents/100}`);
      }

      // Check if campaign goal reached
      const { data: updatedCampaign } = await supabaseAny
        .from('campaigns')
        .select('funding_goal_cents, current_funding_cents, title')
        .eq('id', campaign_id)
        .single();

      if (updatedCampaign && updatedCampaign.current_funding_cents >= updatedCampaign.funding_goal_cents) {
        console.log(`🎉 Campaign "${updatedCampaign.title}" reached funding goal!`);
        
        // Mark campaign as funded (only if not already funded to avoid unnecessary updates)
        await supabaseAny
          .from('campaigns')
          .update({ status: 'funded' })
          .eq('id', campaign_id)
          .neq('status', 'funded');
      }
    }

    return NextResponse.json({
      success: true,
      claim_id: claim.id,
      access_code: claim.access_code,
      tier_reward_title: tierReward.title,
      campaign_updated: !!campaign_id
    });

  } catch (error) {
    console.error('Error recording Metal item purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to record Metal item purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

