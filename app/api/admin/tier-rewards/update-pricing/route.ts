import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Update dynamic safety factors for all active rewards (admin only)
// This endpoint can be called periodically to adjust pricing based on demand
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards Pricing API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Call the database function to update all safety factors
    const { data: updateCount, error: updateError } = await supabaseAny
      .rpc('update_dynamic_safety_factors');

    if (updateError) {
      console.error('Error updating dynamic safety factors:', updateError);
      return NextResponse.json({ 
        error: "Failed to update pricing",
        message: updateError.message 
      }, { status: 500 });
    }

    const updatedRewards = updateCount || 0;

    console.log(`[Admin Tier Rewards Pricing API] Updated safety factors for ${updatedRewards} rewards`);

    return NextResponse.json({
      message: "Dynamic pricing updated successfully",
      updated_rewards: updatedRewards,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("[Admin Tier Rewards Pricing API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get pricing analytics for a specific reward (admin only)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards Pricing API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rewardId = searchParams.get('reward_id');

    if (!rewardId) {
      return NextResponse.json({ error: "reward_id parameter is required" }, { status: 400 });
    }

    // Get current reward data
    const { data: reward, error: rewardError } = await supabaseAny
      .from('tier_rewards')
      .select(`
        id,
        title,
        artist_cost_estimate_cents,
        upgrade_price_cents,
        safety_factor,
        inventory_limit,
        inventory_claimed
      `)
      .eq('id', rewardId)
      .single();

    if (rewardError) {
      if (rewardError.code === 'PGRST116') {
        return NextResponse.json({ error: "Reward not found" }, { status: 404 });
      }
      console.error('Error fetching reward:', rewardError);
      return NextResponse.json({ error: "Failed to fetch reward" }, { status: 500 });
    }

    // Calculate what the dynamic safety factor would be
    const { data: dynamicFactor, error: factorError } = await supabaseAny
      .rpc('calculate_dynamic_safety_factor', { p_reward_id: rewardId });

    if (factorError) {
      console.error('Error calculating dynamic factor:', factorError);
      return NextResponse.json({ error: "Failed to calculate dynamic factor" }, { status: 500 });
    }

    // Get recent upgrade statistics
    const { data: recentUpgrades, error: upgradesError } = await supabaseAny
      .from('upgrade_transactions')
      .select('created_at, amount_cents, purchase_type')
      .eq('reward_id', rewardId)
      .eq('status', 'completed')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (upgradesError) {
      console.error('Error fetching recent upgrades:', upgradesError);
      return NextResponse.json({ error: "Failed to fetch upgrade data" }, { status: 500 });
    }

    // Calculate conversion rate (simplified)
    const { data: totalClaims, error: claimsError } = await supabaseAny
      .from('reward_claims')
      .select('claim_method')
      .eq('reward_id', rewardId);

    if (claimsError) {
      console.error('Error fetching claims data:', claimsError);
      return NextResponse.json({ error: "Failed to fetch claims data" }, { status: 500 });
    }

    const upgradeClaims = totalClaims?.filter(claim => claim.claim_method === 'upgrade_purchased').length || 0;
    const totalClaimsCount = totalClaims?.length || 0;
    const conversionRate = totalClaimsCount > 0 ? (upgradeClaims / totalClaimsCount) : 0;

    // Calculate stock ratio
    let stockRatio = null;
    if (reward.inventory_limit) {
      stockRatio = (reward.inventory_limit - reward.inventory_claimed) / reward.inventory_limit;
    }

    // Calculate projected price with dynamic factor
    const projectedPrice = reward.artist_cost_estimate_cents > 0 
      ? Math.ceil((reward.artist_cost_estimate_cents / 0.96) * dynamicFactor)
      : null;

    const analytics = {
      reward: {
        id: reward.id,
        title: reward.title,
        artist_cost_estimate_cents: reward.artist_cost_estimate_cents,
        current_upgrade_price_cents: reward.upgrade_price_cents,
        current_safety_factor: reward.safety_factor
      },
      dynamic_pricing: {
        recommended_safety_factor: dynamicFactor,
        projected_price_cents: projectedPrice,
        price_change_cents: projectedPrice ? (projectedPrice - reward.upgrade_price_cents) : 0
      },
      demand_metrics: {
        recent_upgrades_7d: recentUpgrades?.length || 0,
        total_revenue_7d_cents: recentUpgrades?.reduce((sum, upgrade) => sum + upgrade.amount_cents, 0) || 0,
        conversion_rate: conversionRate,
        stock_ratio: stockRatio
      },
      recommendations: []
    };

    // Add recommendations
    if (stockRatio !== null) {
      if (stockRatio < 0.1) {
        analytics.recommendations.push("Very low stock - consider premium pricing");
      } else if (stockRatio > 0.8) {
        analytics.recommendations.push("High stock - consider reducing price to increase demand");
      }
    }

    if (conversionRate < 0.05) {
      analytics.recommendations.push("Low conversion rate - price may be too high");
    } else if (conversionRate > 0.25) {
      analytics.recommendations.push("High conversion rate - opportunity to increase price");
    }

    if ((recentUpgrades?.length || 0) > 10) {
      analytics.recommendations.push("High demand - consider increasing price");
    } else if ((recentUpgrades?.length || 0) < 2) {
      analytics.recommendations.push("Low demand - consider promotional pricing");
    }

    return NextResponse.json(analytics);

  } catch (error) {
    console.error("[Admin Tier Rewards Pricing API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
