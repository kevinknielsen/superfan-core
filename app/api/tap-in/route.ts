import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../supabase";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;
import { verifyUnifiedAuth } from "../auth";
import { type } from "arktype";

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

// Status thresholds (from memo)
const STATUS_THRESHOLDS = {
  cadet: 0,
  resident: 500,
  headliner: 1500,
  superfan: 4000
};

function calculateStatus(points: number): string {
  if (points >= STATUS_THRESHOLDS.superfan) return 'superfan';
  if (points >= STATUS_THRESHOLDS.headliner) return 'headliner';
  if (points >= STATUS_THRESHOLDS.resident) return 'resident';
  return 'cadet';
}

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
    const { data: club, error: clubError } = await supabaseAny
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
    let { data: membership, error: membershipError } = await supabaseAny
      .from('club_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', tapInData.club_id)
      .single();

    if (membershipError && membershipError.code === 'PGRST116') {
      // Create membership if it doesn't exist
      const { data: newMembership, error: createError } = await supabaseAny
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

    // Determine points to award
    const pointsToAward = tapInData.points_earned || 
      (tapInData.source in POINT_VALUES ? POINT_VALUES[tapInData.source as keyof typeof POINT_VALUES] : POINT_VALUES.default);
    const newTotalPoints = membership.points + pointsToAward;
    const newStatus = calculateStatus(newTotalPoints);
    const oldStatus = membership.current_status;

    // Start transaction
    const { data: tapIn, error: tapInError } = await supabaseAny
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

    // Update membership points and status
    const { data: updatedMembership, error: updateError } = await supabaseAny
      .from('club_memberships')
      .update({
        points: newTotalPoints,
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

    // Add to points ledger
    const { error: ledgerError } = await supabaseAny
      .from('points_ledger')
      .insert({
        user_id: user.id,
        club_id: tapInData.club_id,
        delta: pointsToAward,
        reason: 'tap_in',
        reference_id: tapIn.id
      });

    if (ledgerError) {
      console.error("[Tap-in API] Error creating ledger entry:", ledgerError);
      // Note: Continue despite ledger error as main operations succeeded
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
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: tapIns, error } = await supabaseAny
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