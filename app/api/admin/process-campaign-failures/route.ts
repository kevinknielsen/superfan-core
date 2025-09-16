import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Type assertion for enhanced tables
const supabaseAny = supabase as any;

// Process failed campaigns and issue refunds
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user to check admin status
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id, role')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('[Campaign Failures] Starting campaign failure processing...');
    
    // Get campaigns past deadline that didn't reach goal
    const { data: failedCampaigns, error: campaignsError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .lt('campaign_deadline', new Date().toISOString())
      .lt('funding_percentage', 100)
      .in('campaign_status', ['campaign_active']); // Only process active campaigns
      
    if (campaignsError) {
      console.error('[Campaign Failures] Error fetching failed campaigns:', campaignsError);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }
    
    if (!failedCampaigns || failedCampaigns.length === 0) {
      console.log('[Campaign Failures] No failed campaigns to process');
      return NextResponse.json({ 
        message: 'No failed campaigns found',
        processed_campaigns: 0 
      });
    }
    
    console.log(`[Campaign Failures] Found ${failedCampaigns.length} failed campaigns to process`);
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const campaign of failedCampaigns) {
      try {
        const result = await processCampaignFailure(campaign.campaign_id);
        if (result.success) {
          processedCount++;
        } else {
          errorCount++;
          console.error(`[Campaign Failures] Failed to process campaign ${campaign.campaign_id}:`, result.error);
        }
      } catch (error) {
        errorCount++;
        console.error(`[Campaign Failures] Unexpected error processing campaign ${campaign.campaign_id}:`, error);
      }
    }
    
    console.log(`[Campaign Failures] Processing complete. Success: ${processedCount}, Errors: ${errorCount}`);
    
    return NextResponse.json({ 
      processed_campaigns: processedCount,
      failed_campaigns: errorCount,
      total_campaigns: failedCampaigns.length
    });

  } catch (error) {
    console.error('[Campaign Failures] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to process campaign failures' }, { status: 500 });
  }
}

async function processCampaignFailure(campaignId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Campaign Failures] Processing failure for campaign ${campaignId}`);
    
    // Get all paid participants for this campaign
    const { data: participants, error: participantsError } = await supabaseAny
      .from('reward_claims')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('claim_method', 'upgrade_purchased')
      .eq('refund_status', 'none');
      
    if (participantsError) {
      console.error(`[Campaign Failures] Error fetching participants for campaign ${campaignId}:`, participantsError);
      return { success: false, error: `Failed to fetch participants: ${participantsError.message}` };
    }
    
    if (!participants || participants.length === 0) {
      console.log(`[Campaign Failures] No participants to refund for campaign ${campaignId}`);
      
      // Still mark campaign as failed
      await supabaseAny
        .from('tier_rewards')
        .update({ campaign_status: 'campaign_failed' })
        .eq('campaign_id', campaignId);
        
      return { success: true };
    }
    
    console.log(`[Campaign Failures] Processing refunds for ${participants.length} participants`);
    
    let refundedCount = 0;
    let refundErrorCount = 0;
    
    for (const participant of participants) {
      try {
        // Create Stripe refund with idempotency
        const refund = await stripe.refunds.create({
          payment_intent: participant.stripe_payment_intent_id,
          amount: participant.paid_price_cents, // Refund what they actually paid
          reason: 'requested_by_customer',
          metadata: {
            type: 'campaign_failure_refund',
            campaign_id: campaignId,
            participation_id: participant.id,
            user_id: participant.user_id
          }
        }, {
          idempotencyKey: `refund_${participant.id}` // Prevent double refunds
        });
        
        // Update refund status
        const { error: updateError } = await supabaseAny
          .from('reward_claims')
          .update({
            refund_status: 'processed',
            refunded_at: new Date().toISOString(),
            stripe_refund_id: refund.id
          })
          .eq('id', participant.id);
          
        if (updateError) {
          console.error(`[Campaign Failures] Failed to update refund status for participant ${participant.id}:`, updateError);
          refundErrorCount++;
        } else {
          console.log(`[Campaign Failures] Refunded $${participant.paid_price_cents/100} to user ${participant.user_id}`);
          refundedCount++;
        }
        
      } catch (error: any) {
        console.error(`[Campaign Failures] Refund failed for participant ${participant.id}:`, error);
        
        // Mark refund as failed for manual review
        await supabaseAny
          .from('reward_claims')
          .update({
            refund_status: 'failed',
            refunded_at: new Date().toISOString()
          })
          .eq('id', participant.id);
          
        refundErrorCount++;
      }
    }
    
    // Mark campaign as failed
    const { error: statusError } = await supabaseAny
      .from('tier_rewards')
      .update({ campaign_status: 'campaign_failed' })
      .eq('campaign_id', campaignId);
      
    if (statusError) {
      console.error(`[Campaign Failures] Failed to update campaign status for ${campaignId}:`, statusError);
    }
    
    console.log(`[Campaign Failures] Campaign ${campaignId} processing complete. Refunded: ${refundedCount}, Errors: ${refundErrorCount}`);
    
    return { 
      success: refundErrorCount === 0,
      error: refundErrorCount > 0 ? `${refundErrorCount} refunds failed` : undefined
    };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Campaign Failures] Unexpected error processing campaign ${campaignId}:`, error);
    return { success: false, error: errMsg };
  }
}
