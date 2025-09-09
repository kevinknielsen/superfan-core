import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import Stripe from "stripe";

export const runtime = 'nodejs';

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Guarded Stripe initializer (avoid top-level init for Edge compatibility)
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

// Helper function to verify webhook signature
async function verifyWebhookSignature(
  rawBody: string | Buffer, 
  signature: string
): Promise<Stripe.Event | null> {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return null;
    }
    
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
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
    
    // Check if transaction is already processed
    if (transaction.status === 'completed') {
      console.log(`[Tier Rewards Webhook] Transaction ${transaction.id} already processed, skipping`);
      return { success: true };
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
    
  } catch (error) {
    console.error('[Tier Rewards Webhook] Error processing payment_intent.succeeded:', error);
    return { success: false, error: error.message };
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
    
  } catch (error) {
    console.error('[Tier Rewards Webhook] Error processing payment_intent.payment_failed:', error);
    return { success: false, error: error.message };
  }
}

// Main webhook handler with idempotency and error handling
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('[Tier Rewards Webhook] Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }
    
    // Verify webhook signature
    const event = await verifyWebhookSignature(rawBody, signature);
    if (!event) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    
    console.log(`[Tier Rewards Webhook] Received event: ${event.type} (${event.id})`);
    
    // Check for idempotency - has this event been processed before?
    const { data: existingEvent, error: existingError } = await supabase
      .from('webhook_events')
      .select('id, processed_at, processing_attempts')
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
      
      // Event exists but not processed - increment attempts
      const { error: attemptsUpdateError } = await supabase
        .from('webhook_events')
        .update({ 
          processing_attempts: existingEvent.processing_attempts + 1,
          event_data: event
        })
        .eq('stripe_event_id', event.id);
      if (attemptsUpdateError) {
        console.error('[Tier Rewards Webhook] Failed to increment processing_attempts:', attemptsUpdateError);
        return NextResponse.json({ error: 'Failed to update webhook attempt' }, { status: 500 });
      }
    } else {
      // Insert new event record to reserve it for processing
      const { error: insertError } = await supabase
        .from('webhook_events')
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          event_data: event,
          processing_attempts: 1,
          processed_at: null
        });
      
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
        // Additional verification - we mainly rely on payment_intent.succeeded
        console.log(`[Tier Rewards Webhook] Checkout session completed: ${event.id}`);
        processingResult = { success: true };
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
