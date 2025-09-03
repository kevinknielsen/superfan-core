import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { verifyWebhookSignature, processCheckoutSessionCompleted } from '@/lib/stripe';
import { 
  getOrCreatePointWallet, 
  updateWalletBalance, 
  calculateReserveDelta, 
  calculateUpfrontAmount,
  updateWeeklyUpfrontStats,
  PLATFORM_FEE
} from '@/lib/points';

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const event = verifyWebhookSignature(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // Check if we've already processed this event (idempotency)
    const { data: existingEvent } = await supabase
      .from('processed_stripe_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true });
    }

    // Handle checkout session completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const purchaseData = processCheckoutSessionCompleted(session);

      if (purchaseData && purchaseData.type === 'points_purchase') {
        await processPointsPurchase(purchaseData);
      }
    }

    // Mark event as processed
    await supabase
      .from('processed_stripe_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
      });

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function processPointsPurchase(data: {
  communityId: string;
  userId: string;
  points: number;
  bonusPoints: number;
  unitSellCents: number;
  unitSettleCents: number;
  usdGrossCents: number;
  sessionId: string;
}) {
  try {
    console.log('Processing points purchase:', data);
    
    // Now we have the user ID from the session metadata
    const { userId, communityId } = data;
    
    // Calculate financial breakdown
    const totalPoints = data.points + data.bonusPoints;
    const platformFeeCents = Math.round(data.usdGrossCents * PLATFORM_FEE);
    const reserveDeltaCents = calculateReserveDelta(totalPoints, data.unitSettleCents);
    const upfrontCents = calculateUpfrontAmount(data.usdGrossCents, reserveDeltaCents);

    // Credit points to user's wallet
    const wallet = await getOrCreatePointWallet(userId, communityId);
    
    // Update wallet balance with purchased points
    await updateWalletBalance(
      wallet.id,
      totalPoints,
      'PURCHASE',
      {
        unit_sell_cents: data.unitSellCents,
        unit_settle_cents: data.unitSettleCents,
        usd_gross_cents: data.usdGrossCents,
        ref: data.sessionId
      }
    );

    // Update weekly upfront stats
    await updateWeeklyUpfrontStats(
      data.communityId,
      data.usdGrossCents,
      platformFeeCents,
      reserveDeltaCents,
      upfrontCents
    );

    console.log('Points purchase completed successfully:', {
      userId,
      communityId,
      totalPoints,
      grossCents: data.usdGrossCents,
      platformFeeCents,
      reserveDeltaCents,
      upfrontCents,
    });

  } catch (error) {
    console.error('Error processing points purchase:', error);
    throw error;
  }
}


