import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../auth";
import { supabase } from "../supabase";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

// Get unlocks for a specific club
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('club_id');

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // Get active unlocks for the club
    const { data: unlocks, error } = await supabaseAny
      .from('unlocks')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('required_status', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unlocks:', error);
      return NextResponse.json({ error: "Failed to fetch unlocks" }, { status: 500 });
    }

    return NextResponse.json(unlocks || []);

  } catch (error) {
    console.error("[Unlocks API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
