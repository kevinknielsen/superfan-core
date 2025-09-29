import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { supabase } from "../../../supabase";
import { stripe } from "@/lib/stripe";

// Resilient base URL resolution
function resolveBaseUrl() {
  // Prefer non-public server var
  const explicit = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit;

  // Vercel sets VERCEL_URL without protocol
  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  // Local dev fallback
  return 'http://localhost:3000';
}

// Type assertion for enhanced tier rewards
const supabaseAny = supabase as any;

// Purchase a tier with instant discount
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: tierRewardId } = await params;

  // Resolve base URL safely
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'BASE_URL is not configured' }, { status: 500 });
  }

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
    
    const userTier = userTierData?.[0]?.effective_tier || userTierData?.[0]?.earned_tier || 'cadet';

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

    // Detect if this is a credit campaign purchase (1 credit = $1 = 100 cents)
    const isCreditCampaign = tierReward.is_ticket_campaign && tierReward.campaign_id;
    
    // Calculate pricing based on campaign type
    let upgradePriceCents: number;
    let discountPercentage = 0;
    let discountCents = 0;
    let finalPriceCents: number;
    let creditCost = 0;
    
    if (isCreditCampaign) {
      // Validate credit_cost for credit campaigns
      if (!tierReward.ticket_cost || !Number.isInteger(tierReward.ticket_cost) || tierReward.ticket_cost <= 0) {
        return NextResponse.json({ 
          error: 'Invalid credit campaign: credit_cost must be a positive integer' 
        }, { status: 400 });
      }
      creditCost = tierReward.ticket_cost; // DB field ticket_cost maps to credit_cost
      
      // Credit campaign pricing: 1 credit = $1 = 100 cents (no discounts)
      upgradePriceCents = creditCost * 100; // e.g., 9 credits = 900 cents = $9.00
      discountPercentage = 0;
      discountCents = 0;
      finalPriceCents = upgradePriceCents;
    } else {
      // Regular tier reward pricing with discounts
      upgradePriceCents = Number(tierReward.upgrade_price_cents);
      if (!upgradePriceCents || upgradePriceCents <= 0 || !isFinite(upgradePriceCents)) {
        return NextResponse.json({ error: 'Invalid tier pricing - upgrade price not set' }, { status: 400 });
      }
      
      // Calculate percentage-based discount
      discountPercentage = getDiscountPercentage(userTier, tierReward);
      discountCents = Math.round(upgradePriceCents * discountPercentage / 100);
      finalPriceCents = Math.max(0, upgradePriceCents - discountCents);
    }
    
    // Validate final price meets Stripe minimum (50 cents)
    if (finalPriceCents < 50) {
      return NextResponse.json({ error: 'Final price too low - minimum $0.50 required' }, { status: 400 });
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
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        type: isCreditCampaign ? 'credit_purchase' : 'campaign_tier_purchase',
        tier_reward_id: tierRewardId,
        campaign_id: tierReward.campaign_id || '',
        user_id: actualUserId,
        user_tier: userTier,
        original_price_cents: upgradePriceCents.toString(),
        discount_cents: discountCents.toString(),
        final_price_cents: finalPriceCents.toString(),
        campaign_credit_cents: upgradePriceCents.toString(), // Campaign gets full value
        idempotency_key: idempotencyKey,
        club_name: tierReward.clubs.name,
        // Credit campaign metadata (1 credit = $1)
        is_credit_campaign: isCreditCampaign.toString(),
        credit_cost: creditCost.toString(),
        credits_purchased: isCreditCampaign ? creditCost.toString() : '0'
      }
    }, {
      idempotencyKey // Pass to Stripe for true idempotency
    });
    
    return NextResponse.json({
      stripe_session_url: session.url,
      final_price_cents: finalPriceCents,
      discount_applied_cents: discountCents,
      discount_percentage: discountPercentage,
      original_price_cents: upgradePriceCents,
      campaign_credit_cents: upgradePriceCents,
      // Credit campaign information (1 credit = $1)
      is_credit_campaign: isCreditCampaign,
      credit_cost: creditCost,
      credits_purchased: isCreditCampaign ? creditCost : 0
    });

  } catch (error) {
    console.error('Error creating tier purchase:', error);
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 });
  }
}

function getDiscountPercentage(userTier: string, tierReward: any): number {
  // Helper function to get tier rank for comparison
  const getTierRank = (tier: string): number => {
    const ranks = { cadet: 0, resident: 1, headliner: 2, superfan: 3 };
    return ranks[tier as keyof typeof ranks] || 0;
  };

  const userRank = getTierRank(userTier);
  const rewardRank = getTierRank(tierReward.tier);
  
  // Only apply discount if user tier >= reward tier
  if (userRank < rewardRank) {
    return 0;
  }

  switch (userTier) {
    case 'resident': 
      return tierReward.resident_discount_percentage !== null && tierReward.resident_discount_percentage !== undefined 
        ? Number(tierReward.resident_discount_percentage) 
        : 10.0;
    case 'headliner': 
      return tierReward.headliner_discount_percentage !== null && tierReward.headliner_discount_percentage !== undefined 
        ? Number(tierReward.headliner_discount_percentage) 
        : 15.0;
    case 'superfan': 
      return tierReward.superfan_discount_percentage !== null && tierReward.superfan_discount_percentage !== undefined 
        ? Number(tierReward.superfan_discount_percentage) 
        : 25.0;
    default: 
      return 0;
  }
}
