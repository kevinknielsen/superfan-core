import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../../auth";
import { supabase } from "../../../../../supabase";
import { type } from "arktype";
import Stripe from "stripe";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Validation schema for upgrade purchase
const upgradeRequestSchema = type({
  purchase_type: "'tier_boost'|'direct_unlock'",
  success_url: "string",
  cancel_url: "string"
});

// Purchase upgrade pack or direct unlock
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; reward_id: string } }
) {
  const { id: clubId, reward_id: rewardId } = await params;

  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const upgradeData = upgradeRequestSchema(body);

    if (upgradeData instanceof type.errors) {
      console.error("[Tier Rewards Upgrade API] Invalid request body:", upgradeData);
      return NextResponse.json(
        { error: "Invalid request body", details: upgradeData.summary },
        { status: 400 }
      );
    }

    // Get the reward details
    const { data: reward, error: rewardError } = await supabaseAny
      .from('tier_rewards')
      .select(`
        id,
        club_id,
        title,
        description,
        tier,
        reward_type,
        upgrade_price_cents,
        inventory_limit,
        inventory_claimed,
        is_active,
        metadata
      `)
      .eq('id', rewardId)
      .eq('club_id', clubId)
      .single();

    if (rewardError) {
      if (rewardError.code === 'PGRST116') {
        return NextResponse.json({ error: "Reward not found" }, { status: 404 });
      }
      console.error('Error fetching reward:', rewardError);
      return NextResponse.json({ error: "Failed to fetch reward" }, { status: 500 });
    }

    // Validate reward is available for purchase
    if (!reward.is_active) {
      return NextResponse.json({ error: "Reward is not active" }, { status: 400 });
    }

    if (!reward.upgrade_price_cents || reward.upgrade_price_cents <= 0) {
      return NextResponse.json({ error: "Reward is not available for purchase" }, { status: 400 });
    }

    // Check inventory
    if (reward.inventory_limit && reward.inventory_claimed >= reward.inventory_limit) {
      return NextResponse.json({ error: "Reward is sold out" }, { status: 409 });
    }

    // Check if user already claimed this reward
    const { data: existingClaim, error: claimError } = await supabaseAny
      .from('reward_claims')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('reward_id', rewardId)
      .single();

    if (claimError && claimError.code !== 'PGRST116') {
      console.error('Error checking existing claims:', claimError);
      return NextResponse.json({ error: "Failed to check existing claims" }, { status: 500 });
    }

    if (existingClaim) {
      return NextResponse.json({ error: "You have already claimed this reward" }, { status: 409 });
    }

    // Get user's current tier qualification
    const { data: qualification, error: qualificationError } = await supabaseAny
      .rpc('check_tier_qualification', {
        p_user_id: auth.userId,
        p_club_id: clubId,
        p_target_tier: reward.tier,
        p_rolling_window_days: 60
      });

    if (qualificationError) {
      console.error('Error checking tier qualification:', qualificationError);
      return NextResponse.json({ error: "Failed to check tier qualification" }, { status: 500 });
    }

    const userQualification = qualification?.[0];
    if (!userQualification) {
      return NextResponse.json({ error: "Failed to determine user qualification" }, { status: 500 });
    }

    // Get current quarter
    const { data: currentQuarter, error: quarterError } = await supabaseAny
      .rpc('get_current_quarter');

    if (quarterError) {
      console.error('Error getting current quarter:', quarterError);
      return NextResponse.json({ error: "Failed to get current quarter" }, { status: 500 });
    }

    const quarter = currentQuarter?.[0];
    if (!quarter) {
      return NextResponse.json({ error: "Failed to determine current quarter" }, { status: 500 });
    }

    // For tier_boost purchases, check if user already has a boost for this quarter
    if (upgradeData.purchase_type === 'tier_boost') {
      const { data: existingBoost, error: boostError } = await supabaseAny
        .from('temporary_tier_boosts')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('club_id', clubId)
        .eq('quarter_year', quarter.year)
        .eq('quarter_number', quarter.quarter)
        .single();

      if (boostError && boostError.code !== 'PGRST116') {
        console.error('Error checking existing boost:', boostError);
        return NextResponse.json({ error: "Failed to check existing boost" }, { status: 500 });
      }

      if (existingBoost) {
        return NextResponse.json({ 
          error: "You already have a tier boost for this quarter" 
        }, { status: 409 });
      }
    }

    // Get club details for product naming
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('name')
      .eq('id', clubId)
      .single();

    if (clubError) {
      console.error('Error fetching club:', clubError);
      return NextResponse.json({ error: "Failed to fetch club details" }, { status: 500 });
    }

    // Create product name and description
    const productName = upgradeData.purchase_type === 'tier_boost' 
      ? `${reward.tier.charAt(0).toUpperCase() + reward.tier.slice(1)} Boost (Q${quarter.quarter} ${quarter.year}) - ${reward.title}`
      : `Direct Unlock - ${reward.title}`;
      
    const productDescription = upgradeData.purchase_type === 'tier_boost'
      ? `Temporary ${reward.tier} access for one free claim this quarter in ${club.name}`
      : `Unlock "${reward.title}" in ${club.name}`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            description: productDescription,
            metadata: {
              type: 'tier_upgrade',
              reward_id: rewardId,
              club_id: clubId,
              purchase_type: upgradeData.purchase_type
            }
          },
          unit_amount: reward.upgrade_price_cents
        },
        quantity: 1
      }],
      success_url: upgradeData.success_url,
      cancel_url: upgradeData.cancel_url,
      customer_email: auth.userId, // Use user ID as customer reference
      metadata: {
        type: 'tier_upgrade',
        user_id: auth.userId,
        reward_id: rewardId,
        club_id: clubId,
        user_tier: userQualification.earned_tier,
        user_points: userQualification.current_points.toString(),
        target_tier: reward.tier,
        purchase_type: upgradeData.purchase_type,
        quarter_year: quarter.year.toString(),
        quarter_number: quarter.quarter.toString()
      }
    });

    // Store pending transaction
    const { data: transaction, error: transactionError } = await supabaseAny
      .from('upgrade_transactions')
      .insert({
        user_id: auth.userId,
        club_id: clubId,
        reward_id: rewardId,
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_session_id: session.id,
        amount_cents: reward.upgrade_price_cents,
        purchase_type: upgradeData.purchase_type,
        user_tier_at_purchase: userQualification.earned_tier,
        user_points_at_purchase: userQualification.current_points,
        target_tier: reward.tier,
        status: 'pending'
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Error creating transaction record:', transactionError);
      // Cancel the Stripe session since we couldn't track it
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error('Error expiring Stripe session:', expireError);
      }
      return NextResponse.json({ error: "Failed to create transaction record" }, { status: 500 });
    }

    console.log(`[Tier Rewards Upgrade API] Created ${upgradeData.purchase_type} checkout for user ${auth.userId}, reward ${rewardId}`);

    // Prepare boost details for tier_boost purchases
    let boostDetails = undefined;
    if (upgradeData.purchase_type === 'tier_boost') {
      const quarterEnd = new Date(quarter.year, quarter.quarter * 3, 0, 23, 59, 59); // Last day of quarter
      boostDetails = {
        boosted_tier: reward.tier,
        expires_at: quarterEnd.toISOString(),
        quarter: {
          year: quarter.year,
          quarter: quarter.quarter
        }
      };
    }

    return NextResponse.json({
      stripe_session_id: session.id,
      stripe_session_url: session.url,
      upgrade_amount_cents: reward.upgrade_price_cents,
      purchase_type: upgradeData.purchase_type,
      boost_details: boostDetails,
      transaction_id: transaction.id
    });

  } catch (error) {
    console.error("[Tier Rewards Upgrade API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
