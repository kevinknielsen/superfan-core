import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../../auth";
import { supabase } from "../../../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Claim a tier reward for free (if user qualifies)
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
    // Get the user from our database (support both auth types) - same pattern as existing APIs
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('[Club Tier Rewards Claim API] User not found:', userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const actualUserId = user.id;

    // Get current quarter for tracking
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

    // Use the atomic free claim function to handle all business logic and concurrency
    const { data: claimResult, error: claimError } = await supabaseAny
      .rpc('atomic_free_claim', {
        p_user_id: actualUserId,
        p_reward_id: rewardId,
        p_club_id: clubId,
        p_quarter_year: quarter.year,
        p_quarter_number: quarter.quarter
      });

    if (claimError) {
      console.error('Error processing free claim:', claimError);
      return NextResponse.json({ 
        error: "Failed to process claim",
        message: claimError.message 
      }, { status: 500 });
    }

    const result = claimResult?.[0];
    if (!result) {
      return NextResponse.json({ 
        error: "Unexpected response from claim processing" 
      }, { status: 500 });
    }

    // Check if claim was successful
    if (!result.success) {
      const statusCode = result.error_code === 'ALREADY_CLAIMED' ? 409 :
                        result.error_code === 'QUARTER_LIMIT_EXCEEDED' ? 409 :
                        result.error_code === 'INSUFFICIENT_TIER' ? 403 :
                        result.error_code === 'SOLD_OUT' ? 409 :
                        result.error_code === 'REWARD_NOT_FOUND' ? 404 :
                        400;

      return NextResponse.json({
        error: result.error_code,
        message: result.error_message
      }, { status: statusCode });
    }

    // Get the full claim details for response
    const { data: claimDetails, error: detailsError } = await supabaseAny
      .from('reward_claims')
      .select(`
        id,
        access_code,
        claimed_at,
        tier_rewards!inner(
          title,
          description,
          reward_type,
          metadata
        )
      `)
      .eq('id', result.claim_id)
      .single();

    if (detailsError) {
      console.error('Error fetching claim details:', detailsError);
      // Claim was successful, but we couldn't get details - still return success
      return NextResponse.json({
        success: true,
        claim_id: result.claim_id,
        message: "Reward claimed successfully",
        instructions: "Check your email for access details"
      });
    }

    const reward = claimDetails.tier_rewards;
    const instructions = reward.metadata?.instructions || "Access granted - check your email for details";
    const redemptionUrl = reward.metadata?.redemption_url;

    console.log(`[Club Tier Rewards Claim API] User ${auth.userId} claimed reward ${rewardId} in club ${clubId}`);

    return NextResponse.json({
      success: true,
      claim_id: result.claim_id,
      access_code: claimDetails.access_code,
      instructions: instructions,
      redemption_url: redemptionUrl,
      message: `Successfully claimed "${reward.title}"`
    });

  } catch (error) {
    console.error("[Club Tier Rewards Claim API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
