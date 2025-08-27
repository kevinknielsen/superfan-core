import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { type } from "arktype";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

const redeemSchema = type({
  unlock_id: "string",
  club_id: "string"
});

// Status point thresholds
const STATUS_POINTS: Record<string, number> = {
  cadet: 0,
  resident: 500,
  headliner: 1500,
  superfan: 4000,
};

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const redeemData = redeemSchema(body);

  if (redeemData instanceof type.errors) {
    console.error("[Unlock Redeem API] Invalid request body:", redeemData);
    return NextResponse.json(
      { error: "Invalid request body", message: redeemData.summary },
      { status: 400 }
    );
  }

  try {
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      console.error("[Unlock Redeem API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the unlock details
    const { data: unlock, error: unlockError } = await supabaseAny
      .from('unlocks')
      .select('*')
      .eq('id', redeemData.unlock_id)
      .eq('club_id', redeemData.club_id)
      .eq('is_active', true)
      .single();

    if (unlockError) {
      console.error("[Unlock Redeem API] Unlock not found:", unlockError);
      return NextResponse.json({ error: "Unlock not found or inactive" }, { status: 404 });
    }

    // Get user's club membership
    const { data: membership, error: membershipError } = await supabaseAny
      .from('club_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', redeemData.club_id)
      .eq('status', 'active')
      .single();

    if (membershipError) {
      console.error("[Unlock Redeem API] Membership not found:", membershipError);
      return NextResponse.json({ error: "You must be a member of this club" }, { status: 403 });
    }

    // Check if user has enough points for this unlock
    const requiredPoints = STATUS_POINTS[unlock.required_status] || 0;
    if (membership.points < requiredPoints) {
      return NextResponse.json({ 
        error: `Insufficient points. You need ${requiredPoints} points for ${unlock.required_status} status.`,
        required_points: requiredPoints,
        current_points: membership.points
      }, { status: 403 });
    }

    // Check if already redeemed (if we have a redemptions table)
    const { data: existingRedemption, error: redemptionCheckError } = await supabaseAny
      .from('unlock_redemptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('unlock_id', redeemData.unlock_id)
      .single();

    // If we found an existing redemption, this unlock was already used
    if (existingRedemption && !redemptionCheckError) {
      return NextResponse.json({ 
        error: "You have already redeemed this unlock" 
      }, { status: 409 });
    }

    // Check capacity limits if specified
    if (unlock.metadata?.capacity) {
      const { count: redemptionCount, error: countError } = await supabaseAny
        .from('unlock_redemptions')
        .select('*', { count: 'exact', head: true })
        .eq('unlock_id', redeemData.unlock_id);

      if (countError) {
        console.error("[Unlock Redeem API] Error checking capacity:", countError);
      } else if (redemptionCount >= unlock.metadata.capacity) {
        return NextResponse.json({ 
          error: "This unlock has reached its capacity limit" 
        }, { status: 409 });
      }
    }

    // Check expiry date if specified
    if (unlock.metadata?.expiry_date) {
      const expiryDate = new Date(unlock.metadata.expiry_date);
      if (new Date() > expiryDate) {
        return NextResponse.json({ 
          error: "This unlock has expired" 
        }, { status: 410 });
      }
    }

    // Create redemption record
    const { data: redemption, error: createError } = await supabaseAny
      .from('unlock_redemptions')
      .insert({
        user_id: user.id,
        unlock_id: redeemData.unlock_id,
        club_id: redeemData.club_id,
        redeemed_at: new Date().toISOString(),
        metadata: {
          unlock_title: unlock.title,
          unlock_type: unlock.unlock_type,
          user_status_at_redemption: membership.current_status,
          user_points_at_redemption: membership.points
        }
      })
      .select()
      .single();

    if (createError) {
      console.error("[Unlock Redeem API] Error creating redemption:", createError);
      return NextResponse.json({ error: "Failed to redeem unlock" }, { status: 500 });
    }

    console.log(`[Unlock Redeem API] User ${auth.userId} redeemed "${unlock.title}" in club ${redeemData.club_id}`);

    // Return success with redemption details
    return NextResponse.json({
      success: true,
      redemption: redemption,
      unlock: {
        title: unlock.title,
        description: unlock.description,
        unlock_type: unlock.unlock_type,
        metadata: unlock.metadata
      },
      message: `Successfully redeemed: ${unlock.title}`
    });

  } catch (error) {
    console.error("[Unlock Redeem API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
