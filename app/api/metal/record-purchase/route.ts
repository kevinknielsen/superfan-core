import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";

// Type assertion for enhanced features
const supabaseAny = supabase as any;

/**
 * Record a Metal presale purchase in our database
 * This endpoint is called after a successful Metal buyPresale() call
 * to keep our database in sync with Metal's system
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
      club_id, 
      campaign_id,
      credit_amount, 
      tx_hash,
      metal_holder_id,
      metal_holder_address 
    } = body;

    // Validate inputs
    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!campaign_id || typeof campaign_id !== 'string') {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }

    if (!credit_amount || !Number.isInteger(credit_amount) || credit_amount <= 0) {
      return NextResponse.json({ error: 'credit_amount must be a positive integer' }, { status: 400 });
    }

    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json({ error: 'tx_hash is required for USDC transaction tracking' }, { status: 400 });
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

    // Check for duplicate transaction (idempotency)
    const { data: existingPurchase } = await supabaseAny
      .from('credit_purchases')
      .select('id')
      .eq('usdc_tx_hash', tx_hash)
      .single();

    if (existingPurchase) {
      console.log(`Metal purchase already recorded for tx: ${tx_hash}`);
      return NextResponse.json({ 
        success: true,
        message: 'Purchase already recorded',
        purchase_id: existingPurchase.id 
      });
    }

    // Get campaign info for metadata
    const { data: campaign } = await supabaseAny
      .from('campaigns')
      .select('title')
      .eq('id', campaign_id)
      .single();

    // Get club info for metadata
    const { data: club } = await supabaseAny
      .from('clubs')
      .select('name')
      .eq('id', club_id)
      .single();

    // Calculate price in cents (1 credit = $1 = 100 cents)
    const priceCents = credit_amount * 100;

    // Insert Metal purchase into credit_purchases table
    // Using same schema as Stripe purchases for consistency
    const creditPurchaseData = {
      user_id: actualUserId,
      club_id: club_id,
      campaign_id: campaign_id,
      credits_purchased: credit_amount,
      price_paid_cents: priceCents,
      // Metal-specific fields
      usdc_tx_hash: tx_hash,
      payment_method: 'metal_presale',
      status: 'completed',
      purchased_at: new Date().toISOString(),
      metadata: {
        campaign_title: campaign?.title,
        club_name: club?.name,
        metal_holder_id: metal_holder_id,
        metal_holder_address: metal_holder_address,
        payment_type: 'usdc_base'
      }
    };

    const { data: purchase, error: insertError } = await supabaseAny
      .from('credit_purchases')
      .insert(creditPurchaseData)
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to create Metal credit purchase:', insertError);
      return NextResponse.json({ 
        error: 'Failed to record purchase',
        details: insertError.message 
      }, { status: 500 });
    }

    console.log(`✅ Recorded Metal purchase: ${credit_amount} credits for user ${actualUserId}`);

    // Update campaign progress (same as Stripe webhook)
    const { error: campaignUpdateError } = await supabaseAny
      .rpc('increment_campaigns_ticket_progress', {
        p_campaign_id: campaign_id,
        p_increment_current_funding_cents: priceCents,
        p_increment_stripe_received_cents: priceCents, // Metal purchases count toward goal
        p_increment_total_tickets_sold: credit_amount
      });

    if (campaignUpdateError) {
      console.error('Failed to update campaign progress:', campaignUpdateError);
      // Don't fail the whole operation, just log the error
    } else {
      console.log(`✅ Updated campaign ${campaign_id} progress by $${priceCents/100}`);
    }

    // Check if campaign goal reached
    const { data: updatedCampaign } = await supabaseAny
      .from('campaigns')
      .select('funding_goal_cents, current_funding_cents, title')
      .eq('id', campaign_id)
      .single();

    if (updatedCampaign && updatedCampaign.current_funding_cents >= updatedCampaign.funding_goal_cents) {
      console.log(`🎉 Campaign "${updatedCampaign.title}" reached funding goal!`);
      
      // Mark campaign as funded
      await supabaseAny
        .from('campaigns')
        .update({ status: 'funded' })
        .eq('id', campaign_id);
    }

    return NextResponse.json({
      success: true,
      purchase_id: purchase.id,
      credits_purchased: credit_amount,
      campaign_updated: !campaignUpdateError
    });

  } catch (error) {
    console.error('Error recording Metal purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to record Metal purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

