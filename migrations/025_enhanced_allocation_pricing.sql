-- Migration 025: Enhanced Allocation-Based Pricing Model
-- Adds free allocation planning and profitability guarantee calculations
-- Run this in the Supabase SQL editor AFTER previous migrations

-- ============================================================================
-- UPDATE TIER_REWARDS TABLE SCHEMA
-- ============================================================================

-- Add new columns for allocation-based pricing
ALTER TABLE tier_rewards 
ADD COLUMN IF NOT EXISTS total_inventory INTEGER,
ADD COLUMN IF NOT EXISTS max_free_allocation INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS calculated_free_allocation INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_paid_purchases INTEGER,
ADD COLUMN IF NOT EXISTS existing_tier_holders_count INTEGER DEFAULT 0;

-- Update existing inventory_limit to be derived from total_inventory
-- (keeping both for backward compatibility during transition)
COMMENT ON COLUMN tier_rewards.inventory_limit IS 'Legacy field - use total_inventory for new rewards';
COMMENT ON COLUMN tier_rewards.total_inventory IS 'Total units to produce/fulfill (free + paid)';
COMMENT ON COLUMN tier_rewards.max_free_allocation IS 'Max free units artist wants to give to existing tier holders';
COMMENT ON COLUMN tier_rewards.calculated_free_allocation IS 'Actual free units: min(max_free, existing_tier_holders)';
COMMENT ON COLUMN tier_rewards.expected_paid_purchases IS 'Expected paid units: total_inventory - calculated_free_allocation';
COMMENT ON COLUMN tier_rewards.existing_tier_holders_count IS 'Cached count of existing tier holders for display';

-- ============================================================================
-- ENHANCED PRICING CALCULATION FUNCTION
-- ============================================================================

-- Function to count existing tier holders for a specific tier in a club
CREATE OR REPLACE FUNCTION count_existing_tier_holders(
  p_club_id UUID,
  p_tier TEXT,
  p_rolling_window_days INTEGER DEFAULT 60
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count active club members who qualify for this tier or higher
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT 
      cm.user_id,
      get_rolling_earned_points(cm.user_id, p_club_id, p_rolling_window_days) as points,
      compute_tier_from_points(get_rolling_earned_points(cm.user_id, p_club_id, p_rolling_window_days)) as user_tier
    FROM club_memberships cm
    WHERE cm.club_id = p_club_id 
      AND cm.status = 'active'
  ) qualified_users
  WHERE get_tier_rank(qualified_users.user_tier) >= get_tier_rank(p_tier);
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Enhanced pricing calculation trigger with allocation consideration
CREATE OR REPLACE FUNCTION calculate_upgrade_price()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_tier_holders INTEGER;
  v_total_cogs_cents INTEGER;
  v_revenue_per_paid_unit_cents INTEGER;
BEGIN
  -- Get count of existing tier holders
  v_existing_tier_holders := count_existing_tier_holders(NEW.club_id, NEW.tier, NEW.rolling_window_days);
  NEW.existing_tier_holders_count := v_existing_tier_holders;
  
  -- Only calculate upgrade price if artist sets a cost estimate and inventory
  IF NEW.artist_cost_estimate_cents > 0 AND NEW.total_inventory > 0 THEN
    
    -- Calculate actual free allocation (min of artist's max and existing holders)
    NEW.calculated_free_allocation := LEAST(COALESCE(NEW.max_free_allocation, 0), v_existing_tier_holders);
    
    -- Calculate expected paid purchases (ensure at least 1 to avoid division by zero)
    NEW.expected_paid_purchases := GREATEST(1, NEW.total_inventory - NEW.calculated_free_allocation);
    
    -- Calculate total COGS for all units (free + paid)
    v_total_cogs_cents := NEW.artist_cost_estimate_cents * NEW.total_inventory;
    
    -- Calculate revenue needed per paid unit to cover all COGS
    v_revenue_per_paid_unit_cents := v_total_cogs_cents / NEW.expected_paid_purchases;
    
    -- Apply payment processing margin and safety factor
    -- U = ceil(((K * T) / (P * m)) * S)
    NEW.upgrade_price_cents := CEIL((v_revenue_per_paid_unit_cents / 0.96) * NEW.safety_factor);
    
    -- Update legacy inventory_limit for backward compatibility
    IF NEW.inventory_limit IS NULL THEN
      NEW.inventory_limit := NEW.total_inventory;
    END IF;
    
  ELSIF NEW.artist_cost_estimate_cents = 0 THEN
    -- Free-only rewards
    NEW.upgrade_price_cents := NULL;
    NEW.calculated_free_allocation := v_existing_tier_holders;
    NEW.expected_paid_purchases := 0;
    
    -- Set inventory_limit to unlimited for free rewards if not specified
    IF NEW.inventory_limit IS NULL AND NEW.total_inventory IS NULL THEN
      NEW.inventory_limit := NULL; -- Unlimited
    ELSIF NEW.total_inventory IS NOT NULL THEN
      NEW.inventory_limit := NEW.total_inventory;
    END IF;
    
  ELSE
    -- Invalid configuration
    NEW.upgrade_price_cents := NULL;
    NEW.calculated_free_allocation := 0;
    NEW.expected_paid_purchases := NEW.total_inventory;
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTIONS FOR ADMIN INTERFACE
-- ============================================================================

-- Function to preview pricing impact before saving
CREATE OR REPLACE FUNCTION preview_reward_pricing(
  p_club_id UUID,
  p_tier TEXT,
  p_artist_cost_estimate_cents INTEGER,
  p_total_inventory INTEGER,
  p_max_free_allocation INTEGER,
  p_safety_factor DECIMAL DEFAULT 1.25,
  p_rolling_window_days INTEGER DEFAULT 60
)
RETURNS TABLE(
  existing_tier_holders INTEGER,
  calculated_free_allocation INTEGER,
  expected_paid_purchases INTEGER,
  total_cogs_cents INTEGER,
  revenue_per_paid_unit_cents INTEGER,
  upgrade_price_cents INTEGER,
  total_potential_revenue_cents INTEGER,
  profit_margin_cents INTEGER,
  is_profitable BOOLEAN
) AS $$
DECLARE
  v_existing_tier_holders INTEGER;
  v_calculated_free_allocation INTEGER;
  v_expected_paid_purchases INTEGER;
  v_total_cogs_cents INTEGER;
  v_revenue_per_paid_unit_cents INTEGER;
  v_upgrade_price_cents INTEGER;
  v_total_potential_revenue_cents INTEGER;
  v_profit_margin_cents INTEGER;
BEGIN
  -- Get existing tier holders
  v_existing_tier_holders := count_existing_tier_holders(p_club_id, p_tier, p_rolling_window_days);
  
  -- Calculate allocations
  v_calculated_free_allocation := LEAST(p_max_free_allocation, v_existing_tier_holders);
  v_expected_paid_purchases := GREATEST(1, p_total_inventory - v_calculated_free_allocation);
  
  -- Calculate costs and pricing
  v_total_cogs_cents := p_artist_cost_estimate_cents * p_total_inventory;
  v_revenue_per_paid_unit_cents := v_total_cogs_cents / v_expected_paid_purchases;
  v_upgrade_price_cents := CEIL((v_revenue_per_paid_unit_cents / 0.96) * p_safety_factor);
  
  -- Calculate potential outcomes
  v_total_potential_revenue_cents := v_upgrade_price_cents * v_expected_paid_purchases;
  v_profit_margin_cents := v_total_potential_revenue_cents - v_total_cogs_cents;
  
  RETURN QUERY SELECT
    v_existing_tier_holders,
    v_calculated_free_allocation,
    v_expected_paid_purchases,
    v_total_cogs_cents,
    v_revenue_per_paid_unit_cents,
    v_upgrade_price_cents,
    v_total_potential_revenue_cents,
    v_profit_margin_cents,
    v_profit_margin_cents > 0 as is_profitable;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATE ANALYTICS VIEW
-- ============================================================================

-- Drop and recreate the analytics view to include allocation metrics
DROP VIEW IF EXISTS v_tier_rewards_with_stats;

CREATE VIEW v_tier_rewards_with_stats AS
SELECT 
  tr.*,
  c.name as club_name,
  
  -- Claim statistics
  COALESCE(claim_stats.total_claims, 0) as total_claims,
  COALESCE(claim_stats.tier_qualified_claims, 0) as tier_qualified_claims,
  COALESCE(claim_stats.upgrade_claims, 0) as upgrade_claims,
  COALESCE(claim_stats.total_upgrade_revenue_cents, 0) as total_upgrade_revenue_cents,
  
  -- Allocation metrics
  CASE 
    WHEN tr.calculated_free_allocation > 0 AND tr.expected_paid_purchases > 0 THEN
      ROUND((tr.calculated_free_allocation::DECIMAL / tr.total_inventory) * 100, 1)
    ELSE 0
  END as free_allocation_percentage,
  
  CASE
    WHEN COALESCE(claim_stats.total_upgrade_revenue_cents, 0) > 0 AND tr.total_inventory > 0 THEN
      COALESCE(claim_stats.total_upgrade_revenue_cents, 0) - (tr.artist_cost_estimate_cents * tr.total_inventory)
    ELSE 0
  END as estimated_profit_cents,
  
  -- Availability status
  CASE 
    WHEN NOT tr.is_active THEN 'inactive'
    WHEN tr.availability_type = 'permanent' THEN 'available'
    WHEN tr.availability_type = 'limited_time' AND NOW() < tr.available_start THEN 'upcoming'
    WHEN tr.availability_type = 'limited_time' AND NOW() > tr.available_end THEN 'expired'
    WHEN tr.availability_type = 'seasonal' AND NOW() BETWEEN tr.available_start AND tr.available_end THEN 'available'
    WHEN tr.availability_type = 'seasonal' THEN 'out_of_season'
    ELSE 'available'
  END as current_status,
  
  -- Inventory status
  CASE 
    WHEN tr.total_inventory IS NULL AND tr.inventory_limit IS NULL THEN 'unlimited'
    WHEN COALESCE(tr.total_inventory, tr.inventory_limit) IS NOT NULL AND 
         tr.inventory_claimed >= COALESCE(tr.total_inventory, tr.inventory_limit) THEN 'sold_out'
    WHEN COALESCE(tr.total_inventory, tr.inventory_limit) IS NOT NULL AND 
         tr.inventory_claimed >= (COALESCE(tr.total_inventory, tr.inventory_limit) * 0.9) THEN 'low_stock'
    ELSE 'available'
  END as inventory_status

FROM tier_rewards tr
LEFT JOIN clubs c ON tr.club_id = c.id
LEFT JOIN (
  SELECT 
    reward_id,
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE claim_method = 'tier_qualified') as tier_qualified_claims,
    COUNT(*) FILTER (WHERE claim_method = 'upgrade_purchased') as upgrade_claims,
    SUM(upgrade_amount_cents) FILTER (WHERE claim_method = 'upgrade_purchased') as total_upgrade_revenue_cents
  FROM reward_claims
  GROUP BY reward_id
) claim_stats ON tr.id = claim_stats.reward_id;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON TABLE tier_rewards IS 'Tier rewards with enhanced allocation-based pricing - Migration 025 - Created on 2024-01-15';
