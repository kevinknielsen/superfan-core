import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// UUID validation helper
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Get specific tier reward with stats (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Validate UUID format early
  if (!isValidUUID(id)) {
    return NextResponse.json({ 
      error: "Invalid reward ID format" 
    }, { status: 400 });
  }

  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get tier reward with club info (left join to avoid false 404s if clubs is RLS-filtered)
    const { data: tierReward, error } = await supabaseAny
      .from('tier_rewards')
      .select(`
        *,
        clubs(name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: "Tier reward not found" }, { status: 404 });
      }
      console.error('Error fetching tier reward:', error);
      return NextResponse.json({ error: "Failed to fetch tier reward" }, { status: 500 });
    }

    // Format response with club name (handle null club from RLS filtering)
    const { clubs, ...rest } = tierReward;
    const formattedReward = { ...rest, club_name: clubs?.name || null };

    return NextResponse.json(formattedReward);

  } catch (error) {
    console.error("[Admin Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Delete tier reward (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Validate UUID format early
  if (!isValidUUID(id)) {
    return NextResponse.json({ 
      error: "Invalid reward ID format" 
    }, { status: 400 });
  }

  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Use atomic delete function to eliminate race conditions
    const { data: deletedReward, error } = await supabaseAny
      .rpc('admin_delete_tier_reward', { p_reward_id: id });

    if (error) {
      // Handle custom error codes from the RPC function
      if (error.code === 'P0001') {
        return NextResponse.json(
          { 
            error: "Cannot delete tier reward with existing claims",
            message: "This reward has been claimed by users and cannot be deleted. Consider deactivating it instead."
          },
          { status: 409 }
        );
      }
      
      if (error.code === 'P0002') {
        return NextResponse.json(
          { 
            error: "Cannot delete tier reward with in-flight transactions",
            message: "This reward has pending or processing upgrade purchases and cannot be deleted."
          },
          { status: 409 }
        );
      }
      
      if (error.code === 'NO_DATA_FOUND') {
        return NextResponse.json({ error: "Tier reward not found" }, { status: 404 });
      }
      
      console.error('Error deleting tier reward:', error);
      return NextResponse.json({ error: "Failed to delete tier reward" }, { status: 500 });
    }

    console.log(`[Admin Tier Rewards API] Deleted tier reward: ${id}`);
    return NextResponse.json({ 
      message: "Tier reward deleted successfully",
      deleted_reward: deletedReward
    });

  } catch (error) {
    console.error("[Admin Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
