import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Get tier rewards analytics (admin only)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards Analytics API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get query parameters for date filtering
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const clubId = searchParams.get('club_id');

    // Summary statistics
    const summaryQuery = supabaseAny
      .from('tier_rewards')
      .select('id, is_active');
    
    if (clubId) {
      summaryQuery.eq('club_id', clubId);
    }

    const { data: allRewards, error: summaryError } = await summaryQuery;

    if (summaryError) {
      console.error('Error fetching summary data:', summaryError);
      return NextResponse.json({ error: "Failed to fetch summary data" }, { status: 500 });
    }

    const totalRewards = allRewards?.length || 0;
    const activeRewards = allRewards?.filter(r => r.is_active).length || 0;

    // Claims and revenue statistics
    let claimsQuery = supabaseAny
      .from('reward_claims')
      .select(`
        id,
        claim_method,
        upgrade_amount_cents,
        claimed_at,
        tier_rewards!inner(tier, reward_type, club_id)
      `);

    if (clubId) {
      claimsQuery = claimsQuery.eq('tier_rewards.club_id', clubId);
    }

    if (startDate) {
      claimsQuery = claimsQuery.gte('claimed_at', startDate);
    }

    if (endDate) {
      claimsQuery = claimsQuery.lte('claimed_at', endDate);
    }

    const { data: claims, error: claimsError } = await claimsQuery;

    if (claimsError) {
      console.error('Error fetching claims data:', claimsError);
      return NextResponse.json({ error: "Failed to fetch claims data" }, { status: 500 });
    }

    const totalClaims = claims?.length || 0;
    const totalUpgradeRevenueCents = claims?.reduce((sum, claim) => 
      sum + (claim.upgrade_amount_cents || 0), 0) || 0;

    // Calculate conversion rate (upgrade purchases / total claims)
    const upgradeClaims = claims?.filter(claim => claim.claim_method === 'upgrade_purchased').length || 0;
    const averageUpgradeConversionRate = totalClaims > 0 ? (upgradeClaims / totalClaims) : 0;

    // Analytics by tier
    const byTier = ['cadet', 'resident', 'headliner', 'superfan'].map(tier => {
      const tierClaims = claims?.filter(claim => claim.tier_rewards?.tier === tier) || [];
      const tierRewards = allRewards?.filter(reward => 
        claims?.some(claim => claim.tier_rewards?.tier === tier && claim.reward_id === reward.id)
      ) || [];

      return {
        tier,
        reward_count: tierRewards.length,
        total_claims: tierClaims.length,
        upgrade_revenue_cents: tierClaims.reduce((sum, claim) => sum + (claim.upgrade_amount_cents || 0), 0),
        conversion_rate: tierClaims.length > 0 ? 
          (tierClaims.filter(c => c.claim_method === 'upgrade_purchased').length / tierClaims.length) : 0
      };
    });

    // Analytics by reward type
    const byRewardType = ['access', 'digital_product', 'physical_product', 'experience'].map(rewardType => {
      const typeClaims = claims?.filter(claim => claim.tier_rewards?.reward_type === rewardType) || [];
      const typeRewards = allRewards?.filter(reward => 
        claims?.some(claim => claim.tier_rewards?.reward_type === rewardType && claim.reward_id === reward.id)
      ) || [];

      const totalRevenue = typeClaims.reduce((sum, claim) => sum + (claim.upgrade_amount_cents || 0), 0);
      const avgMargin = typeClaims.length > 0 ? 25 : 0; // Simplified - would need actual cost data

      return {
        reward_type: rewardType,
        reward_count: typeRewards.length,
        total_claims: typeClaims.length,
        upgrade_revenue_cents: totalRevenue,
        average_fulfillment_cost_cents: 0, // Would need to calculate from artist_cost_estimate_cents
        average_margin_percent: avgMargin
      };
    });

    // Recent activity (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentActivityQuery = supabaseAny
      .from('reward_claims')
      .select('claimed_at, upgrade_amount_cents')
      .gte('claimed_at', thirtyDaysAgo.toISOString());

    if (clubId) {
      recentActivityQuery = recentActivityQuery.eq('club_id', clubId);
    }

    const { data: recentClaims, error: recentError } = await recentActivityQuery;

    if (recentError) {
      console.error('Error fetching recent activity:', recentError);
      return NextResponse.json({ error: "Failed to fetch recent activity" }, { status: 500 });
    }

    // Group recent activity by date
    const activityByDate = new Map();
    recentClaims?.forEach(claim => {
      const date = claim.claimed_at.split('T')[0]; // Get just the date part
      if (!activityByDate.has(date)) {
        activityByDate.set(date, {
          date,
          claims: 0,
          upgrade_revenue_cents: 0,
          new_rewards_created: 0
        });
      }
      const dayData = activityByDate.get(date);
      dayData.claims += 1;
      dayData.upgrade_revenue_cents += claim.upgrade_amount_cents || 0;
    });

    // Get new rewards created in the same period
    let newRewardsQuery = supabaseAny
      .from('tier_rewards')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (clubId) {
      newRewardsQuery = newRewardsQuery.eq('club_id', clubId);
    }

    const { data: newRewards, error: newRewardsError } = await newRewardsQuery;

    if (!newRewardsError && newRewards) {
      newRewards.forEach(reward => {
        const date = reward.created_at.split('T')[0];
        if (activityByDate.has(date)) {
          activityByDate.get(date).new_rewards_created += 1;
        } else {
          activityByDate.set(date, {
            date,
            claims: 0,
            upgrade_revenue_cents: 0,
            new_rewards_created: 1
          });
        }
      });
    }

    const recentActivity = Array.from(activityByDate.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    // Compile final analytics response
    const analytics = {
      summary: {
        total_rewards: totalRewards,
        active_rewards: activeRewards,
        total_claims: totalClaims,
        total_upgrade_revenue_cents: totalUpgradeRevenueCents,
        average_upgrade_conversion_rate: averageUpgradeConversionRate
      },
      by_tier: byTier,
      by_reward_type: byRewardType,
      recent_activity: recentActivity
    };

    return NextResponse.json(analytics);

  } catch (error) {
    console.error("[Admin Tier Rewards Analytics API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
