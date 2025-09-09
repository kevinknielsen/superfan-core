import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../supabase";
import { type } from "arktype";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Validation schemas based on TIER_REWARDS_IMPLEMENTATION.md
const createTierRewardSchema = type({
  club_id: "string",
  title: "string",
  description: "string",
  tier: "'cadet'|'resident'|'headliner'|'superfan'",
  reward_type: "'access'|'digital_product'|'physical_product'|'experience'",
  artist_cost_estimate_cents: "number", // Will validate range manually
  safety_factor: "number?", // Optional, defaults to 1.25
  availability_type: "'permanent'|'seasonal'|'limited_time'?",
  available_start: "string?", // ISO date
  available_end: "string?", // ISO date
  inventory_limit: "number?",
  rolling_window_days: "number?", // Defaults to 60
  metadata: {
    instructions: "string",
    redemption_url: "string?",
    details: "string?",
    estimated_shipping: "string?",
    location: "string?",
    requirements: "string?"
  }
});

const updateTierRewardSchema = type({
  id: "string",
  club_id: "string",
  title: "string",
  description: "string",
  tier: "'cadet'|'resident'|'headliner'|'superfan'",
  reward_type: "'access'|'digital_product'|'physical_product'|'experience'",
  artist_cost_estimate_cents: "number",
  safety_factor: "number?",
  availability_type: "'permanent'|'seasonal'|'limited_time'?",
  available_start: "string?",
  available_end: "string?",
  inventory_limit: "number?",
  rolling_window_days: "number?",
  metadata: {
    instructions: "string",
    redemption_url: "string?",
    details: "string?",
    estimated_shipping: "string?",
    location: "string?",
    requirements: "string?"
  }
});

// Get all tier rewards with stats (admin only)
export async function GET(request: NextRequest) {
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
    console.log('[Admin Tier Rewards API] Starting GET request for user:', auth.userId);

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get('club_id');
    const tier = searchParams.get('tier');
    const rewardType = searchParams.get('reward_type');
    const availabilityType = searchParams.get('availability_type');
    const isActive = searchParams.get('is_active');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('[Admin Tier Rewards API] Query parameters:', { clubId, tier, rewardType, availabilityType, isActive, limit, offset });

    // First, test if the table exists with a simple query
    console.log('[Admin Tier Rewards API] Testing tier_rewards table access...');
    const { data: testData, error: testError } = await supabaseAny
      .from('tier_rewards')
      .select('id')
      .limit(1);

    if (testError) {
      console.error('[Admin Tier Rewards API] tier_rewards table test failed:', testError);
      return NextResponse.json({ 
        error: "Database table access failed", 
        details: testError.message,
        code: testError.code,
        hint: "The tier_rewards table may not exist. Please run the database migrations first."
      }, { status: 500 });
    }

    console.log('[Admin Tier Rewards API] tier_rewards table accessible, proceeding with full query...');

    // Use the base table for now, we'll add analytics later
    let query = supabaseAny
      .from('tier_rewards')
      .select(`
        *,
        clubs!inner(name)
      `);

    // Apply filters
    if (clubId) query = query.eq('club_id', clubId);
    if (tier) query = query.eq('tier', tier);
    if (rewardType) query = query.eq('reward_type', rewardType);
    if (availabilityType) query = query.eq('availability_type', availabilityType);
    if (isActive !== null) query = query.eq('is_active', isActive === 'true');

    // Apply pagination and ordering
    const { data: tierRewards, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Admin Tier Rewards API] Error fetching tier rewards:', error);
      return NextResponse.json({ 
        error: "Failed to fetch tier rewards", 
        details: error.message,
        code: error.code 
      }, { status: 500 });
    }

    console.log('[Admin Tier Rewards API] Successfully fetched', tierRewards?.length || 0, 'tier rewards');

    // Format response with club names (similar to existing unlocks API)
    const formattedRewards = (tierRewards || []).map((reward: any) => ({
      ...reward,
      club_name: reward.clubs?.name,
      clubs: undefined // Remove the nested object
    }));

    return NextResponse.json(formattedRewards);

  } catch (error) {
    console.error("[Admin Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create new tier reward (admin only)
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const tierRewardData = createTierRewardSchema(body);

    if (tierRewardData instanceof type.errors) {
      console.error("[Admin Tier Rewards API] Invalid request body:", tierRewardData);
      return NextResponse.json(
        { error: "Invalid request body", details: tierRewardData.summary },
        { status: 400 }
      );
    }

    // Manual validation for ranges
    if (tierRewardData.artist_cost_estimate_cents < 0 || tierRewardData.artist_cost_estimate_cents > 100000) {
      return NextResponse.json(
        { error: "artist_cost_estimate_cents must be between 0 and 100000 cents ($0-$1000)" },
        { status: 400 }
      );
    }

    if (tierRewardData.safety_factor && (tierRewardData.safety_factor < 1.1 || tierRewardData.safety_factor > 2.0)) {
      return NextResponse.json(
        { error: "safety_factor must be between 1.1 and 2.0" },
        { status: 400 }
      );
    }

    if (tierRewardData.inventory_limit && tierRewardData.inventory_limit <= 0) {
      return NextResponse.json(
        { error: "inventory_limit must be greater than 0" },
        { status: 400 }
      );
    }

    if (tierRewardData.rolling_window_days && tierRewardData.rolling_window_days <= 0) {
      return NextResponse.json(
        { error: "rolling_window_days must be greater than 0" },
        { status: 400 }
      );
    }

    // Apply default values
    const finalData = {
      ...tierRewardData,
      safety_factor: tierRewardData.safety_factor ?? 1.25,
      rolling_window_days: tierRewardData.rolling_window_days ?? 60,
      availability_type: tierRewardData.availability_type ?? 'permanent'
    };

    // Validate availability dates if required
    if (finalData.availability_type !== 'permanent') {
      if (!finalData.available_start || !finalData.available_end) {
        return NextResponse.json(
          { error: "available_start and available_end are required for non-permanent rewards" },
          { status: 400 }
        );
      }
      
      if (new Date(finalData.available_start) > new Date(finalData.available_end)) {
        return NextResponse.json(
          { error: "available_start must be before available_end" },
          { status: 400 }
        );
      }
    }

    // Create the tier reward (upgrade_price_cents will be auto-calculated by trigger)
    console.log('[Admin Tier Rewards API] Creating reward with data:', finalData);
    
    const { data: newReward, error } = await supabaseAny
      .from('tier_rewards')
      .insert(finalData)
      .select(`
        *,
        clubs!inner(name)
      `)
      .single();

    if (error) {
      console.error('Error creating tier reward:', error);
      
      // Handle specific database errors
      if (error.code === '23503') {
        return NextResponse.json(
          { error: "Invalid club_id - club not found" },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to create tier reward", message: error.message },
        { status: 500 }
      );
    }

    console.log(`[Admin Tier Rewards API] Created tier reward: ${newReward.id} for club: ${newReward.club_id}`);
    
    // Format response with club name
    const formattedReward = {
      ...newReward,
      club_name: newReward.clubs?.name,
      clubs: undefined
    };
    
    return NextResponse.json(formattedReward, { status: 201 });

  } catch (error) {
    console.error("[Admin Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update existing tier reward (admin only)
export async function PUT(request: NextRequest) {
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
    const body = await request.json();
    const tierRewardData = updateTierRewardSchema(body);

    if (tierRewardData instanceof type.errors) {
      console.error("[Admin Tier Rewards API] Invalid request body:", tierRewardData);
      return NextResponse.json(
        { error: "Invalid request body", details: tierRewardData.summary },
        { status: 400 }
      );
    }

    // Validate availability dates if required
    if (tierRewardData.availability_type !== 'permanent') {
      if (!tierRewardData.available_start || !tierRewardData.available_end) {
        return NextResponse.json(
          { error: "available_start and available_end are required for non-permanent rewards" },
          { status: 400 }
        );
      }
      
      if (new Date(tierRewardData.available_start) > new Date(tierRewardData.available_end)) {
        return NextResponse.json(
          { error: "available_start must be before available_end" },
          { status: 400 }
        );
      }
    }

    const { id, ...updateData } = tierRewardData;

    // Update the tier reward (upgrade_price_cents will be recalculated by trigger)
    const { data: updatedReward, error } = await supabaseAny
      .from('tier_rewards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tier reward:', error);
      
      if (error.code === '23503') {
        return NextResponse.json(
          { error: "Invalid club_id - club not found" },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: "Failed to update tier reward", message: error.message },
        { status: 500 }
      );
    }

    if (!updatedReward) {
      return NextResponse.json(
        { error: "Tier reward not found" },
        { status: 404 }
      );
    }

    console.log(`[Admin Tier Rewards API] Updated tier reward: ${updatedReward.id}`);
    return NextResponse.json(updatedReward);

  } catch (error) {
    console.error("[Admin Tier Rewards API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
