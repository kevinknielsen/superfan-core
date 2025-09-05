import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../../supabase";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  if (!(await isAdmin(auth.userId))) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const unlockId = params.id;

  try {
    // Get current unlock status
    const { data: unlock, error: fetchError } = await supabaseAny
      .from('unlocks')
      .select('id, title, is_active')
      .eq('id', unlockId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: "Unlock not found" }, { status: 404 });
    }

    // Toggle the active status
    const { data: updatedUnlock, error: updateError } = await supabaseAny
      .from('unlocks')
      .update({
        is_active: !unlock.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', unlockId)
      .select()
      .single();

    if (updateError) {
      console.error("[Admin Unlock Toggle API] Error updating unlock:", updateError);
      return NextResponse.json({ error: "Failed to update unlock" }, { status: 500 });
    }

    console.log(`[Admin Unlock Toggle API] Toggled unlock ${unlock.title}: ${unlock.is_active} → ${updatedUnlock.is_active}`);

    return NextResponse.json(updatedUnlock);

  } catch (error) {
    console.error("[Admin Unlock Toggle API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
