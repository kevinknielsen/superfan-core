import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../auth";
import { isAdminByDatabase } from "@/lib/admin-utils";
import { supabase } from "../../../../supabase";

// Minimal typing for tier_rewards rows used in this route
type TierRewardRow = {
  id: string;
  is_active: boolean;
  title: string;
  club_id: string;
};

// Toggle tier reward active status (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = await params;

  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards Toggle API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !(await isAdminByDatabase(auth.userId))) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get current status
    const { data: currentReward, error: fetchError } = await supabase
      .from<TierRewardRow>('tier_rewards')
      .select('is_active, title, club_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: "Tier reward not found" }, { status: 404 });
      }
      console.error('Error fetching tier reward:', fetchError);
      return NextResponse.json({ error: "Failed to fetch tier reward" }, { status: 500 });
    }

    // Toggle the status
    const newStatus = !currentReward.is_active;

    const { data: updatedReward, error: updateError } = await supabase
      .from<TierRewardRow>('tier_rewards')
      .update({ is_active: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating tier reward status:', updateError);
      return NextResponse.json({ error: "Failed to update tier reward status" }, { status: 500 });
    }

    console.log(`[Admin Tier Rewards Toggle API] Toggled reward ${id} from ${currentReward.is_active} to ${newStatus}`);
    
    return NextResponse.json({
      message: `Tier reward ${newStatus ? 'activated' : 'deactivated'} successfully`,
      reward: updatedReward,
      previous_status: currentReward.is_active,
      new_status: newStatus
    });

  } catch (error) {
    console.error("[Admin Tier Rewards Toggle API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
