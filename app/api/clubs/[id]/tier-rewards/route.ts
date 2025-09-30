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

    // Get all available tier rewards for this club with club info and campaign data
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
        campaign_id,
        campaign_title,
        campaign_status,
        is_campaign_tier,
        resident_discount_percentage,
        headliner_discount_percentage,
        superfan_discount_percentage,
        ticket_cost,
        is_ticket_campaign,
        cogs_cents,
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

    // Fetch campaign data from campaigns table (single source of truth)
    const campaignIds = (availableRewards || []).map((r: any) => r.campaign_id).filter(Boolean);
    const campaignsMap = new Map<string, any>();
    
    if (campaignIds.length > 0) {
      const { data: campaignsData } = await supabaseAny
        .from('campaigns')
        .select('id, current_funding_cents, funding_goal_cents, deadline')
        .in('id', campaignIds);
      
      campaignsData?.forEach((campaign: any) => {
        campaignsMap.set(campaign.id, campaign);
      });
    }

    // Get user's existing claims for this club (including ticket tracking)
    const { data: userClaims, error: claimsError } = await supabaseAny
      .from('reward_claims')
      .select(`
        id,
        reward_id,
        claim_method,
        claimed_at,
        access_status,
        access_code,
        campaign_id,
        tickets_purchased,
        tickets_available,
        tickets_redeemed,
        is_ticket_claim,
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

    // Helper function to calculate user discount
    const calculateUserDiscount = (userTier: string, rewardTier: string, reward: any): number => {
      const userRank = getTierRank(userTier);
      const rewardRank = getTierRank(rewardTier);
      
      // Guard against null/undefined/invalid upgrade_price_cents
      const upgradePriceCents = Number(reward.upgrade_price_cents);
      if (!upgradePriceCents || upgradePriceCents <= 0 || !isFinite(upgradePriceCents)) {
        return 0;
      }
      
      // Only discount if user tier >= reward tier
      if (userRank >= rewardRank) {
        const discountPercentage = (() => {
          switch (userTier) {
            case 'resident': 
              return reward.resident_discount_percentage !== null && reward.resident_discount_percentage !== undefined 
                ? Number(reward.resident_discount_percentage) 
                : 10.0;
            case 'headliner': 
              return reward.headliner_discount_percentage !== null && reward.headliner_discount_percentage !== undefined 
                ? Number(reward.headliner_discount_percentage) 
                : 15.0;
            case 'superfan': 
              return reward.superfan_discount_percentage !== null && reward.superfan_discount_percentage !== undefined 
                ? Number(reward.superfan_discount_percentage) 
                : 25.0;
            default: 
              return 0;
          }
        })();
        
        return Math.round(upgradePriceCents * discountPercentage / 100);
      }
      return 0;
    };

    // Helper function to get campaign progress from campaigns table
    const getCampaignProgress = (reward: any) => {
      if (!reward.campaign_id) return null;
      
      const campaign = campaignsMap.get(reward.campaign_id);
      if (!campaign) return null;
      
      // Use data from campaigns table (single source of truth)
      const currentFundingCents = Number(campaign.current_funding_cents) || 0;
      const goalFundingCents = Number(campaign.funding_goal_cents) || 0;
      
      // Guard the percentage calculation - only divide when goal > 0
      const fundingPercentage = goalFundingCents > 0 ? 
        (currentFundingCents / goalFundingCents * 100) : 0;
        
      // Only compute seconds_remaining if campaign_deadline exists
      const secondsRemaining = campaign.deadline ? 
        Math.max(0, Math.floor((new Date(campaign.deadline).getTime() - Date.now()) / 1000)) : 0;
        
      return {
        funding_percentage: Math.round(fundingPercentage * 100) / 100,
        seconds_remaining: secondsRemaining,
        current_funding_cents: currentFundingCents,
        goal_funding_cents: goalFundingCents
      };
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

    // Get campaign descriptions for all campaigns (separate query)
    const campaignIdsForDescriptions = [...new Set((availableRewards || [])
      .filter((r: any) => r.campaign_id)
      .map((r: any) => r.campaign_id)
    )];
    
    let campaignDescriptions: Record<string, string> = {};
    if (campaignIdsForDescriptions.length > 0) {
      const { data: campaigns } = await supabaseAny
        .from('campaigns')
        .select('id, description')
        .in('id', campaignIdsForDescriptions);
        
      if (campaigns) {
        campaignDescriptions = campaigns.reduce((acc: Record<string, string>, campaign: any) => {
          acc[campaign.id] = campaign.description;
          return acc;
        }, {});
      }
    }

    // Process rewards with user-specific information
    const processedRewards = (availableRewards || []).map((reward: any) => {
      const userTierRank = getTierRank(userQualification.effective_tier);
      const rewardTierRank = getTierRank(reward.tier);
      const alreadyClaimed = userClaims?.some((claim: any) => claim.reward_id === reward.id);
      const availability = checkRewardAvailability(reward);
      
      // TODO: Re-enable free claims post-MVP based on quarterly allowance
      const canClaimFree = false; // Disabled for Campaign MVP
      
      // Determine available claim options - only purchase options
      const claimOptions: { upgrade: { purchase_type: 'tier_boost' | 'direct_unlock'; price_cents?: number } }[] = [];
      
      if (!alreadyClaimed && availability.available) {
        // Can purchase tier boost if not already at required tier through earned points
        if (getTierRank(userQualification.earned_tier) < rewardTierRank) {
          claimOptions.push({ upgrade: { purchase_type: 'tier_boost', price_cents: reward.upgrade_price_cents } });
        }
        
        // Can always purchase direct unlock (with discount if eligible)
        if (reward.upgrade_price_cents && reward.upgrade_price_cents > 0) {
          claimOptions.push({ upgrade: { purchase_type: 'direct_unlock', price_cents: reward.upgrade_price_cents } });
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
      let currentStatus: string = 'available';
      if (!availability.available) {
        currentStatus = availability.reason || 'unavailable';
      }

      // Calculate discount for this user - use effective_tier for discounts
      const userDiscount = calculateUserDiscount(userQualification.effective_tier, reward.tier, reward);
      const finalPrice = Math.max(0, reward.upgrade_price_cents - userDiscount);
      const discountPercentage = userDiscount > 0 ? 
        Math.round((userDiscount / reward.upgrade_price_cents) * 100) : 0;
      
      // Get campaign progress if applicable
      const campaignProgress = getCampaignProgress(reward);

      return {
        id: reward.id,
        title: reward.title,
        description: reward.description,
        reward_type: reward.reward_type,
        tier: reward.tier,
        user_can_claim_free: canClaimFree,
        claim_options: claimOptions,
        tier_boost_price_cents: reward.upgrade_price_cents, // Keep existing for compatibility
        direct_unlock_price_cents: reward.upgrade_price_cents,
        
        // Enhanced with discount information
        upgrade_price_cents: reward.upgrade_price_cents, // Full price
        user_discount_eligible: userDiscount > 0,
        user_discount_amount_cents: userDiscount,
        user_discount_percentage: discountPercentage,
        user_final_price_cents: finalPrice,
        discount_description: userDiscount > 0 ? 
          `Your ${userQualification.effective_tier} status saves you $${(userDiscount/100).toFixed(0)} (${discountPercentage}%)` : '',
          
        // Campaign context
        campaign_id: reward.campaign_id,
        campaign_title: reward.campaign_title,
        campaign_description: reward.campaign_id ? campaignDescriptions[reward.campaign_id] : undefined,
        campaign_status: reward.campaign_status,
        is_campaign_tier: reward.is_campaign_tier,
        campaign_progress: campaignProgress,
        
        // Credit campaign fields (1 credit = $1)
        credit_cost: reward.ticket_cost, // Map DB field to credit_cost for frontend
        is_credit_campaign: reward.is_ticket_campaign, // Map DB field
        // Note: cogs_cents excluded - sensitive commercial data
        
        // Club information (for modals)
        clubs: reward.clubs,
        
        // Existing fields
        inventory_status: inventoryStatus,
        current_status: currentStatus,
        available_at: availability.available_at,
        metadata: reward.metadata,
        created_at: reward.created_at
      };
    });

    // Format claimed rewards (including credit information)
    const claimedRewards = (userClaims || []).map((claim: any) => ({
      id: claim.id,
      reward_id: claim.reward_id,
      title: claim.tier_rewards?.title,
      claim_method: claim.claim_method,
      claimed_at: claim.claimed_at,
      access_status: claim.access_status,
      access_code: claim.access_code,
      // NEW: Ticket information
      campaign_id: claim.campaign_id,
      tickets_purchased: claim.tickets_purchased,
      tickets_available: claim.tickets_available,
      tickets_redeemed: claim.tickets_redeemed,
      is_ticket_claim: claim.is_ticket_claim
    }));

    // Calculate credit balances by campaign for this club (1 credit = $1)
    const creditBalancesByCampaign = new Map();
    if (userClaims) {
      userClaims.forEach((claim: any) => {
        if (claim.campaign_id && claim.is_ticket_claim) {
          const balance = creditBalancesByCampaign.get(claim.campaign_id) || 0;
          creditBalancesByCampaign.set(claim.campaign_id, 
            balance + (claim.tickets_purchased || 0) - (claim.tickets_redeemed || 0)
          );
        }
      });
    }

    // Compile response (enhanced with credit information)
    const response = {
      user_earned_tier: userQualification.earned_tier,
      user_effective_tier: userQualification.effective_tier,
      user_rolling_points: userQualification.current_points,
      rolling_window_days: 60,
      has_active_boost: userQualification.has_active_boost,
      quarterly_free_used: userQualification.quarterly_free_used,
      current_quarter: quarter,
      available_rewards: processedRewards,
      claimed_rewards: claimedRewards,
      // User's credit balances by campaign (1 credit = $1)
      user_credit_balances: Object.fromEntries(creditBalancesByCampaign)
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("[Club Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
