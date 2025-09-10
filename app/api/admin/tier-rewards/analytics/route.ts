import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { createServiceClient } from "../../../supabase";

// Minimal row typings used in this route
type TierRewardRow = {
  id: string;
  is_active?: boolean;
  club_id: string;
  tier: 'cadet' | 'resident' | 'headliner' | 'superfan';
  reward_type: 'access' | 'digital_product' | 'physical_product' | 'experience';
  artist_cost_estimate_cents?: number | null;
  created_at?: string;
};
type RewardClaimRow = {
  id: string;
  claim_method: string;
  upgrade_amount_cents: number | null;
  claimed_at: string;
  reward_id?: string;
  tier_rewards?: Pick<TierRewardRow, 'id' | 'tier' | 'reward_type' | 'club_id' | 'artist_cost_estimate_cents'>;
};

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

    // Normalize and validate date parameters if provided
    let normalizedStartDate: string | null = null;
    let normalizedEndDate: string | null = null;
    
    if (startDate !== null || endDate !== null) {
      // Check that both dates are provided and non-empty
      if (!startDate || !endDate || startDate.trim() === '' || endDate.trim() === '') {
        return NextResponse.json({ 
          error: "Both start_date and end_date must be provided and non-empty" 
        }, { status: 400 });
      }

      // Detect date-only format (YYYY-MM-DD without time component)
      const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
      const isStartDateOnly = dateOnlyPattern.test(startDate) || !startDate.includes('T');
      const isEndDateOnly = dateOnlyPattern.test(endDate) || !endDate.includes('T');

      // Parse and normalize dates to UTC
      let startDateObj: Date;
      let endDateObj: Date;

      if (isStartDateOnly) {
        // Parse as UTC midnight
        startDateObj = new Date(startDate + 'T00:00:00.000Z');
      } else {
        // Parse datetime to UTC
        startDateObj = new Date(startDate);
      }

      if (isEndDateOnly) {
        // Parse as UTC midnight of the next day for inclusive end date
        const endDateParts = endDate.split('-');
        const endYear = parseInt(endDateParts[0]);
        const endMonth = parseInt(endDateParts[1]) - 1; // Month is 0-indexed
        const endDay = parseInt(endDateParts[2]);
        endDateObj = new Date(Date.UTC(endYear, endMonth, endDay + 1, 0, 0, 0, 0));
      } else {
        // Parse datetime to UTC
        endDateObj = new Date(endDate);
      }
      
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        return NextResponse.json({ 
          error: "Invalid date format. Please use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)" 
        }, { status: 400 });
      }

      // Ensure start <= end
      if (startDateObj > endDateObj) {
        return NextResponse.json({ 
          error: "start_date must be less than or equal to end_date" 
        }, { status: 400 });
      }

      normalizedStartDate = startDateObj.toISOString();
      if (isEndDateOnly) {
        // For date-only end dates, use half-open interval [start, end)
        normalizedEndDate = endDateObj.toISOString();
      } else {
        // For datetime end dates, use inclusive interval [start, end]
        normalizedEndDate = endDateObj.toISOString();
      }
    }

    // Fail-fast guard for Supabase environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Admin Tier Rewards Analytics API] Missing required Supabase environment variables');
      return NextResponse.json({ 
        error: "Server configuration error - missing Supabase credentials" 
      }, { status: 500 });
    }

    // Create service client to bypass RLS
    const supabase = createServiceClient();

    // Summary statistics
    const summaryQuery = supabase
      .from<TierRewardRow>('tier_rewards')
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
    let claimsQuery = supabase
      .from<RewardClaimRow>('reward_claims')
      .select(`
        id,
        claim_method,
        upgrade_amount_cents,
        claimed_at,
        tier_rewards!inner(id, tier, reward_type, club_id, artist_cost_estimate_cents)
      `);

    if (clubId) {
      claimsQuery = claimsQuery.eq('tier_rewards.club_id', clubId);
    }

    if (normalizedStartDate) {
      claimsQuery = claimsQuery.gte('claimed_at', normalizedStartDate);
    }

    if (normalizedEndDate) {
      // For date-only end dates, use lt (half-open interval); for datetime end dates, use lte (inclusive)
      const isEndDateOnly = endDate && (/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !endDate.includes('T'));
      if (isEndDateOnly) {
        claimsQuery = claimsQuery.lt('claimed_at', normalizedEndDate);
      } else {
        claimsQuery = claimsQuery.lte('claimed_at', normalizedEndDate);
      }
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

    // Build Sets of claimed reward IDs by tier and type for O(n) lookups
    const claimedRewardIdsByTier = new Map<string, Set<string>>();
    const claimedRewardIdsByType = new Map<string, Set<string>>();
    
    claims?.forEach(claim => {
      if (claim.tier_rewards?.tier) {
        if (!claimedRewardIdsByTier.has(claim.tier_rewards.tier)) {
          claimedRewardIdsByTier.set(claim.tier_rewards.tier, new Set());
        }
        claimedRewardIdsByTier.get(claim.tier_rewards.tier)!.add(claim.tier_rewards.id);
      }
      
      if (claim.tier_rewards?.reward_type) {
        if (!claimedRewardIdsByType.has(claim.tier_rewards.reward_type)) {
          claimedRewardIdsByType.set(claim.tier_rewards.reward_type, new Set());
        }
        claimedRewardIdsByType.get(claim.tier_rewards.reward_type)!.add(claim.tier_rewards.id);
      }
    });

    // Analytics by tier
    const byTier = ['cadet', 'resident', 'headliner', 'superfan'].map(tier => {
      const tierClaims = claims?.filter(claim => claim.tier_rewards?.tier === tier) || [];
      const claimedRewardIds = claimedRewardIdsByTier.get(tier) || new Set<string>();

      return {
        tier,
        reward_count: claimedRewardIds.size,
        total_claims: tierClaims.length,
        upgrade_revenue_cents: tierClaims.reduce((sum, claim) => sum + (claim.upgrade_amount_cents || 0), 0),
        conversion_rate: tierClaims.length > 0 ? 
          (tierClaims.filter(c => c.claim_method === 'upgrade_purchased').length / tierClaims.length) : 0
      };
    });

    // Analytics by reward type
    const byRewardType = ['access', 'digital_product', 'physical_product', 'experience'].map(rewardType => {
      const typeClaims = claims?.filter(claim => claim.tier_rewards?.reward_type === rewardType) || [];
      const claimedRewardIds = claimedRewardIdsByType.get(rewardType) || new Set<string>();

      const totalRevenue = typeClaims.reduce((sum, claim) => sum + (claim.upgrade_amount_cents || 0), 0);
      const marginSamples = typeClaims
        .filter(c => typeof c.upgrade_amount_cents === 'number' && (c.upgrade_amount_cents as number) > 0 && typeof c.tier_rewards?.artist_cost_estimate_cents === 'number')
        .map(c => {
          const revenue = Number(c.upgrade_amount_cents || 0);
          const cost = Number(c.tier_rewards?.artist_cost_estimate_cents || 0);
          if (revenue <= 0) return 0;
          const pct = ((revenue - cost) / revenue) * 100;
          return isFinite(pct) ? pct : 0;
        });
      const averageMarginPercent = marginSamples.length > 0
        ? Number((marginSamples.reduce((a, b) => a + b, 0) / marginSamples.length).toFixed(2))
        : 0;

      return {
        reward_type: rewardType,
        reward_count: claimedRewardIds.size,
        total_claims: typeClaims.length,
        upgrade_revenue_cents: totalRevenue,
        average_fulfillment_cost_cents: 0,
        average_margin_percent: averageMarginPercent
      };
    });

    // Recent activity (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let recentActivityQuery = supabase
      .from<RewardClaimRow>('reward_claims')
      .select('claimed_at, upgrade_amount_cents, tier_rewards!inner(club_id)')
      .gte('claimed_at', thirtyDaysAgo.toISOString());

    if (clubId) {
      recentActivityQuery = recentActivityQuery.eq('tier_rewards.club_id', clubId);
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
    let newRewardsQuery = supabase
      .from<TierRewardRow>('tier_rewards')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (clubId) {
      newRewardsQuery = newRewardsQuery.eq('club_id', clubId);
    }

    const { data: newRewards, error: newRewardsError } = await newRewardsQuery;

    if (!newRewardsError && newRewards) {
      newRewards.forEach(reward => {
        if (!reward.created_at) return;
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
