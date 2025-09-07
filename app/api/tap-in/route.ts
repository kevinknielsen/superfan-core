import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../supabase";

import { verifyUnifiedAuth } from "../auth";
import { type } from "arktype";
import { computeStatus } from "@/lib/status";

const tapInSchema = type({
  club_id: "string",
  source: "string", // 'qr_code', 'nfc', 'link', 'show_entry', 'merch_purchase', etc.
  points_earned: "number?",
  location: "string?",
  metadata: "unknown?"
});

// Point values for different tap-in sources (from memo)
const POINT_VALUES = {
  qr_code: 20,
  nfc: 20,
  link: 10,
  show_entry: 100,
  merch_purchase: 50,
  presave: 40,
  default: 10
};

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Tap-in API] Authenticated user: ${auth.userId} (${auth.type})`);

  const body = await request.json();
  const tapInData = tapInSchema(body);

  if (tapInData instanceof type.errors) {
    console.error("[Tap-in API] Invalid request body:", tapInData);
    return NextResponse.json(
      { error: "Invalid request body", message: tapInData.summary },
      { status: 400 }
    );
  }

  try {
    // Use service client to bypass RLS for server-side operations
    const supabase = createServiceClient();
    
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      console.error("[Tap-in API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify club exists
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', tapInData.club_id)
      .eq('is_active', true)
      .single();

    if (clubError) {
      console.error("[Tap-in API] Club not found:", clubError);
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Get or create club membership
    let { data: membership, error: membershipError } = await supabase
      .from('club_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', tapInData.club_id)
      .single();

    if (membershipError && membershipError.code === 'PGRST116') {
      // Create membership if it doesn't exist
      const { data: newMembership, error: createError } = await supabase
        .from('club_memberships')
        .insert({
          user_id: user.id,
          club_id: tapInData.club_id,
          points: 0,
          current_status: 'cadet',
          status: 'active'
        })
        .select()
        .single();

      if (createError) {
        console.error("[Tap-in API] Error creating membership:", createError);
        return NextResponse.json({ error: "Failed to create membership" }, { status: 500 });
      }

      membership = newMembership;
    } else if (membershipError) {
      console.error("[Tap-in API] Error fetching membership:", membershipError);
      return NextResponse.json({ error: "Failed to fetch membership" }, { status: 500 });
    }

    // Get or create point wallet (unified system)
    let { data: wallet, error: walletError } = await supabase
      .from('point_wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', tapInData.club_id)
      .single();

    if (walletError && walletError.code === 'PGRST116') {
      // Create wallet if it doesn't exist
      const { data: newWallet, error: createWalletError } = await supabase
        .from('point_wallets')
        .insert({
          user_id: user.id,
          club_id: tapInData.club_id,
          balance_pts: 0,
          earned_pts: 0,
          purchased_pts: 0,
          spent_pts: 0,
          escrowed_pts: 0
        })
        .select()
        .single();

      if (createWalletError) {
        console.error("[Tap-in API] Error creating wallet:", createWalletError);
        return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
      }

      wallet = newWallet;
    } else if (walletError) {
      console.error("[Tap-in API] Error fetching wallet:", walletError);
      return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
    }

    // Determine points to award
    const pointsToAward = tapInData.points_earned || 
      (tapInData.source in POINT_VALUES ? POINT_VALUES[tapInData.source as keyof typeof POINT_VALUES] : POINT_VALUES.default);
    
    // Use wallet earned points for status calculation
    const newEarnedPoints = wallet.earned_pts + pointsToAward;
    const newTotalPoints = wallet.balance_pts + pointsToAward;
    const newStatus = computeStatus(newEarnedPoints); // Status based on earned points only
    const oldStatus = membership.current_status;

    // Start transaction
    const { data: tapIn, error: tapInError } = await supabase
      .from('tap_ins')
      .insert({
        user_id: user.id,
        club_id: tapInData.club_id,
        source: tapInData.source,
        points_earned: pointsToAward,
        location: tapInData.location,
        metadata: tapInData.metadata || {}
      })
      .select()
      .single();

    if (tapInError) {
      console.error("[Tap-in API] Error creating tap-in:", tapInError);
      return NextResponse.json({ error: "Failed to create tap-in" }, { status: 500 });
    }

    // Update point wallet (unified system)
    const { data: updatedWallet, error: walletUpdateError } = await supabase
      .from('point_wallets')
      .update({
        balance_pts: newTotalPoints,
        earned_pts: newEarnedPoints,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('club_id', tapInData.club_id)
      .select()
      .single();

    if (walletUpdateError) {
      console.error("[Tap-in API] Error updating wallet:", walletUpdateError);
      return NextResponse.json({ error: "Failed to update wallet" }, { status: 500 });
    }

    // Update membership status and activity
    const { data: updatedMembership, error: updateError } = await supabase
      .from('club_memberships')
      .update({
        current_status: newStatus,
        last_activity_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('club_id', tapInData.club_id)
      .select()
      .single();

    if (updateError) {
      console.error("[Tap-in API] Error updating membership:", updateError);
      return NextResponse.json({ error: "Failed to update membership" }, { status: 500 });
    }

    // Add to point transactions (unified system)
    const { error: transactionError } = await supabase
      .from('point_transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'BONUS', // Earned points from tap-in
        source: 'earned',
        pts: pointsToAward,
        ref: tapIn.id
      });

    if (transactionError) {
      console.error("[Tap-in API] Error creating transaction:", transactionError);
      // Note: Continue despite transaction error as main operations succeeded
    }

    // Return success with status change info
    const statusChanged = oldStatus !== newStatus;
    const response = {
      success: true,
      tap_in: tapIn,
      points_earned: pointsToAward,
      total_points: newTotalPoints,
      current_status: newStatus,
      previous_status: oldStatus,
      status_changed: statusChanged,
      club_name: club.name,
      membership: updatedMembership
    };

    console.log(`[Tap-in API] Success: ${pointsToAward} points awarded to user ${auth.userId} in club ${club.name}`);
    if (statusChanged) {
      console.log(`[Tap-in API] Status upgraded: ${oldStatus} → ${newStatus}`);
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error("[Tap-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get tap-in history for a user/club
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('club_id');
  const limit = parseInt(searchParams.get('limit') || '10');

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // Use service client for server-side queries
    const supabase = createServiceClient();
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: tapIns, error } = await supabase
      .from('tap_ins')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Tap-in API] Error fetching tap-ins:", error);
      return NextResponse.json({ error: "Failed to fetch tap-ins" }, { status: 500 });
    }

    return NextResponse.json(tapIns);

  } catch (error) {
    console.error("[Tap-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}