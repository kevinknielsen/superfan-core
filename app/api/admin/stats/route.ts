import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../supabase";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  if (!isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get total clubs
    const { count: totalClubs, error: clubsError } = await supabaseAny
      .from('clubs')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (clubsError) {
      console.error('Error fetching clubs count:', clubsError);
    }

    // Get total members (club memberships)
    const { count: totalMembers, error: membersError } = await supabaseAny
      .from('club_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (membersError) {
      console.error('Error fetching members count:', membersError);
    }

    // Get total tap-ins
    const { count: totalTapIns, error: tapInsError } = await supabaseAny
      .from('tap_ins')
      .select('*', { count: 'exact', head: true });

    if (tapInsError) {
      console.error('Error fetching tap-ins count:', tapInsError);
    }

    // Get total unlocks
    const { count: totalUnlocks, error: unlocksError } = await supabaseAny
      .from('unlocks')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (unlocksError) {
      console.error('Error fetching unlocks count:', unlocksError);
    }

    const stats = {
      totalClubs: totalClubs || 0,
      totalMembers: totalMembers || 0,
      totalTapIns: totalTapIns || 0,
      totalUnlocks: totalUnlocks || 0,
      timestamp: new Date().toISOString()
    };

    console.log(`[Admin Stats] Retrieved for user ${auth.userId}:`, stats);

    return NextResponse.json(stats);

  } catch (error) {
    console.error("[Admin Stats API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
