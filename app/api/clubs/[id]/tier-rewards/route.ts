import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { supabase } from "../../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Get available tier rewards for a user in a specific club
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: clubId } = await params;

  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log('[Club Tier Rewards API] Starting request for auth:', auth);
    
    // Get the user from our database (support both auth types) - same pattern as existing APIs
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('[Club Tier Rewards API] User not found:', userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const actualUserId = user.id;
    console.log('[Club Tier Rewards API] Found user UUID:', actualUserId, 'for auth:', auth);

    // Get user's tier qualification for this club
    const { data: qualification, error: qualificationError } = await supabaseAny
      .rpc('check_tier_qualification', {
        p_user_id: actualUserId,
        p_club_id: clubId,
        p_target_tier: 'superfan', // Check highest tier to get all info
        p_rolling_window_days: 60
      });

    if (qualificationError) {
      console.error('Error checking tier qualification:', qualificationError);
      return NextResponse.json({ error: "Failed to check tier qualification" }, { status: 500 });
    }

    const userQualification = qualification?.[0] || {
      qualified: false,
      earned_tier: 'cadet',
      effective_tier: 'cadet',
      current_points: 0,
      required_points: 0,
      points_needed: 0,
      has_active_boost: false,
      quarterly_free_used: false
    };

    // Get current quarter info
    const { data: currentQuarter, error: quarterError } = await supabaseAny
      .rpc('get_current_quarter');

    if (quarterError) {
      console.error('Error getting current quarter:', quarterError);
      return NextResponse.json({ error: "Failed to get current quarter" }, { status: 500 });
    }

    // Helper function to compute current quarter from runtime
    const computeCurrentQuarter = () => {
      const now = new Date();
      return {
        year: now.getFullYear(),
        quarter: Math.floor(now.getMonth() / 3) + 1
      };
    };

    const quarter = currentQuarter?.[0] || computeCurrentQuarter();

    // Get all available tier rewards for this club with club info
    const { data: availableRewards, error: rewardsError } = await supabaseAny
      .from('tier_rewards')
      .select(`
        id,
        title,
        description,
        tier,
        reward_type,
        artist_cost_estimate_cents,
        upgrade_price_cents,
        availability_type,
        available_start,
        available_end,
        inventory_limit,
        inventory_claimed,
        rolling_window_days,
        metadata,
        is_active,
        created_at,
        clubs!inner(
          id,
          name,
          description,
          city,
          image_url
        )
      `)
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('tier')
      .order('created_at', { ascending: false });

    if (rewardsError) {
      console.error('Error fetching tier rewards:', rewardsError);
      return NextResponse.json({ error: "Failed to fetch tier rewards" }, { status: 500 });
    }

    // Get user's existing claims for this club
    const { data: userClaims, error: claimsError } = await supabaseAny
      .from('reward_claims')
      .select(`
        id,
        reward_id,
        claim_method,
        claimed_at,
        access_status,
        access_code,
        tier_rewards!inner(title)
      `)
      .eq('user_id', actualUserId)
      .eq('club_id', clubId);

    if (claimsError) {
      console.error('Error fetching user claims:', claimsError);
      return NextResponse.json({ error: "Failed to fetch user claims" }, { status: 500 });
    }

    // Helper function to get tier rank for comparison
    const getTierRank = (tier: string): number => {
      const ranks = { cadet: 0, resident: 1, headliner: 2, superfan: 3 };
      return ranks[tier as keyof typeof ranks] || 0;
    };

    // Helper function to check reward availability
    const checkRewardAvailability = (reward: any) => {
      const now = new Date();
      
      // Check inventory
      if (reward.inventory_limit && reward.inventory_claimed >= reward.inventory_limit) {
        return { available: false, reason: 'sold_out' };
      }
      
      // Check availability window
      if (reward.availability_type === 'limited_time') {
        if (reward.available_start && now < new Date(reward.available_start)) {
          return { available: false, reason: 'not_yet_available', available_at: reward.available_start };
        }
        if (reward.available_end && now > new Date(reward.available_end)) {
          return { available: false, reason: 'expired' };
        }
      }
      
      if (reward.availability_type === 'seasonal') {
        if (reward.available_start && reward.available_end) {
          if (now < new Date(reward.available_start) || now > new Date(reward.available_end)) {
            return { available: false, reason: 'out_of_season', available_at: reward.available_start };
          }
        }
      }
      
      return { available: true };
    };

    // Process rewards with user-specific information
    const processedRewards = (availableRewards || []).map(reward => {
      const userTierRank = getTierRank(userQualification.effective_tier);
      const rewardTierRank = getTierRank(reward.tier);
      const alreadyClaimed = userClaims?.some(claim => claim.reward_id === reward.id);
      const availability = checkRewardAvailability(reward);
      
      // Determine if user can claim for free
      const canClaimFree = !alreadyClaimed && 
                          userTierRank >= rewardTierRank && 
                          !userQualification.quarterly_free_used &&
                          availability.available;

      // Determine available claim options
      const claimOptions = [];
      
      if (canClaimFree) {
        claimOptions.push('free_claim');
      }
      
      if (!alreadyClaimed && availability.available) {
        // Can purchase tier boost if not already at required tier through earned points
        if (getTierRank(userQualification.earned_tier) < rewardTierRank) {
          claimOptions.push('tier_boost');
        }
        
        // Can always purchase direct unlock
        if (reward.upgrade_price_cents && reward.upgrade_price_cents > 0) {
          claimOptions.push('direct_unlock');
        }
      }

      // Calculate inventory status
      let inventoryStatus = 'unlimited';
      if (reward.inventory_limit) {
        if (reward.inventory_claimed >= reward.inventory_limit) {
          inventoryStatus = 'sold_out';
        } else if (reward.inventory_claimed >= (reward.inventory_limit * 0.9)) {
          inventoryStatus = 'low_stock';
        } else {
          inventoryStatus = 'available';
        }
      }

      // Calculate current status
      let currentStatus = 'available';
      if (!availability.available) {
        currentStatus = availability.reason;
      }

      return {
        id: reward.id,
        title: reward.title,
        description: reward.description,
        reward_type: reward.reward_type,
        tier: reward.tier,
        user_can_claim_free: canClaimFree,
        claim_options: claimOptions,
        tier_boost_price_cents: reward.upgrade_price_cents, // Same price for both boost and direct unlock
        direct_unlock_price_cents: reward.upgrade_price_cents,
        inventory_status: inventoryStatus,
        current_status: currentStatus,
        available_at: availability.available_at,
        metadata: reward.metadata,
        created_at: reward.created_at
      };
    });

    // Format claimed rewards
    const claimedRewards = (userClaims || []).map(claim => ({
      id: claim.id,
      reward_id: claim.reward_id,
      title: claim.tier_rewards?.title,
      claim_method: claim.claim_method,
      claimed_at: claim.claimed_at,
      access_status: claim.access_status,
      access_code: claim.access_code
    }));

    // Compile response
    const response = {
      user_earned_tier: userQualification.earned_tier,
      user_effective_tier: userQualification.effective_tier,
      user_rolling_points: userQualification.current_points,
      rolling_window_days: 60,
      has_active_boost: userQualification.has_active_boost,
      quarterly_free_used: userQualification.quarterly_free_used,
      current_quarter: quarter,
      available_rewards: processedRewards,
      claimed_rewards: claimedRewards
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("[Club Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
