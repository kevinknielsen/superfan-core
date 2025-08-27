/**
 * Stripe Integration for Points Purchasing
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-10-28.acacia',
});

/**
 * Create a Stripe checkout session for points purchase
 */
export async function createPointsPurchaseSession({
  communityId,
  communityName,
  points,
  bonusPoints = 0,
  usdCents,
  unitSellCents,
  unitSettleCents,
  successUrl,
  cancelUrl,
}: {
  communityId: string;
  communityName: string;
  points: number;
  bonusPoints?: number;
  usdCents: number;
  unitSellCents: number;
  unitSettleCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  const totalPoints = points + bonusPoints;
  const displayName = bonusPoints > 0 
    ? `${points.toLocaleString()} Points + ${bonusPoints.toLocaleString()} Bonus`
    : `${points.toLocaleString()} Points`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${displayName} - ${communityName}`,
          description: `Purchase points for ${communityName} community`,
          metadata: {
            type: 'points_purchase',
            community_id: communityId,
          },
        },
        unit_amount: usdCents,
      },
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'points_purchase',
      community_id: communityId,
      points: points.toString(),
      bonus_points: bonusPoints.toString(),
      unit_sell_cents: unitSellCents.toString(),
      unit_settle_cents: unitSettleCents.toString(),
    },
    payment_intent_data: {
      metadata: {
        type: 'points_purchase',
        community_id: communityId,
        points: points.toString(),
        bonus_points: bonusPoints.toString(),
        unit_sell_cents: unitSellCents.toString(),
        unit_settle_cents: unitSettleCents.toString(),
      },
    },
  });

  if (!session.url) {
    throw new Error('Failed to create Stripe checkout session');
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Verify webhook signature and parse event
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  endpointSecret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(body, signature, endpointSecret);
}

/**
 * Process checkout session completed event
 */
export function processCheckoutSessionCompleted(session: Stripe.Checkout.Session): {
  type: 'points_purchase';
  communityId: string;
  points: number;
  bonusPoints: number;
  unitSellCents: number;
  unitSettleCents: number;
  usdGrossCents: number;
  sessionId: string;
} | null {
  // Verify this is a points purchase
  if (session.metadata?.type !== 'points_purchase') {
    return null;
  }

  const { metadata } = session;
  
  if (!metadata.community_id || !metadata.points) {
    throw new Error('Invalid points purchase session metadata');
  }

  return {
    type: 'points_purchase',
    communityId: metadata.community_id,
    points: parseInt(metadata.points, 10),
    bonusPoints: parseInt(metadata.bonus_points || '0', 10),
    unitSellCents: parseInt(metadata.unit_sell_cents || '0', 10),
    unitSettleCents: parseInt(metadata.unit_settle_cents || '0', 10),
    usdGrossCents: session.amount_total || 0,
    sessionId: session.id,
  };
}

/**
 * Handle refund for points purchase
 */
export async function refundPointsPurchase(
  paymentIntentId: string,
  amountCents?: number,
  reason: string = 'requested_by_customer'
): Promise<Stripe.Refund> {
  return await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents, // undefined means full refund
    reason,
  });
}

/**
 * Get payment intent details
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Create a customer for recurring transactions (optional)
 */
export async function createCustomer({
  email,
  name,
  metadata = {},
}: {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Customer> {
  return await stripe.customers.create({
    email,
    name,
    metadata,
  });
}
