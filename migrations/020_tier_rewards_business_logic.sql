-- Migration 020: Tier Rewards Business Logic Functions
-- This migration adds the complex business logic functions for tier qualification and atomic claiming
-- Run this in the Supabase SQL editor AFTER migration 019

-- ============================================================================
-- TIER QUALIFICATION FUNCTIONS
-- ============================================================================

-- Function to get tier thresholds (matching current system)
CREATE OR REPLACE FUNCTION get_tier_thresholds()
RETURNS TABLE(tier TEXT, min_points INTEGER) AS $$
BEGIN
  RETURN QUERY VALUES
    ('cadet', 0),
    ('resident', 5000),
    ('headliner', 15000),
    ('superfan', 40000);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to compute tier from points
CREATE OR REPLACE FUNCTION compute_tier_from_points(points INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF points >= 40000 THEN RETURN 'superfan';
  ELSIF points >= 15000 THEN RETURN 'headliner';
  ELSIF points >= 5000 THEN RETURN 'resident';
  ELSE RETURN 'cadet';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get tier rank for comparison
CREATE OR REPLACE FUNCTION get_tier_rank(tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  CASE tier
    WHEN 'cadet' THEN RETURN 0;
    WHEN 'resident' THEN RETURN 1;
    WHEN 'headliner' THEN RETURN 2;
    WHEN 'superfan' THEN RETURN 3;
    ELSE RETURN 0;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get higher tier between two tiers
CREATE OR REPLACE FUNCTION get_higher_tier(tier1 TEXT, tier2 TEXT)
RETURNS TEXT AS $$
BEGIN
  IF get_tier_rank(tier1) >= get_tier_rank(tier2) THEN
    RETURN tier1;
  ELSE
    RETURN tier2;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get rolling earned points (excludes purchased points)
CREATE OR REPLACE FUNCTION get_rolling_earned_points(
  p_user_id UUID,
  p_club_id UUID,
  p_window_days INTEGER DEFAULT 60
)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER;
BEGIN
  -- Get points from tap_ins within rolling window
  SELECT COALESCE(SUM(points_earned), 0) INTO v_points
  FROM tap_ins
  WHERE user_id = p_user_id
    AND club_id = p_club_id
    AND created_at >= NOW() - INTERVAL '1 day' * p_window_days;
  
  RETURN v_points;
END;
$$ LANGUAGE plpgsql;

-- Function to get active temporary boost for current quarter
CREATE OR REPLACE FUNCTION get_active_temporary_boost(
  p_user_id UUID,
  p_club_id UUID,
  p_year INTEGER,
  p_quarter INTEGER
)
RETURNS temporary_tier_boosts AS $$
DECLARE
  v_boost temporary_tier_boosts;
BEGIN
  SELECT * INTO v_boost
  FROM temporary_tier_boosts
  WHERE user_id = p_user_id
    AND club_id = p_club_id
    AND quarter_year = p_year
    AND quarter_number = p_quarter
    AND is_consumed = false
    AND expires_at > NOW()
  ORDER BY expires_at ASC
  LIMIT 1;
  
  RETURN v_boost;
END;
$$ LANGUAGE plpgsql;

-- Function to check if quarterly free claim already used
CREATE OR REPLACE FUNCTION has_used_quarterly_free(
  p_user_id UUID,
  p_club_id UUID,
  p_year INTEGER,
  p_quarter INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM quarterly_claim_tracking
    WHERE user_id = p_user_id
      AND club_id = p_club_id
      AND quarter_year = p_year
      AND quarter_number = p_quarter
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- Comprehensive tier qualification function
CREATE OR REPLACE FUNCTION check_tier_qualification(
  p_user_id UUID,
  p_club_id UUID,
  p_target_tier TEXT,
  p_rolling_window_days INTEGER DEFAULT 60
)
RETURNS TABLE(
  qualified BOOLEAN,
  earned_tier TEXT,
  effective_tier TEXT,
  current_points INTEGER,
  required_points INTEGER,
  points_needed INTEGER,
  has_active_boost BOOLEAN,
  quarterly_free_used BOOLEAN
) AS $$
DECLARE
  v_rolling_points INTEGER;
  v_earned_tier TEXT;
  v_active_boost temporary_tier_boosts;
  v_effective_tier TEXT;
  v_required_points INTEGER;
  v_current_quarter_year INTEGER;
  v_current_quarter_number INTEGER;
  v_quarterly_free_used BOOLEAN;
BEGIN
  -- Get current quarter
  SELECT year, quarter INTO v_current_quarter_year, v_current_quarter_number
  FROM get_current_quarter();
  
  -- Get earned points in rolling window
  v_rolling_points := get_rolling_earned_points(p_user_id, p_club_id, p_rolling_window_days);
  
  -- Determine earned tier from points only
  v_earned_tier := compute_tier_from_points(v_rolling_points);
  
  -- Check for active temporary boost
  v_active_boost := get_active_temporary_boost(p_user_id, p_club_id, v_current_quarter_year, v_current_quarter_number);
  
  -- Determine effective tier (max of earned tier and boost tier)
  IF v_active_boost.id IS NOT NULL THEN
    v_effective_tier := get_higher_tier(v_earned_tier, v_active_boost.boosted_tier);
  ELSE
    v_effective_tier := v_earned_tier;
  END IF;
  
  -- Get required points for target tier
  SELECT min_points INTO v_required_points
  FROM get_tier_thresholds()
  WHERE tier = p_target_tier;
  
  IF v_required_points IS NULL THEN
    RAISE EXCEPTION 'Invalid target tier: %', p_target_tier;
  END IF;
  
  -- Check if quarterly free already used
  v_quarterly_free_used := has_used_quarterly_free(p_user_id, p_club_id, v_current_quarter_year, v_current_quarter_number);
  
  -- Return results
  RETURN QUERY SELECT
    get_tier_rank(v_effective_tier) >= get_tier_rank(p_target_tier) AS qualified,
    v_earned_tier AS earned_tier,
    v_effective_tier AS effective_tier,
    v_rolling_points AS current_points,
    v_required_points AS required_points,
    GREATEST(0, v_required_points - v_rolling_points) AS points_needed,
    v_active_boost.id IS NOT NULL AS has_active_boost,
    v_quarterly_free_used AS quarterly_free_used;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ATOMIC CLAIM PROCESSING
-- ============================================================================

-- Atomic function for processing free claims with concurrency protection
CREATE OR REPLACE FUNCTION atomic_free_claim(
  p_user_id UUID,
  p_reward_id UUID,
  p_club_id UUID,
  p_quarter_year INTEGER,
  p_quarter_number INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  claim_id UUID,
  error_code TEXT,
  error_message TEXT
) AS $$
DECLARE
  v_reward tier_rewards;
  v_qualification RECORD;
  v_claim_id UUID;
  v_access_code TEXT;
  v_active_boost temporary_tier_boosts;
  v_claim_method TEXT;
BEGIN
  -- Start by locking the reward row to prevent inventory race conditions
  SELECT * INTO v_reward
  FROM tier_rewards
  WHERE id = p_reward_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'REWARD_NOT_FOUND', 'Reward not found';
    RETURN;
  END IF;
  
  -- Check if reward is active and available
  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, 'REWARD_INACTIVE', 'Reward is not active';
    RETURN;
  END IF;
  
  -- Ensure provided club matches the reward's club
  IF v_reward.club_id IS DISTINCT FROM p_club_id THEN
    RETURN QUERY SELECT false, NULL::UUID, 'CLUB_MISMATCH', 'Reward does not belong to the provided club';
    RETURN;
  END IF;
  
  -- Check inventory limits
  IF v_reward.inventory_limit IS NOT NULL AND v_reward.inventory_claimed >= v_reward.inventory_limit THEN
    RETURN QUERY SELECT false, NULL::UUID, 'SOLD_OUT', 'This reward is no longer available';
    RETURN;
  END IF;
  
  -- Check if user already claimed this reward
  IF EXISTS(SELECT 1 FROM reward_claims WHERE user_id = p_user_id AND reward_id = p_reward_id) THEN
    RETURN QUERY SELECT false, NULL::UUID, 'ALREADY_CLAIMED', 'You have already claimed this reward';
    RETURN;
  END IF;
  
  -- Check if quarterly free claim already used
  IF has_used_quarterly_free(p_user_id, p_club_id, p_quarter_year, p_quarter_number) THEN
    RETURN QUERY SELECT false, NULL::UUID, 'QUARTER_LIMIT_EXCEEDED', 'You have already used your free claim for this quarter';
    RETURN;
  END IF;
  
  -- Check tier qualification
  SELECT * INTO v_qualification
  FROM check_tier_qualification(p_user_id, p_club_id, v_reward.tier, v_reward.rolling_window_days);
  
  IF NOT v_qualification.qualified THEN
    RETURN QUERY SELECT false, NULL::UUID, 'INSUFFICIENT_TIER', 'You do not meet the tier requirements for this reward';
    RETURN;
  END IF;
  
  -- Determine claim method (earned status vs temporary boost)
  v_active_boost := get_active_temporary_boost(p_user_id, p_club_id, p_quarter_year, p_quarter_number);
  
  IF v_active_boost.id IS NOT NULL AND get_tier_rank(v_active_boost.boosted_tier) >= get_tier_rank(v_reward.tier) THEN
    v_claim_method := 'temporary_boost';
    
    -- Consume the boost with concurrency protection
    UPDATE temporary_tier_boosts
    SET 
      is_consumed = true,
      consumed_at = NOW(),
      consumed_by_reward_id = p_reward_id
    WHERE id = v_active_boost.id
      AND is_consumed = false
    RETURNING id INTO v_active_boost.id;
    
    -- If not actually updated (already consumed), treat as earned_status
    IF v_active_boost.id IS NULL THEN
      v_claim_method := 'earned_status';
    END IF;
  ELSE
    v_claim_method := 'earned_status';
  END IF;
  
  -- Generate access code
  v_access_code := 'AC' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));
  
  -- Create the reward claim
  INSERT INTO reward_claims (
    user_id,
    reward_id,
    club_id,
    claim_method,
    user_tier_at_claim,
    user_points_at_claim,
    access_code
  ) VALUES (
    p_user_id,
    p_reward_id,
    p_club_id,
    'tier_qualified',
    v_qualification.effective_tier,
    v_qualification.current_points,
    v_access_code
  ) RETURNING id INTO v_claim_id;
  
  -- Track quarterly claim
  INSERT INTO quarterly_claim_tracking (
    user_id,
    club_id,
    quarter_year,
    quarter_number,
    reward_claim_id,
    claim_method,
    tier_at_claim
  ) VALUES (
    p_user_id,
    p_club_id,
    p_quarter_year,
    p_quarter_number,
    v_claim_id,
    v_claim_method,
    v_qualification.effective_tier
  );
  
  -- Return success
  RETURN QUERY SELECT true, v_claim_id, NULL::TEXT, NULL::TEXT;
  
EXCEPTION
  WHEN unique_violation THEN
    -- Handle race conditions gracefully
    IF SQLERRM LIKE '%reward_claims_user_id_reward_id_key%' THEN
      RETURN QUERY SELECT false, NULL::UUID, 'ALREADY_CLAIMED', 'You have already claimed this reward';
    ELSIF SQLERRM LIKE '%quarterly_claim_tracking%' THEN
      RETURN QUERY SELECT false, NULL::UUID, 'QUARTER_LIMIT_EXCEEDED', 'You have already used your free claim for this quarter';
    ELSE
      RETURN QUERY SELECT false, NULL::UUID, 'CONSTRAINT_VIOLATION', 'A database constraint was violated';
    END IF;
  WHEN OTHERS THEN
    -- Log the error and return generic message
    RAISE LOG 'Unexpected error in atomic_free_claim: % %', SQLSTATE, SQLERRM;
    RETURN QUERY SELECT false, NULL::UUID, 'DATABASE_ERROR', 'An unexpected database error occurred';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- REWARD AVAILABILITY FUNCTIONS
-- ============================================================================

-- Function to check reward availability
CREATE OR REPLACE FUNCTION check_reward_availability(p_reward_id UUID)
RETURNS TABLE(
  available BOOLEAN,
  reason TEXT,
  available_at TIMESTAMPTZ
) AS $$
DECLARE
  v_reward tier_rewards;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_reward
  FROM tier_rewards
  WHERE id = p_reward_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Reward not found', NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Check if reward is active
  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, 'Reward is inactive', NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Check inventory
  IF v_reward.inventory_limit IS NOT NULL AND v_reward.inventory_claimed >= v_reward.inventory_limit THEN
    RETURN QUERY SELECT false, 'Sold out', NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Check availability window
  IF v_reward.availability_type = 'limited_time' THEN
    IF v_reward.available_start IS NOT NULL AND v_now < v_reward.available_start THEN
      RETURN QUERY SELECT false, 'Not yet available', v_reward.available_start;
      RETURN;
    END IF;
    
    IF v_reward.available_end IS NOT NULL AND v_now > v_reward.available_end THEN
      RETURN QUERY SELECT false, 'Expired', NULL::TIMESTAMPTZ;
      RETURN;
    END IF;
  END IF;
  
  IF v_reward.availability_type = 'seasonal' THEN
    IF v_reward.available_start IS NOT NULL AND v_reward.available_end IS NOT NULL THEN
      IF v_now < v_reward.available_start OR v_now > v_reward.available_end THEN
        RETURN QUERY SELECT false, 'Out of season', 
          CASE WHEN v_reward.available_start > v_now THEN v_reward.available_start ELSE NULL END;
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT true, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DYNAMIC PRICING FUNCTIONS
-- ============================================================================

-- Function to calculate dynamic safety factor based on demand and inventory
CREATE OR REPLACE FUNCTION calculate_dynamic_safety_factor(p_reward_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
  v_reward tier_rewards;
  v_base_s DECIMAL(3,2) := 1.25;
  v_scarcity_multiplier DECIMAL(3,2) := 1.0;
  v_demand_multiplier DECIMAL(3,2) := 1.0;
  v_conversion_multiplier DECIMAL(3,2) := 1.0;
  v_dynamic_s DECIMAL(3,2);
  v_stock_ratio DECIMAL(3,2);
  v_recent_upgrades INTEGER;
  v_conversion_rate DECIMAL(3,2);
BEGIN
  SELECT * INTO v_reward
  FROM tier_rewards
  WHERE id = p_reward_id;
  
  IF NOT FOUND THEN
    RETURN v_base_s;
  END IF;
  
  -- Scarcity multiplier based on inventory
  IF v_reward.inventory_limit IS NOT NULL AND v_reward.inventory_limit > 0 THEN
    v_stock_ratio := (v_reward.inventory_limit - v_reward.inventory_claimed)::DECIMAL / v_reward.inventory_limit;
    
    IF v_stock_ratio < 0.1 THEN
      v_scarcity_multiplier := 1.2; -- Very low stock
    ELSIF v_stock_ratio < 0.3 THEN
      v_scarcity_multiplier := 1.1; -- Low stock
    ELSIF v_stock_ratio > 0.8 THEN
      v_scarcity_multiplier := 0.9; -- High stock
    END IF;
  END IF;
  
  -- Demand multiplier based on recent upgrade purchases (last 7 days)
  SELECT COUNT(*) INTO v_recent_upgrades
  FROM upgrade_transactions
  WHERE reward_id = p_reward_id
    AND status = 'completed'
    AND created_at >= NOW() - INTERVAL '7 days';
  
  IF v_recent_upgrades > 10 THEN
    v_demand_multiplier := 1.15; -- High demand
  ELSIF v_recent_upgrades < 2 THEN
    v_demand_multiplier := 0.95; -- Low demand
  END IF;
  
  -- Conversion rate multiplier (upgrade purchases / total views - simplified)
  SELECT COUNT(*) FILTER (WHERE claim_method = 'upgrade_purchased')::DECIMAL / 
         NULLIF(COUNT(*), 0) INTO v_conversion_rate
  FROM reward_claims
  WHERE reward_id = p_reward_id;
  
  IF v_conversion_rate IS NOT NULL THEN
    IF v_conversion_rate < 0.05 THEN
      v_conversion_multiplier := 0.9; -- Low conversion, reduce price
    ELSIF v_conversion_rate > 0.25 THEN
      v_conversion_multiplier := 1.1; -- High conversion, can charge more
    END IF;
  END IF;
  
  -- Calculate dynamic safety factor
  v_dynamic_s := v_base_s * v_scarcity_multiplier * v_demand_multiplier * v_conversion_multiplier;
  
  -- Clamp between 1.1 and 1.5
  RETURN GREATEST(1.1, LEAST(1.5, v_dynamic_s));
END;
$$ LANGUAGE plpgsql;

-- Function to update safety factors for all active rewards (can be run periodically)
CREATE OR REPLACE FUNCTION update_dynamic_safety_factors()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_reward RECORD;
  v_new_factor DECIMAL(3,2);
BEGIN
  FOR v_reward IN 
    SELECT id FROM tier_rewards 
    WHERE is_active = true AND artist_cost_estimate_cents > 0
  LOOP
    v_new_factor := calculate_dynamic_safety_factor(v_reward.id);
    
    UPDATE tier_rewards
    SET safety_factor = v_new_factor
    WHERE id = v_reward.id
      AND safety_factor IS DISTINCT FROM v_new_factor; -- Only update if changed
    
    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON FUNCTION atomic_free_claim IS 'Tier rewards business logic - Migration 020 - Created on 2024-01-XX';
