import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../supabase";
import { stripe, verifyWebhookSignature } from "@/lib/stripe";
import Stripe from "stripe";
import crypto from "node:crypto";

export const runtime = 'nodejs';

// Create service client to bypass RLS for webhook operations
const supabase = createServiceClient();
// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Use the shared stripe instance from lib/stripe.ts
function getStripe(): Stripe {
  return stripe;
}

// Use the shared webhook verification from lib/stripe.ts
async function verifyWebhookEvent(
  rawBody: string | Buffer, 
  signature: string
): Promise<Stripe.Event | null> {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_TIER_REWARDS || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET_TIER_REWARDS or STRIPE_WEBHOOK_SECRET not configured');
      return null;
    }
    
    const event = verifyWebhookSignature(
      rawBody.toString(),
      signature,
      webhookSecret
    );
    
    return event;
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return null;
  }
}

// Process payment_intent.succeeded events
async function processPaymentIntentSucceeded(event: Stripe.Event): Promise<{ success: boolean; error?: string }> {
  try {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    console.log(`[Tier Rewards Webhook] Processing payment_intent.succeeded: ${paymentIntent.id}`);
    
    // Skip campaign purchases - they're handled by checkout.session.completed
    const metadata = paymentIntent.metadata || {};
    const purchaseType = (metadata.type || '').toLowerCase();
    if (purchaseType === 'credit_purchase' || purchaseType === 'direct_credit_purchase' || purchaseType === 'campaign_tier_purchase') {
      console.log(`[Tier Rewards Webhook] Skipping ${purchaseType} - will be handled by checkout.session.completed`);
      return { success: true };
    }
    
    // Find the upgrade transaction - try by payment intent first, then by session ID
    let { data: transaction, error: transactionError } = await supabaseAny
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();
    
    // If not found by payment intent, try by session ID (for new transactions)
    if (transactionError?.code === 'PGRST116') {
      const sessionId = paymentIntent.metadata?.stripe_session_id;
      if (sessionId) {
        console.log('[Tier Rewards Webhook] Trying lookup by session ID:', sessionId);
        const { data: sessionTransaction, error: sessionError } = await supabaseAny
          .from('upgrade_transactions')
          .select('*')
          .eq('stripe_session_id', sessionId)
          .single();
          
        if (!sessionError && sessionTransaction) {
          transaction = sessionTransaction;
          transactionError = null;
        }
      }
    }
    
    if (transactionError || !transaction) {
      const error = `Upgrade transaction not found for payment intent: ${paymentIntent.id}`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    // Only process pending transactions, skip all others
    if (transaction.status !== 'pending') {
      console.log(`[Tier Rewards Webhook] Transaction ${transaction.id} has status '${transaction.status}', skipping (only processing pending transactions)`);
      return { success: true };
    }

    // Verify payment amount and currency match the stored transaction
    const expectedAmountCents = transaction.amount_cents;
    const expectedCurrency = transaction.currency || 'usd';
    
    if (paymentIntent.amount_received !== expectedAmountCents) {
      const error = `Payment amount mismatch for transaction ${transaction.id}: received ${paymentIntent.amount_received} cents, expected ${expectedAmountCents} cents`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    if (paymentIntent.currency !== expectedCurrency) {
      const error = `Payment currency mismatch for transaction ${transaction.id}: received ${paymentIntent.currency}, expected ${expectedCurrency}`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    // Get the session ID from the payment intent metadata to find the transaction
    const sessionId = paymentIntent.metadata?.stripe_session_id;
    
    if (sessionId) {
      // Use session-based processing for new tier rewards transactions
      const { error: processError } = await supabaseAny.rpc('process_successful_upgrade_by_session', {
        p_session_id: sessionId,
        p_payment_intent_id: paymentIntent.id
      });
      
      if (processError) {
        console.error('[Tier Rewards Webhook] Database error processing upgrade by session:', processError);
        return { success: false, error: `Database error: ${processError.message}` };
      }
    } else {
      // Fallback to original processing for backward compatibility
      const { error: processError } = await supabaseAny.rpc('process_successful_upgrade', {
        p_transaction_id: transaction.id,
        p_payment_intent_id: paymentIntent.id
      });
      
      if (processError) {
        console.error('[Tier Rewards Webhook] Database error processing upgrade:', processError);
        return { success: false, error: `Database error: ${processError.message}` };
      }
    }
    
    console.log(`[Tier Rewards Webhook] Successfully processed upgrade for transaction ${transaction.id}`);
    
    // TODO: Send confirmation email to user
    // await sendUpgradeConfirmationEmail(transaction);
    
    return { success: true };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Tier Rewards Webhook] Error processing payment_intent.succeeded:', error);
    return { success: false, error: errMsg };
  }
}

// Process campaign tier purchases (new for campaigns MVP)
async function processCampaignTierPurchase(session: Stripe.Checkout.Session): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Tier Rewards Webhook] Processing campaign tier purchase: ${session.id}`);
    
    const metadata = session.metadata!;
    const idempotencyKey = metadata.idempotency_key;
    
    // Check if already processed (idempotency protection)
    const { data: existingClaim } = await supabaseAny
      .from('reward_claims')
      .select('id')
      .eq('stripe_payment_intent_id', session.payment_intent as string)
      .single();
      
    if (existingClaim) {
      console.log(`[Tier Rewards Webhook] Campaign purchase already processed, skipping: ${session.payment_intent}`);
      return { success: true };
    }
    
    // Helper function for safe integer parsing
    const toInt = (val: string | undefined): number => {
      if (!val) return 0;
      const parsed = Number.parseInt(val.trim(), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    };

    // Helper function for boolean detection
    const toBool = (val: string | undefined): boolean => {
      if (!val) return false;
      const normalized = val.trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    };

    // Detect credit/ticket campaign purchase with robust parsing
    const normalizedType = metadata.type?.trim().toLowerCase();
    const isCreditPurchase =
      normalizedType === 'credit_purchase' || 
      normalizedType === 'direct_credit_purchase' || 
      toBool(metadata.is_credit_campaign);
    
    // For direct credit purchases, get credit amount from metadata
    const directCreditAmount = toInt(metadata.credit_amount);
    // Back-compat: accept both credits_purchased and tickets_purchased with safe fallback
    const creditsParsed = toInt(metadata.credits_purchased);
    const ticketsParsed = toInt(metadata.tickets_purchased);
    const unitsPurchased = isCreditPurchase
      ? Math.max(0, directCreditAmount || creditsParsed || ticketsParsed)
      : 0;
    
    // Generate secure access code using crypto (8 bytes = 64-bit entropy)
    const generateAccessCode = (): string => {
      return 'AC' + crypto.randomBytes(8).toString('hex').toUpperCase();
    };

    // Direct credit purchases go to separate table (no reward_id, allows repeat purchases)
    if (normalizedType === 'direct_credit_purchase') {
      // Check if already processed (idempotency protection)
      const { data: existingPurchase } = await supabaseAny
        .from('credit_purchases')
        .select('id')
        .eq('stripe_payment_intent_id', session.payment_intent as string)
        .single();
        
      if (existingPurchase) {
        console.log(`[Tier Rewards Webhook] Credit purchase already processed, skipping: ${session.payment_intent}`);
        return { success: true };
      }
      
      const creditPurchaseData = {
        user_id: metadata.user_id,
        club_id: metadata.club_id,
        campaign_id: metadata.campaign_id,
        credits_purchased: unitsPurchased,
        price_paid_cents: toInt(metadata.final_price_cents || metadata.price_cents),
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_session_id: session.id,
        idempotency_key: metadata.idempotency_key,
        status: 'completed',
        purchased_at: new Date().toISOString(),
        metadata: {
          campaign_title: metadata.campaign_title,
          club_name: metadata.club_name
        }
      };
      
      const { error: insertError } = await supabaseAny.from('credit_purchases').insert(creditPurchaseData);
      
      if (insertError) {
        console.error('[Tier Rewards Webhook] Failed to create credit purchase:', insertError);
        return { success: false, error: `Failed to create credit purchase: ${insertError.message}` };
      }
      
      console.log(`[Tier Rewards Webhook] Created credit purchase: ${unitsPurchased} credits for user ${metadata.user_id}`);
    } else {
      // Campaign item purchases go to reward_claims
      const claimData: any = {
        user_id: metadata.user_id,
        club_id: metadata.club_id,
        reward_id: metadata.tier_reward_id, // Required NOT NULL field
        campaign_id: metadata.campaign_id || null,
        claim_method: 'tier_qualified', // Campaign purchases don't use upgrade_transactions
        user_tier_at_claim: metadata.user_tier || 'cadet',
        user_points_at_claim: 0,
        original_price_cents: toInt(metadata.original_price_cents || metadata.price_cents),
        paid_price_cents: toInt(metadata.final_price_cents || metadata.price_cents),
        discount_applied_cents: toInt(metadata.discount_cents),
        stripe_payment_intent_id: session.payment_intent as string,
        // Campaign purchases don't have upgrade_transaction_id (no FK constraint issue)
        upgrade_transaction_id: null,
        upgrade_amount_cents: null,
        refund_status: 'none',
        // Grant access immediately (constraint only allows 'granted' or 'revoked')
        access_status: 'granted',
        access_code: generateAccessCode(),
        claimed_at: new Date().toISOString(),
        // Credit/ticket tracking fields
        is_ticket_claim: isCreditPurchase,
        tickets_purchased: unitsPurchased,
        tickets_available: unitsPurchased,
        tickets_redeemed: 0
      };

      const { error: insertError } = await supabaseAny.from('reward_claims').insert(claimData);
    
      if (insertError) {
        console.error('[Tier Rewards Webhook] Failed to create reward claim:', insertError);
        return { success: false, error: `Failed to create reward claim: ${insertError.message}` };
      }
      
      console.log(`[Tier Rewards Webhook] Created reward claim for ${metadata.tier_reward_id}`);
    }
    
    // Update campaign progress with FULL tier value (not discounted amount)
    if (metadata.campaign_id) {
      const campaignCreditCents = toInt(metadata.campaign_credit_cents || metadata.price_cents);
      const finalPriceCents = toInt(metadata.final_price_cents || metadata.price_cents);
      
      // Only update campaigns table (credit campaigns) - atomic single update
      if (isCreditPurchase) {
        const { error: campaignUpdateError } = await supabaseAny
          .rpc('increment_campaigns_ticket_progress', {
            p_campaign_id: metadata.campaign_id,
            p_increment_current_funding_cents: campaignCreditCents,
            p_increment_received_cents: finalPriceCents, // Generic parameter for all payment methods
            p_increment_total_tickets_sold: unitsPurchased
          });
          
        if (campaignUpdateError) {
          console.error('[Tier Rewards Webhook] Failed to update campaign table:', campaignUpdateError);
          // Don't fail the whole operation, just log the error
        } else {
          console.log(`[Tier Rewards Webhook] Updated campaign ${metadata.campaign_id} progress by $${campaignCreditCents/100}`);
        }
      } else {
        // Legacy tier rewards - update tier_rewards table
        const { error: campaignError } = await supabaseAny
          .rpc('increment_campaign_funding', {
            p_campaign_id: metadata.campaign_id,
            p_amount_cents: campaignCreditCents
          });
          
        if (campaignError) {
          console.error('[Tier Rewards Webhook] Failed to update campaign progress:', campaignError);
        }
      }
      
      // Check if campaign goal reached (check campaigns table for credit campaigns)
      if (isCreditPurchase) {
        const { data: campaign } = await supabaseAny
          .from('campaigns')
          .select('funding_goal_cents, current_funding_cents, title')
          .eq('id', metadata.campaign_id)
          .single();
        
        if (campaign && campaign.current_funding_cents >= campaign.funding_goal_cents) {
          console.log(`[Tier Rewards Webhook] 🎉 Campaign "${campaign.title}" reached funding goal!`);
          
          // Mark campaign as funded (atomic update)
          const { error: campaignError } = await supabaseAny
            .from('campaigns')
            .update({ status: 'funded' })
            .eq('id', metadata.campaign_id);

          if (campaignError) {
            console.error('[Tier Rewards Webhook] Failed to update campaign status:', campaignError);
          }
        }
      }
    }
    
    console.log(`[Tier Rewards Webhook] Successfully processed campaign tier purchase for user ${metadata.user_id}`);
    return { success: true };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Tier Rewards Webhook] Error processing campaign tier purchase:', error);
    return { success: false, error: errMsg };
  }
}

// Process payment_intent.payment_failed events
async function processPaymentIntentFailed(event: Stripe.Event): Promise<{ success: boolean; error?: string }> {
  try {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    console.log(`[Tier Rewards Webhook] Processing payment_intent.payment_failed: ${paymentIntent.id}`);
    
    // Mark transaction as failed
    const { error: updateError } = await supabase
      .from('upgrade_transactions')
      .update({ 
        status: 'failed',
        metadata: { 
          failure_reason: paymentIntent.last_payment_error?.message || 'Payment failed',
          failed_at: new Date().toISOString()
        }
      })
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .eq('status', 'pending');
    
    if (updateError) {
      console.error('[Tier Rewards Webhook] Error updating failed transaction:', updateError);
      return { success: false, error: `Database error: ${updateError.message}` };
    }
    
    console.log(`[Tier Rewards Webhook] Marked transaction as failed for payment intent ${paymentIntent.id}`);
    return { success: true };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Tier Rewards Webhook] Error processing payment_intent.payment_failed:', error);
    return { success: false, error: errMsg };
  }
}

// Process campaign failure refunds (new for campaigns MVP)
async function processCampaignFailureRefunds(campaignId: string): Promise<{ success: boolean; error?: string; refundedCount?: number }> {
  try {
    console.log(`[Tier Rewards Webhook] Processing campaign failure refunds for campaign: ${campaignId}`);
    
    // Get all paid participants for this campaign that haven't been refunded
    const { data: participants, error: participantsError } = await supabaseAny
      .from('reward_claims')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('claim_method', 'upgrade_purchased')
      .eq('refund_status', 'none');
      
    if (participantsError) {
      console.error('[Tier Rewards Webhook] Error fetching campaign participants:', participantsError);
      return { success: false, error: `Database error: ${participantsError.message}` };
    }
    
    if (!participants || participants.length === 0) {
      console.log(`[Tier Rewards Webhook] No participants found for campaign ${campaignId}`);
      return { success: true, refundedCount: 0 };
    }
    
    const stripe = getStripe();
    let refundedCount = 0;
    const errors: string[] = [];
    
    // Process refunds for each participant
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
            participation_id: participant.id
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
          console.error(`[Tier Rewards Webhook] Failed to update refund status for participant ${participant.id}:`, updateError);
          errors.push(`Failed to update refund status for participant ${participant.id}`);
        } else {
          refundedCount++;
          console.log(`[Tier Rewards Webhook] Refunded $${participant.paid_price_cents/100} to user ${participant.user_id}`);
        }
        
      } catch (refundError: unknown) {
        const errMsg = refundError instanceof Error ? refundError.message : String(refundError);
        console.error(`[Tier Rewards Webhook] Refund failed for participant ${participant.id}:`, refundError);
        
        // Mark refund as failed for manual review
        await supabaseAny
          .from('reward_claims')
          .update({
            refund_status: 'failed',
            refunded_at: new Date().toISOString()
          })
          .eq('id', participant.id);
          
        errors.push(`Refund failed for participant ${participant.id}: ${errMsg}`);
      }
    }
    
    // Mark campaign as failed
    const { error: campaignUpdateError } = await supabaseAny
      .from('tier_rewards')
      .update({ 
        campaign_status: 'campaign_failed' 
      })
      .eq('campaign_id', campaignId);
      
    if (campaignUpdateError) {
      console.error('[Tier Rewards Webhook] Failed to mark campaign as failed:', campaignUpdateError);
      errors.push('Failed to mark campaign as failed');
    }
    
    if (errors.length > 0) {
      return { 
        success: false, 
        error: `Some refunds failed: ${errors.join('; ')}`,
        refundedCount 
      };
    }
    
    console.log(`[Tier Rewards Webhook] Successfully processed ${refundedCount} refunds for campaign ${campaignId}`);
    return { success: true, refundedCount };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Tier Rewards Webhook] Error processing campaign failure refunds:', error);
    return { success: false, error: errMsg };
  }
}

// Process checkout.session.completed events (enhanced for campaigns)
async function processCheckoutSessionCompleted(event: Stripe.Event): Promise<{ success: boolean; error?: string }> {
  try {
    const session = event.data.object as Stripe.Checkout.Session;
    
    console.log(`[Tier Rewards Webhook] Processing checkout.session.completed: ${session.id}`);
    
    // Check if this is a campaign purchase (all types)
    const sessionType = session.metadata?.type;
    if (sessionType === 'credit_purchase' || sessionType === 'direct_credit_purchase' || sessionType === 'campaign_tier_purchase') {
      return await processCampaignTierPurchase(session);
    }
    
    // Existing tier reward processing logic
    // Get the payment intent from the session
    let paymentIntentId = session.payment_intent as string;
    
    // If payment intent is not directly available, fetch the session with expanded data
    if (!paymentIntentId) {
      try {
        const stripe = getStripe();
        const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['payment_intent']
        });
        
        if (expandedSession.payment_intent && typeof expandedSession.payment_intent === 'object') {
          paymentIntentId = expandedSession.payment_intent.id;
        }
      } catch (fetchError: unknown) {
        const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.error(`[Tier Rewards Webhook] Failed to fetch expanded session: ${errMsg}`);
        return { success: false, error: `Failed to retrieve payment intent: ${errMsg}` };
      }
    }
    
    if (!paymentIntentId) {
      const error = `No payment intent found for checkout session: ${session.id}`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    // Find the upgrade transaction by session ID
    const { data: transaction, error: transactionError } = await supabaseAny
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_session_id', session.id)
      .single();
    
    if (transactionError || !transaction) {
      const error = `Upgrade transaction not found for checkout session: ${session.id}`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    // Update transaction with payment intent if missing
    if (!transaction.stripe_payment_intent_id && paymentIntentId) {
      const { error: updateError } = await supabaseAny
        .from('upgrade_transactions')
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq('id', transaction.id);
        
      if (updateError) {
        console.error('[Tier Rewards Webhook] Failed to update payment intent on transaction:', updateError);
      } else {
        console.log(`[Tier Rewards Webhook] Updated transaction ${transaction.id} with payment intent ${paymentIntentId}`);
      }
    }
    
    // Only process pending transactions
    if (transaction.status !== 'pending') {
      console.log(`[Tier Rewards Webhook] Transaction ${transaction.id} has status '${transaction.status}', skipping (only processing pending transactions)`);
      return { success: true };
    }

    // Verify payment amount matches the stored transaction
    const expectedAmountCents = transaction.amount_cents;
    const sessionAmountTotal = session.amount_total || 0;
    
    if (sessionAmountTotal !== expectedAmountCents) {
      const error = `Session amount mismatch for transaction ${transaction.id}: received ${sessionAmountTotal} cents, expected ${expectedAmountCents} cents`;
      console.error('[Tier Rewards Webhook]', error);
      return { success: false, error };
    }
    
    // Process the upgrade using the same RPC as payment_intent.succeeded
    const { error: processError } = await supabaseAny.rpc('process_successful_upgrade_by_session', {
      p_session_id: session.id,
      p_payment_intent_id: paymentIntentId
    });
    
    if (processError) {
      console.error('[Tier Rewards Webhook] Database error processing upgrade by session:', processError);
      return { success: false, error: `Database error: ${processError.message}` };
    }
    
    console.log(`[Tier Rewards Webhook] Successfully processed checkout session ${session.id} for transaction ${transaction.id}`);
    return { success: true };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Tier Rewards Webhook] Error processing checkout.session.completed:', error);
    return { success: false, error: errMsg };
  }
}

// Main webhook handler with idempotency and error handling
export async function POST(request: NextRequest) {
  console.log('[Tier Rewards Webhook] Received request');
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('[Tier Rewards Webhook] Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }
    
    // Verify webhook signature
    console.log('[Tier Rewards Webhook] Verifying signature...');
    const event = await verifyWebhookEvent(rawBody, signature);
    if (!event) {
      console.log('[Tier Rewards Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    console.log('[Tier Rewards Webhook] Signature verified, event type:', event.type);
    
    console.log(`[Tier Rewards Webhook] Received event: ${event.type} (${event.id})`);
    
    // Check for idempotency - has this event been processed before?
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed_at, processing_attempts, claimed_at')
      .eq('stripe_event_id', event.id)
      .single();
    
    if (existingError && existingError.code !== 'PGRST116') {
      console.error('[Tier Rewards Webhook] Error checking existing event:', existingError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (existingEvent) {
      if (existingEvent.processed_at) {
        console.log(`[Tier Rewards Webhook] Event ${event.id} already processed, skipping`);
        return NextResponse.json({ received: true });
      }
      
      // Try to claim the event for processing (prevent concurrent processing)
      const { data: claimedEvent, error: claimError } = await supabase
        .from('webhook_events')
        .update({ 
          processing_attempts: existingEvent.processing_attempts + 1,
          claimed_at: new Date().toISOString(),
          event_data: event
        })
        .eq('stripe_event_id', event.id)
        .eq('processed_at', null)
        .eq('claimed_at', null)
        .select()
        .single();
        
      if (claimError || !claimedEvent) {
        console.log(`[Tier Rewards Webhook] Event ${event.id} already being processed by another instance`);
        return NextResponse.json({ received: true });
      }
    } else {
      // Insert new event record and claim it for processing
      const { data: newEvent, error: insertError } = await supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          event_data: event,
          processing_attempts: 1,
          claimed_at: new Date().toISOString(),
          processed_at: null
        })
        .select()
        .single();
      
      if (insertError) {
        // Handle race condition - another instance may have inserted it
        if (insertError.code === '23505') { // Unique constraint violation
          console.log(`[Tier Rewards Webhook] Event ${event.id} being processed by another instance`);
          return NextResponse.json({ received: true });
        }
        
        console.error('[Tier Rewards Webhook] Failed to insert webhook event:', insertError);
        return NextResponse.json({ error: 'Failed to track webhook event' }, { status: 500 });
      }
    }
    
    // Process the webhook based on event type
    let processingResult: { success: boolean; error?: string };
    
    switch (event.type) {
      case 'payment_intent.succeeded':
        processingResult = await processPaymentIntentSucceeded(event);
        break;
        
      case 'payment_intent.payment_failed':
        processingResult = await processPaymentIntentFailed(event);
        break;
        
      case 'checkout.session.completed':
        console.log('[Tier Rewards Webhook] Processing checkout.session.completed event');
        processingResult = await processCheckoutSessionCompleted(event);
        console.log('[Tier Rewards Webhook] Checkout processing result:', processingResult);
        break;
        
      default:
        console.log(`[Tier Rewards Webhook] Ignoring event type: ${event.type}`);
        processingResult = { success: true };
    }
    
    // Update webhook event record based on processing result
    const updateData = processingResult.success 
      ? { 
          processed_at: new Date().toISOString(),
          last_error: null
        }
      : { 
          last_error: processingResult.error || 'Unknown processing error'
        };
    
    const { error: finalUpdateError } = await supabase
      .from('webhook_events')
      .update(updateData)
      .eq('stripe_event_id', event.id);
    if (finalUpdateError) {
      console.error('[Tier Rewards Webhook] Failed to update webhook event final state:', finalUpdateError);
      return NextResponse.json({ error: 'Failed to finalize webhook event' }, { status: 500 });
    }
    
    if (processingResult.success) {
      console.log(`[Tier Rewards Webhook] Successfully processed event ${event.id}`);
      return NextResponse.json({ received: true });
    } else {
      console.error(`[Tier Rewards Webhook] Failed to process event ${event.id}:`, processingResult.error);
      return NextResponse.json({ 
        error: 'Event processing failed', 
        details: processingResult.error 
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[Tier Rewards Webhook] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed',
      message: 'An unexpected error occurred'
    }, { status: 500 });
  }
}
