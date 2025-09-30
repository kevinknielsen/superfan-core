import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { stripe } from "@/lib/stripe";
import { randomUUID } from "crypto";

// Resilient base URL resolution
function resolveBaseUrl() {
  // Prefer explicit BASE_URL for production
  const explicit = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit;

  // Vercel preview deployments (check first before production fallback)
  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  // Production fallback - use superfan.one only for true production
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return 'https://superfan.one';
  }

  // Local dev fallback
  return 'http://localhost:3000';
}

// Type assertion for enhanced features
const supabaseAny = supabase as any;

// Purchase credits directly
export async function POST(request: NextRequest) {
  // Resolve base URL safely
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
    const body = await request.json() as any;
    const { club_id, credit_amount, success_url, cancel_url } = body;

    // Validate inputs
    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!credit_amount || !Number.isInteger(credit_amount) || credit_amount <= 0) {
      return NextResponse.json({ error: 'credit_amount must be a positive integer' }, { status: 400 });
    }

    // Validate credit amount is reasonable (between 1 and 10000 credits)
    if (credit_amount < 1 || credit_amount > 10000) {
      return NextResponse.json({ error: 'credit_amount must be between 1 and 10000' }, { status: 400 });
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

    // Verify club exists
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('id, name')
      .eq('id', club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Find an active campaign for this club to associate credits with
    const { data: activeCampaign, error: campaignError } = await supabaseAny
      .from('campaigns')
      .select('id, title')
      .eq('club_id', club_id)
      .eq('status', 'active')
      .single();

    if (campaignError || !activeCampaign) {
      return NextResponse.json({ 
        error: 'No active campaign found for this club. Credits require an active campaign.' 
      }, { status: 400 });
    }

    // Find or create a generic "Credit Purchase" tier_reward for this campaign
    let { data: creditReward, error: creditRewardError } = await supabaseAny
      .from('tier_rewards')
      .select('id')
      .eq('campaign_id', activeCampaign.id)
      .eq('title', 'Direct Credit Purchase')
      .eq('is_ticket_campaign', true)
      .single();

    // Create generic credit reward if it doesn't exist
    if (creditRewardError || !creditReward) {
      const { data: newCreditReward, error: createError } = await supabaseAny
        .from('tier_rewards')
        .insert({
          club_id: club_id,
          campaign_id: activeCampaign.id,
          title: 'Direct Credit Purchase',
          description: 'Direct credit purchase for campaign',
          tier: 'cadet',
          reward_type: 'digital_product', // Use allowed value
          upgrade_price_cents: 100, // Base price for 1 credit
          ticket_cost: 1,
          is_ticket_campaign: true,
          is_active: true,
          metadata: {
            is_generic_credit_purchase: true,
            created_for_direct_purchases: true
          }
        })
        .select('id')
        .single();

      if (createError || !newCreditReward) {
        console.error('Failed to create generic credit reward:', createError);
        return NextResponse.json({ 
          error: 'Failed to set up credit purchase system' 
        }, { status: 500 });
      }
      
      creditReward = newCreditReward;
    }

    // Calculate price: credits in cents
    const priceCents = credit_amount * 100;

    // Validate price meets Stripe minimum (50 cents)
    if (priceCents < 50) {
      return NextResponse.json({ error: 'Minimum purchase is 1 credit ($1.00)' }, { status: 400 });
    }

    // Generate unique idempotency key for each attempt (prevents Stripe session replay)
    const idempotencyKey = `credit_purchase_${randomUUID()}`;
    
    // Create Stripe session for direct credit purchase
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credit_amount} Credits`,
            description: `${credit_amount} credits for ${club.name}`
          },
          unit_amount: priceCents
        },
        quantity: 1
      }],
      success_url: success_url || `${baseUrl.replace(/\/$/, '')}/dashboard?credit_purchase_success=true&club_id=${club_id}`,
      cancel_url: cancel_url || `${baseUrl.replace(/\/$/, '')}/dashboard?club_id=${club_id}`,
      metadata: {
        type: 'direct_credit_purchase',
        club_id: club_id,
        campaign_id: activeCampaign.id,
        user_id: actualUserId,
        tier_reward_id: creditReward.id, // Reference to generic credit purchase reward
        credit_amount: credit_amount.toString(),
        price_cents: priceCents.toString(),
        original_price_cents: priceCents.toString(),
        final_price_cents: priceCents.toString(),
        campaign_credit_cents: priceCents.toString(),
        credits_purchased: credit_amount.toString(),
        idempotency_key: idempotencyKey,
        club_name: club.name,
        campaign_title: activeCampaign.title,
        // Preserve deterministic data for correlation
        correlation_key: `${club_id}_${actualUserId}_${credit_amount}`
      },
      payment_intent_data: {
        metadata: {
          type: 'direct_credit_purchase',
          club_id: club_id,
          campaign_id: activeCampaign.id
        }
      }
    }, {
      idempotencyKey // Pass to Stripe for true idempotency
    });
    
    return NextResponse.json({
      stripe_session_url: session.url,
      credit_amount: credit_amount,
      price_cents: priceCents,
      price_dollars: credit_amount,
      campaign_id: activeCampaign.id,
      campaign_title: activeCampaign.title
    });

  } catch (error) {
    console.error('Error creating credit purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to create credit purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
