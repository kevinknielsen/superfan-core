"use server";

import { createServiceClient } from "../../app/api/supabase";
import { stripe } from "@/lib/stripe";

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
const supabaseAny = supabase as any;

export interface RefundResult {
  success: boolean;
  error?: string;
  refundedCount?: number;
}

/**
 * Process refunds for a failed campaign
 * This function encapsulates the shared refund logic used by both
 * the cron job and manual admin refund endpoints
 */
export async function processCampaignRefunds(
  campaignId: string,
  supabaseClient: any = supabaseAny,
  stripeClient: any = stripe
): Promise<RefundResult> {
  try {
    console.log(`[Campaign Refunds] Processing failure for campaign ${campaignId}`);
    
    // Get all paid participants for this campaign that haven't been refunded
    const { data: participants, error: participantsError } = await supabaseClient
      .from('reward_claims')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('claim_method', 'upgrade_purchased')
      .eq('refund_status', 'none');
      
    if (participantsError) {
      console.error(`[Campaign Refunds] Error fetching participants for campaign ${campaignId}:`, participantsError);
      return { success: false, error: `Database error: ${participantsError.message}` };
    }
    
    if (!participants || participants.length === 0) {
      console.log(`[Campaign Refunds] No participants found for campaign ${campaignId}`);
      return { success: true, refundedCount: 0 };
    }
    
    let refundedCount = 0;
    const errors: string[] = [];
    
    // Process refunds for each participant
    for (const participant of participants) {
      try {
        // Guard against missing payment intent
        if (!participant.stripe_payment_intent_id) {
          console.warn(`[Campaign Refunds] Skipping participant ${participant.id} - missing payment intent ID`);
          
          // Mark as refund failed with reason
          await supabaseClient
            .from('reward_claims')
            .update({
              refund_status: 'failed',
              refunded_at: new Date().toISOString(),
              metadata: {
                refund_failure_reason: 'missing_payment_intent_id',
                campaign_id: campaignId,
                participant_id: participant.id
              }
            })
            .eq('id', participant.id);
            
          errors.push(`Skipped participant ${participant.id}: missing payment intent ID`);
          continue;
        }

        // Create Stripe refund with idempotency
        const refund = await stripeClient.refunds.create({
          payment_intent: participant.stripe_payment_intent_id,
          amount: participant.paid_price_cents, // Refund what they actually paid
          reason: 'requested_by_customer',
          metadata: {
            type: 'campaign_failure_refund',
            campaign_id: campaignId,
            participation_id: participant.id
          }
        }, {
          idempotencyKey: `refund_${participant.id}` // Prevent double refunds
        });
        
        // Update refund status
        const { error: updateError } = await supabaseClient
          .from('reward_claims')
          .update({
            refund_status: 'processed',
            refunded_at: new Date().toISOString(),
            stripe_refund_id: refund.id
          })
          .eq('id', participant.id);
          
        if (updateError) {
          console.error(`[Campaign Refunds] Failed to update refund status for participant ${participant.id}:`, updateError);
          errors.push(`Failed to update refund status for participant ${participant.id}`);
        } else {
          refundedCount++;
          console.log(`[Campaign Refunds] Refunded $${participant.paid_price_cents/100} to user ${participant.user_id}`);
        }
        
      } catch (refundError: unknown) {
        const errMsg = refundError instanceof Error ? refundError.message : String(refundError);
        console.error(`[Campaign Refunds] Refund failed for participant ${participant.id}:`, refundError);
        
        // Mark refund as failed for manual review
        await supabaseClient
          .from('reward_claims')
          .update({
            refund_status: 'failed',
            refunded_at: new Date().toISOString(),
            metadata: {
              refund_failure_reason: errMsg,
              campaign_id: campaignId,
              participant_id: participant.id
            }
          })
          .eq('id', participant.id);
          
        errors.push(`Refund failed for participant ${participant.id}: ${errMsg}`);
      }
    }
    
    // Mark campaign as failed
    const { error: campaignUpdateError } = await supabaseClient
      .from('tier_rewards')
      .update({ 
        campaign_status: 'campaign_failed' 
      })
      .eq('campaign_id', campaignId);
      
    if (campaignUpdateError) {
      console.error(`[Campaign Refunds] Failed to mark campaign as failed:`, campaignUpdateError);
      errors.push('Failed to mark campaign as failed');
    }
    
    if (errors.length > 0) {
      return { 
        success: false, 
        error: `Some refunds failed: ${errors.join('; ')}`,
        refundedCount 
      };
    }
    
    console.log(`[Campaign Refunds] Successfully processed ${refundedCount} refunds for campaign ${campaignId}`);
    return { success: true, refundedCount };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Campaign Refunds] Error processing campaign failure:`, error);
    return { success: false, error: errMsg };
  }
}
