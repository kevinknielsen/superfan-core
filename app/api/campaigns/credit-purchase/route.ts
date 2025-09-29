import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { stripe } from "@/lib/stripe";

// Resilient base URL resolution
function resolveBaseUrl() {
  // Prefer explicit BASE_URL for production
  const explicit = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit;

  // Production fallback - use superfan.one for production
  if (process.env.NODE_ENV === 'production') {
    return 'https://superfan.one';
  }

  // Vercel preview deployments
  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

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
    const body = await request.json();
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

    // Calculate price: credits in cents
    const priceCents = credit_amount * 100;

    // Validate price meets Stripe minimum (50 cents)
    if (priceCents < 50) {
      return NextResponse.json({ error: 'Minimum purchase is 1 credit ($1.00)' }, { status: 400 });
    }

    // Generate stable idempotency key
    const idempotencyKey = `credit_purchase_${club_id}_${actualUserId}_${credit_amount}_${Date.now()}`;
    
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
      success_url: success_url || `${baseUrl}/dashboard?credit_purchase_success=true&club_id=${club_id}`,
      cancel_url: cancel_url || `${baseUrl}/dashboard?club_id=${club_id}`,
      metadata: {
        type: 'direct_credit_purchase',
        club_id: club_id,
        campaign_id: activeCampaign.id,
        user_id: actualUserId,
        credit_amount: credit_amount.toString(),
        price_cents: priceCents.toString(),
        idempotency_key: idempotencyKey,
        club_name: club.name,
        campaign_title: activeCampaign.title
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
