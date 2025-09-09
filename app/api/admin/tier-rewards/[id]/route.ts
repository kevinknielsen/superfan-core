import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Get specific tier reward with stats (admin only)
export async function GET(
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
    console.error('[Admin Tier Rewards API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get tier reward with club info
    const { data: tierReward, error } = await supabaseAny
      .from('tier_rewards')
      .select(`
        *,
        clubs!inner(name)
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

    // Format response with club name
    const formattedReward = {
      ...tierReward,
      club_name: tierReward.clubs?.name,
      clubs: undefined
    };

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
  const { id } = await params;

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
    // Check if there are any claims for this reward
    const { data: existingClaims, error: claimsError } = await supabaseAny
      .from('reward_claims')
      .select('id')
      .eq('reward_id', id)
      .limit(1);

    if (claimsError) {
      console.error('Error checking existing claims:', claimsError);
      return NextResponse.json({ error: "Failed to check existing claims" }, { status: 500 });
    }

    if (existingClaims && existingClaims.length > 0) {
      return NextResponse.json(
        { 
          error: "Cannot delete tier reward with existing claims",
          message: "This reward has been claimed by users and cannot be deleted. Consider deactivating it instead."
        },
        { status: 409 }
      );
    }

    // Check if there are any active transactions for this reward
    const { data: existingTransactions, error: transactionsError } = await supabaseAny
      .from('upgrade_transactions')
      .select('id')
      .eq('reward_id', id)
      .eq('status', 'pending')
      .limit(1);

    if (transactionsError) {
      console.error('Error checking existing transactions:', transactionsError);
      return NextResponse.json({ error: "Failed to check existing transactions" }, { status: 500 });
    }

    if (existingTransactions && existingTransactions.length > 0) {
      return NextResponse.json(
        { 
          error: "Cannot delete tier reward with pending transactions",
          message: "This reward has pending upgrade purchases and cannot be deleted."
        },
        { status: 409 }
      );
    }

    // Safe to delete - no claims or pending transactions
    const { data: deletedReward, error } = await supabaseAny
      .from('tier_rewards')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
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
