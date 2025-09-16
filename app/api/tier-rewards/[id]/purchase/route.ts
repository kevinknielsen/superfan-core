import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { supabase } from "../../../supabase";
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Type assertion for enhanced tier rewards
const supabaseAny = supabase as any;

// Purchase a tier with instant discount
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tierRewardId = params.id;

  try {
    // Get authenticated user (don't trust request body for user_tier)
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get tier reward with error handling
    const { data: tierReward, error } = await supabaseAny
      .from('tier_rewards')
      .select(`
        *,
        clubs!inner(
          id,
          name
        )
      `)
      .eq('id', tierRewardId)
      .single();
      
    if (error || !tierReward) {
      console.error('Tier reward not found:', error);
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    // Check if tier is active and available
    if (!tierReward.is_active) {
      return NextResponse.json({ error: 'Tier is not active' }, { status: 400 });
    }

    // Get user's actual earned tier from database (server-side validation)
    const { data: userTierData, error: tierError } = await supabaseAny
      .rpc('check_tier_qualification', {
        p_user_id: actualUserId,
        p_club_id: tierReward.club_id,
        p_target_tier: 'superfan',
        p_rolling_window_days: 60
      });
      
    if (tierError) {
      console.error('Error checking user tier:', tierError);
      return NextResponse.json({ error: 'Failed to validate user tier' }, { status: 500 });
    }
    
    const userTier = userTierData?.[0]?.earned_tier || 'cadet';

    // Check if user already claimed this reward
    const { data: existingClaim } = await supabaseAny
      .from('reward_claims')
      .select('id')
      .eq('user_id', actualUserId)
      .eq('reward_id', tierRewardId)
      .single();

    if (existingClaim) {
      return NextResponse.json({ error: 'You have already claimed this tier' }, { status: 400 });
    }

    // Calculate percentage-based discount
    const discountPercentage = getDiscountPercentage(userTier, tierReward);
    const discountCents = Math.round(tierReward.upgrade_price_cents * discountPercentage / 100);
    const finalPriceCents = tierReward.upgrade_price_cents - discountCents;
    
    // Validate final price is positive
    if (finalPriceCents <= 0) {
      return NextResponse.json({ error: 'Invalid pricing calculation' }, { status: 400 });
    }
    
    // Generate stable idempotency key
    const idempotencyKey = `tier_purchase_${tierRewardId}_${actualUserId}`;
    
    // Create Stripe session - charge discounted amount immediately
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: tierReward.title,
            description: discountCents > 0 ? 
              `${tierReward.description || tierReward.title} (${discountPercentage}% ${userTier} discount)` : 
              (tierReward.description || tierReward.title)
          },
          unit_amount: finalPriceCents // Charge discounted amount
        },
        quantity: 1
      }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,
      metadata: {
        type: 'campaign_tier_purchase',
        tier_reward_id: tierRewardId,
        campaign_id: tierReward.campaign_id || '',
        user_id: actualUserId,
        user_tier: userTier,
        original_price_cents: tierReward.upgrade_price_cents.toString(),
        discount_cents: discountCents.toString(),
        final_price_cents: finalPriceCents.toString(),
        campaign_credit_cents: tierReward.upgrade_price_cents.toString(), // Campaign gets full value
        idempotency_key: idempotencyKey,
        club_name: tierReward.clubs.name
      }
    }, {
      idempotencyKey // Pass to Stripe for true idempotency
    });
    
    return NextResponse.json({
      stripe_session_url: session.url,
      final_price_cents: finalPriceCents,
      discount_applied_cents: discountCents,
      discount_percentage: discountPercentage,
      original_price_cents: tierReward.upgrade_price_cents,
      campaign_credit_cents: tierReward.upgrade_price_cents
    });

  } catch (error) {
    console.error('Error creating tier purchase:', error);
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 });
  }
}

function getDiscountPercentage(userTier: string, tierReward: any): number {
  switch (userTier) {
    case 'resident': return tierReward.resident_discount_percentage || 10.0;
    case 'headliner': return tierReward.headliner_discount_percentage || 15.0;
    case 'superfan': return tierReward.superfan_discount_percentage || 25.0;
    default: return 0;
  }
}
