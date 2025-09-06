import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../../supabase";

// TODO: Regenerate Supabase TypeScript types to include unlocks table
// Type assertion needed: database types don't include new unlocks table yet
const supabaseAny = supabase as any;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - can be disabled via environment variable for testing
  if (process.env.SKIP_ADMIN_CHECKS !== 'true' && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  const unlockId = params.id;

  try {
    // Get current unlock status
    const { data: unlock, error: fetchError } = await supabase
      .from('unlocks')
      .select('id, title, is_active')
      .eq('id', unlockId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: "Unlock not found" }, { status: 404 });
    }

    // Toggle the active status
    const { data: updatedUnlock, error: updateError } = await supabase
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
