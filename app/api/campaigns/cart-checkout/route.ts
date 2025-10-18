import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { stripe } from "@/lib/stripe";
import { randomUUID } from "crypto";

// Resilient base URL resolution
function resolveBaseUrl() {
  const explicit = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit;

  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return 'https://superfan.one';
  }

  return 'http://localhost:3000';
}

const supabaseAny = supabase as any;

/**
 * POST /api/campaigns/cart-checkout
 * Create a unified Stripe checkout session for cart items (credits + tier rewards)
 */
export async function POST(request: NextRequest) {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'BASE_URL is not configured' }, { status: 500 });
  }

  try {
    // Get authenticated user
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as {
      club_id: string;
      total_credits: number;
      items: Array<{
        tier_reward_id: string;
        quantity: number;
        final_price_cents?: number;
        original_price_cents?: number;
        discount_cents?: number;
        campaign_id?: string;
      }>;
      success_url: string;
      cancel_url: string;
    };
    
    const { club_id, total_credits, items, success_url, cancel_url } = body;

    // Validate inputs
    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (total_credits < 0 || !Number.isInteger(total_credits)) {
      return NextResponse.json({ error: 'total_credits must be a non-negative integer' }, { status: 400 });
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    if (total_credits === 0 && items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Get the user from database
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

    // Verify club exists
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('id, name')
      .eq('id', club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Build Stripe line items
    const lineItems = [];

    // Add credits as one line item
    if (total_credits > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${total_credits} Credits`,
            description: `Credits for ${club.name}`
          },
          unit_amount: total_credits * 100 // 1 credit = $1
        },
        quantity: 1
      });
    }

    // Add each tier reward item
    for (const item of items) {
      // Fetch item details
      const { data: reward } = await supabaseAny
        .from('tier_rewards')
        .select('title, description')
        .eq('id', item.tier_reward_id)
        .single();
      
      if (reward) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: reward.title,
              description: reward.description || `Item from ${club.name}`
            },
            unit_amount: item.final_price_cents || item.original_price_cents || 0
          },
          quantity: item.quantity
        });
      }
    }

    // Generate idempotency key
    const idempotencyKey = `cart_checkout_${randomUUID()}`;
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: success_url,
      cancel_url: cancel_url,
      metadata: {
        type: 'cart_checkout',
        club_id: club_id,
        user_id: user.id,
        total_credits: total_credits.toString(),
        item_count: items.length.toString(),
        items: JSON.stringify(items.map(i => ({
          id: i.tier_reward_id,
          qty: i.quantity,
          campaign_id: i.campaign_id
        }))),
        idempotency_key: idempotencyKey
      }
    }, {
      idempotencyKey
    });
    
    return NextResponse.json({
      stripe_session_url: session.url,
      total_amount: getTotalCartAmount(total_credits, items),
      item_count: lineItems.length
    });

  } catch (error) {
    console.error('Error creating cart checkout:', error);
    return NextResponse.json({ 
      error: 'Failed to create cart checkout',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getTotalCartAmount(credits: number, items: Array<{ final_price_cents?: number; original_price_cents?: number; quantity: number }>) {
  const creditsCents = credits * 100;
  const itemsCents = items.reduce((sum, item) => 
    sum + ((item.final_price_cents || item.original_price_cents || 0) * item.quantity), 0
  );
  return creditsCents + itemsCents;
}

