/**
 * Stripe Integration for Points Purchasing
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
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
  userId,
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
  userId: string;
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
      user_id: userId,
      points: points.toString(),
      bonus_points: bonusPoints.toString(),
      unit_sell_cents: unitSellCents.toString(),
      unit_settle_cents: unitSettleCents.toString(),
    },
    payment_intent_data: {
      metadata: {
        type: 'points_purchase',
        community_id: communityId,
        user_id: userId,
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
  userId: string;
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
  
  if (!metadata.community_id || !metadata.points || !metadata.user_id) {
    throw new Error(`Invalid points purchase session metadata for session ${session.id}: missing community_id, points, or user_id`);
  }

  // Validate and parse numeric fields
  const points = parseInt(metadata.points, 10);
  const bonusPoints = parseInt(metadata.bonus_points || '0', 10);
  const unitSellCents = parseInt(metadata.unit_sell_cents || '0', 10);
  const unitSettleCents = parseInt(metadata.unit_settle_cents || '0', 10);
  const usdGrossCents = session.amount_total || 0;

  // Validate all numeric values
  const validationErrors: string[] = [];
  
  if (!Number.isInteger(points) || points <= 0) {
    validationErrors.push('points must be a positive integer');
  }
  
  if (!Number.isInteger(bonusPoints) || bonusPoints < 0) {
    validationErrors.push('bonus_points must be a non-negative integer');
  }
  
  if (!Number.isInteger(unitSellCents) || unitSellCents <= 0) {
    validationErrors.push('unit_sell_cents must be a positive integer');
  }
  
  if (!Number.isInteger(unitSettleCents) || unitSettleCents < 0) {
    validationErrors.push('unit_settle_cents must be a non-negative integer');
  }
  
  if (!Number.isInteger(usdGrossCents) || usdGrossCents < 0) {
    validationErrors.push('amount_total must be a non-negative integer');
  }

  if (validationErrors.length > 0) {
    throw new Error(`Invalid numeric values in session ${session.id}: ${validationErrors.join(', ')}`);
  }

  return {
    type: 'points_purchase',
    communityId: metadata.community_id,
    userId: metadata.user_id,
    points,
    bonusPoints,
    unitSellCents,
    unitSettleCents,
    usdGrossCents,
    sessionId: session.id,
  };
}

/**
 * Handle refund for points purchase
 */
export async function refundPointsPurchase(
  paymentIntentId: string,
  amountCents?: number,
  reason: Stripe.RefundCreateParams.Reason = 'requested_by_customer',
  idempotencyKey?: string
): Promise<Stripe.Refund> {
  const params: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    amount: amountCents, // undefined means full refund
    reason,
  };

  const options: Stripe.RequestOptions = {};
  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
  }

  return await stripe.refunds.create(params, options);
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
