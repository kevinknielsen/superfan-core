-- Migration: Unified Peg System (100 points = $1)
-- This migration moves from club-specific pricing to a unified peg model
-- with operator controls for earn/redeem rates and promotional campaigns

BEGIN;

-- ============================================================================
-- STEP 1: Create new operator control tables
-- ============================================================================

-- Status tier multipliers for each club
CREATE TABLE IF NOT EXISTS status_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('cadet', 'resident', 'headliner', 'superfan')),
  earn_boost DECIMAL(4,3) DEFAULT 1.000 CHECK (earn_boost BETWEEN 1.000 AND 3.000),
  redeem_boost DECIMAL(4,3) DEFAULT 1.000 CHECK (redeem_boost BETWEEN 0.800 AND 1.200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, status)
);

-- Settlement pools for clubs (tracks their ability to subsidize discounts)
CREATE TABLE IF NOT EXISTS club_settlement_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE UNIQUE,
  balance_usd_cents INTEGER DEFAULT 0 CHECK (balance_usd_cents >= 0),
  reserved_usd_cents INTEGER DEFAULT 0 CHECK (reserved_usd_cents >= 0),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: Add operator control columns to clubs table
-- ============================================================================

-- Add new operator control columns
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS earn_multiplier DECIMAL(4,3) DEFAULT 1.000 CHECK (earn_multiplier BETWEEN 0.500 AND 5.000);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS redeem_multiplier DECIMAL(4,3) DEFAULT 1.000 CHECK (redeem_multiplier BETWEEN 0.500 AND 2.000);

-- Promotional campaign controls
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS promo_active BOOLEAN DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS promo_description TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS promo_discount_pts INTEGER DEFAULT 0 CHECK (promo_discount_pts >= 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS promo_expires_at TIMESTAMPTZ;

-- Add system constants as columns for reference (read-only)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS system_peg_rate INTEGER DEFAULT 100; -- 100 points = $1
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS system_purchase_rate INTEGER DEFAULT 1; -- 1 cent per point

-- ============================================================================
-- STEP 3: Migrate existing point balances to unified peg
-- ============================================================================

-- Current system analysis:
-- - Test clubs: 10 cents per point (point_sell_cents = 10) → $1 per 1000 points
-- - Default clubs: 120 cents per point (point_sell_cents = 120) → $1.20 per 1000 points  
-- - Target: 1 cent per point → $1 per 100 points

-- Create a temporary table to track the conversion rates
CREATE TEMP TABLE conversion_rates AS
SELECT 
  id as club_id,
  name,
  point_sell_cents,
  CASE 
    -- Test clubs (10 cents per point) → multiply by 10 to get to 1 cent per point
    WHEN point_sell_cents = 10 THEN 10.0
    -- Default clubs (120 cents per point) → divide by 1.2 to get to 1 cent per point  
    WHEN point_sell_cents = 120 THEN 0.833333
    -- Other clubs → calculate conversion factor
    ELSE (point_sell_cents::DECIMAL / 100.0)
  END as conversion_factor
FROM clubs 
WHERE point_sell_cents IS NOT NULL;

-- Show conversion plan (for logging)
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE 'Point Balance Conversion Plan:';
  FOR rec IN SELECT * FROM conversion_rates ORDER BY name LOOP
    RAISE NOTICE '- %: % cents per point → multiply by %', rec.name, rec.point_sell_cents, rec.conversion_factor;
  END LOOP;
END $$;

-- Convert point wallet balances
UPDATE point_wallets pw SET
  balance_pts = ROUND(balance_pts * cr.conversion_factor),
  earned_pts = ROUND(earned_pts * cr.conversion_factor),
  purchased_pts = ROUND(purchased_pts * cr.conversion_factor),
  spent_pts = ROUND(spent_pts * cr.conversion_factor),
  escrowed_pts = ROUND(escrowed_pts * cr.conversion_factor),
  updated_at = NOW()
FROM conversion_rates cr
WHERE pw.club_id = cr.club_id;

-- Convert point transaction history (keep USD amounts the same)
UPDATE point_transactions pt SET
  pts = ROUND(pts * cr.conversion_factor)
FROM point_wallets pw, conversion_rates cr
WHERE pt.wallet_id = pw.id 
AND pw.club_id = cr.club_id;

-- ============================================================================
-- STEP 4: Initialize default operator settings
-- ============================================================================

-- Set default operator controls for all clubs
UPDATE clubs SET
  earn_multiplier = 1.000,
  redeem_multiplier = 1.000,
  promo_active = false,
  promo_discount_pts = 0,
  system_peg_rate = 100,
  system_purchase_rate = 1
WHERE earn_multiplier IS NULL;

-- Initialize default status multipliers for all clubs
INSERT INTO status_multipliers (club_id, status, earn_boost, redeem_boost)
SELECT 
  c.id,
  s.status,
  CASE s.status
    WHEN 'cadet' THEN 1.000
    WHEN 'resident' THEN 1.100  -- 10% earn boost
    WHEN 'headliner' THEN 1.250 -- 25% earn boost  
    WHEN 'superfan' THEN 1.500  -- 50% earn boost
  END,
  CASE s.status
    WHEN 'cadet' THEN 1.000
    WHEN 'resident' THEN 0.950  -- 5% redeem discount
    WHEN 'headliner' THEN 0.900 -- 10% redeem discount
    WHEN 'superfan' THEN 0.850  -- 15% redeem discount
  END
FROM clubs c
CROSS JOIN (VALUES ('cadet'), ('resident'), ('headliner'), ('superfan')) AS s(status)
ON CONFLICT (club_id, status) DO NOTHING;

-- Initialize settlement pools for all clubs (start with $100 buffer)
INSERT INTO club_settlement_pools (club_id, balance_usd_cents)
SELECT id, 10000 -- $100 in cents
FROM clubs
ON CONFLICT (club_id) DO NOTHING;

-- ============================================================================
-- STEP 5: Update system functions for unified peg
-- ============================================================================

-- Update the spending function to work with unified peg
CREATE OR REPLACE FUNCTION spend_points_unified(
  p_wallet_id UUID,
  p_points_to_spend INTEGER,
  p_preserve_status BOOLEAN DEFAULT false,
  p_current_status TEXT DEFAULT 'cadet'
) RETURNS JSON AS $$
DECLARE
  wallet_record RECORD;
  status_threshold INTEGER;
  available_purchased INTEGER;
  available_earned INTEGER;
  spend_purchased INTEGER;
  spend_earned INTEGER;
  result JSON;
BEGIN
  -- Get current wallet state
  SELECT * INTO wallet_record FROM point_wallets WHERE id = p_wallet_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  -- Check if user has enough points
  IF wallet_record.balance_pts < p_points_to_spend THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient points');
  END IF;
  
  -- Determine status threshold if protection is enabled (unified peg thresholds)
  status_threshold := CASE 
    WHEN NOT p_preserve_status THEN 0
    WHEN p_current_status = 'superfan' THEN 40000  -- 400 points at $1 per 100 pts
    WHEN p_current_status = 'headliner' THEN 15000 -- 150 points at $1 per 100 pts
    WHEN p_current_status = 'resident' THEN 5000   -- 50 points at $1 per 100 pts
    ELSE 0
  END;
  
  -- Calculate available points by source
  available_purchased := wallet_record.purchased_pts;
  available_earned := GREATEST(0, wallet_record.earned_pts - status_threshold);
  
  -- Determine spending breakdown (purchased first, then earned)
  spend_purchased := LEAST(p_points_to_spend, available_purchased);
  spend_earned := p_points_to_spend - spend_purchased;
  
  -- Check if we can spend the required earned points
  IF spend_earned > available_earned THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient points (status protection enabled)',
      'available_purchased', available_purchased,
      'available_earned', available_earned,
      'required_earned', spend_earned
    );
  END IF;
  
  -- Execute the spending
  UPDATE point_wallets SET
    balance_pts = balance_pts - p_points_to_spend,
    purchased_pts = purchased_pts - spend_purchased,
    earned_pts = earned_pts - spend_earned,
    spent_pts = spent_pts + p_points_to_spend,
    updated_at = NOW()
  WHERE id = p_wallet_id;
  
  -- Return success with breakdown
  RETURN json_build_object(
    'success', true,
    'points_spent', p_points_to_spend,
    'spent_purchased', spend_purchased,
    'spent_earned', spend_earned,
    'remaining_balance', wallet_record.balance_pts - p_points_to_spend
  );
END;
$$ LANGUAGE plpgsql;

-- Function to calculate display price with operator controls
CREATE OR REPLACE FUNCTION calculate_display_price(
  p_base_usd_cents INTEGER,
  p_club_id UUID,
  p_user_status TEXT DEFAULT 'cadet'
) RETURNS INTEGER AS $$
DECLARE
  club_record RECORD;
  status_record RECORD;
  base_points INTEGER;
  final_price INTEGER;
BEGIN
  -- Get club settings
  SELECT earn_multiplier, redeem_multiplier, promo_active, promo_discount_pts
  INTO club_record
  FROM clubs WHERE id = p_club_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found';
  END IF;
  
  -- Get status multiplier
  SELECT redeem_boost INTO status_record
  FROM status_multipliers 
  WHERE club_id = p_club_id AND status = p_user_status;
  
  IF NOT FOUND THEN
    status_record.redeem_boost := 1.000; -- Default if not found
  END IF;
  
  -- Calculate base points (unified peg: $1 = 100 points)
  base_points := p_base_usd_cents; -- 1 cent = 1 point
  
  -- Apply club and status multipliers
  final_price := ROUND(base_points * club_record.redeem_multiplier * status_record.redeem_boost);
  
  -- Apply promotional discount
  IF club_record.promo_active THEN
    final_price := GREATEST(0, final_price - club_record.promo_discount_pts);
  END IF;
  
  RETURN final_price;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Clean up old pricing columns (commented out for safety)
-- ============================================================================

-- IMPORTANT: Don't run these DROP commands until you've verified the migration worked
-- Keep them commented out for now

-- ALTER TABLE clubs DROP COLUMN IF EXISTS point_sell_cents;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS point_settle_cents;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS guardrail_min_sell;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS guardrail_max_sell;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS guardrail_min_settle;
-- ALTER TABLE clubs DROP COLUMN IF EXISTS guardrail_max_settle;

-- ============================================================================
-- STEP 7: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_status_multipliers_club_status ON status_multipliers(club_id, status);
CREATE INDEX IF NOT EXISTS idx_club_settlement_pools_club_id ON club_settlement_pools(club_id);
CREATE INDEX IF NOT EXISTS idx_clubs_earn_multiplier ON clubs(earn_multiplier) WHERE earn_multiplier != 1.000;
CREATE INDEX IF NOT EXISTS idx_clubs_redeem_multiplier ON clubs(redeem_multiplier) WHERE redeem_multiplier != 1.000;
CREATE INDEX IF NOT EXISTS idx_clubs_promo_active ON clubs(promo_active) WHERE promo_active = true;

-- ============================================================================
-- STEP 8: Create triggers for updated_at columns
-- ============================================================================

CREATE TRIGGER update_status_multipliers_updated_at 
  BEFORE UPDATE ON status_multipliers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_club_settlement_pools_updated_at 
  BEFORE UPDATE ON club_settlement_pools 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 9: Verification queries
-- ============================================================================

-- Show migration results
DO $$
DECLARE
  total_wallets INTEGER;
  total_points BIGINT;
  club_count INTEGER;
BEGIN
  SELECT COUNT(*), SUM(balance_pts) INTO total_wallets, total_points FROM point_wallets;
  SELECT COUNT(*) INTO club_count FROM clubs;
  
  RAISE NOTICE '=== UNIFIED PEG MIGRATION COMPLETE ===';
  RAISE NOTICE 'Migrated % wallets with % total points across % clubs', total_wallets, total_points, club_count;
  RAISE NOTICE 'New system: 100 points = $1 USD';
  RAISE NOTICE 'Purchase rate: 1 cent per point';
  RAISE NOTICE 'Clubs now have operator controls for earn/redeem rates';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after the migration)
-- ============================================================================

-- Check point balance conversion
SELECT 
  c.name,
  COUNT(pw.*) as wallet_count,
  SUM(pw.balance_pts) as total_points,
  AVG(pw.balance_pts) as avg_balance
FROM clubs c
LEFT JOIN point_wallets pw ON c.id = pw.club_id
GROUP BY c.id, c.name
ORDER BY c.name;

-- Check operator controls
SELECT 
  name,
  earn_multiplier,
  redeem_multiplier,
  promo_active,
  promo_description,
  system_peg_rate
FROM clubs
ORDER BY name;

-- Check status multipliers
SELECT 
  c.name,
  sm.status,
  sm.earn_boost,
  sm.redeem_boost
FROM clubs c
JOIN status_multipliers sm ON c.id = sm.club_id
ORDER BY c.name, sm.status;

-- Test the new pricing function
SELECT 
  calculate_display_price(2500, c.id, 'headliner') as headliner_price_for_25_dollar_item,
  calculate_display_price(2500, c.id, 'superfan') as superfan_price_for_25_dollar_item
FROM clubs c
LIMIT 3;
