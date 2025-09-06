import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('clubId');

  if (!clubId) {
    return NextResponse.json({ error: "Club ID is required" }, { status: 400 });
  }

  try {
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      console.error("[Redemptions API] User not found");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's redemptions for this club with proper scoping
    const { data: redemptions, error: redemptionsError } = await supabaseAny
      .from('redemptions')
      .select(`
        id,
        unlock_id,
        status,
        redeemed_at,
        metadata,
        unlocks!inner (
          id,
          club_id,
          title,
          description,
          type,
          rules
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'completed'])
      .eq('unlocks.club_id', clubId)
      .order('redeemed_at', { ascending: false });

    if (redemptionsError) {
      console.error("[Redemptions API] Error fetching redemptions:", redemptionsError);
      return NextResponse.json({ error: "Failed to fetch redemptions" }, { status: 500 });
    }

    // Data already scoped by club via inner join; keep all rows
    const clubRedemptions = redemptions ?? [];

    console.log(`[Redemptions API] Found ${clubRedemptions.length} redemptions for user ${user.id} in club ${clubId}`);

    return NextResponse.json({
      success: true,
      redemptions: clubRedemptions
    });

  } catch (error) {
    console.error("[Redemptions API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
