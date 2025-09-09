-- Migration 021: Migrate Existing Unlocks to Tier Rewards System
-- This migration converts existing unlocks and redemptions to the new tier rewards system
-- Run this in the Supabase SQL editor AFTER migrations 019 and 020

-- ============================================================================
-- DATA MIGRATION FROM UNLOCKS TO TIER_REWARDS
-- ============================================================================

-- Function to map old unlock types to new reward types
CREATE OR REPLACE FUNCTION map_unlock_type_to_reward_type(unlock_type TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE unlock_type
    WHEN 'perk' THEN RETURN 'access';
    WHEN 'lottery' THEN RETURN 'experience';
    WHEN 'allocation' THEN RETURN 'access';
    ELSE RETURN 'access'; -- Default fallback
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to map old min_status to new tier format
CREATE OR REPLACE FUNCTION map_min_status_to_tier(min_status TEXT)
RETURNS TEXT AS $$
BEGIN
  -- The tier names should already match, but ensure consistency
  CASE min_status
    WHEN 'cadet' THEN RETURN 'cadet';
    WHEN 'resident' THEN RETURN 'resident';
    WHEN 'headliner' THEN RETURN 'headliner';
    WHEN 'superfan' THEN RETURN 'superfan';
    ELSE RETURN 'cadet'; -- Default fallback
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Migrate unlocks to tier_rewards
INSERT INTO tier_rewards (
  id,
  club_id,
  title,
  description,
  tier,
  reward_type,
  artist_cost_estimate_cents,
  availability_type,
  available_start,
  available_end,
  inventory_limit,
  inventory_claimed,
  rolling_window_days,
  metadata,
  is_active,
  created_at,
  updated_at
)
SELECT 
  u.id,
  u.club_id,
  u.title,
  u.description,
  map_min_status_to_tier(u.min_status) as tier,
  map_unlock_type_to_reward_type(u.type) as reward_type,
  0 as artist_cost_estimate_cents, -- Existing unlocks were free-only
  CASE 
    WHEN u.window_start IS NOT NULL AND u.window_end IS NOT NULL THEN 'limited_time'
    ELSE 'permanent'
  END as availability_type,
  u.window_start as available_start,
  u.window_end as available_end,
  u.stock as inventory_limit,
  COALESCE((
    SELECT COUNT(*)::INTEGER 
    FROM redemptions r 
    WHERE r.unlock_id = u.id 
      AND r.status IN ('confirmed', 'completed')
  ), 0) as inventory_claimed,
  60 as rolling_window_days, -- Default rolling window
  COALESCE(u.rules, '{}') || 
  jsonb_build_object(
    'instructions', 
    CASE u.type
      WHEN 'perk' THEN 'Access granted - check your email for details'
      WHEN 'lottery' THEN 'You have been entered into the lottery'
      WHEN 'allocation' THEN 'Your allocation has been reserved'
      ELSE 'Access granted'
    END,
    'migrated_from_unlock', true,
    'original_type', u.type,
    'requires_accreditation', u.requires_accreditation
  ) as metadata,
  u.is_active,
  u.created_at,
  u.updated_at
FROM unlocks u
WHERE u.is_active = true; -- Only migrate active unlocks

-- Log migration results
DO $$
DECLARE
  v_migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_migrated_count FROM tier_rewards WHERE (metadata->>'migrated_from_unlock')::boolean = true;
  RAISE NOTICE 'Successfully migrated % unlocks to tier_rewards', v_migrated_count;
END $$;

-- ============================================================================
-- MIGRATE REDEMPTIONS TO REWARD_CLAIMS
-- ============================================================================

-- Migrate redemptions to reward_claims for migrated rewards only
INSERT INTO reward_claims (
  id,
  user_id,
  reward_id,
  club_id,
  claim_method,
  user_tier_at_claim,
  user_points_at_claim,
  access_status,
  access_code,
  claimed_at,
  metadata
)
SELECT 
  r.id,
  r.user_id,
  r.unlock_id as reward_id,
  tr.club_id,
  'tier_qualified' as claim_method, -- All existing redemptions were tier-qualified
  'unknown' as user_tier_at_claim, -- Historical data not available
  0 as user_points_at_claim, -- Historical data not available
  CASE r.status
    WHEN 'confirmed' THEN 'granted'
    WHEN 'completed' THEN 'granted'
    WHEN 'cancelled' THEN 'revoked'
    ELSE 'granted'
  END as access_status,
  'MIGRATED' || UPPER(SUBSTRING(r.id::text, 1, 6)) as access_code, -- Generate access code from redemption ID
  r.redeemed_at as claimed_at,
  COALESCE(r.metadata, '{}') || 
  jsonb_build_object(
    'migrated_from_redemption', true,
    'original_status', r.status,
    'migration_date', NOW()
  ) as metadata
FROM redemptions r
INNER JOIN tier_rewards tr ON tr.id = r.unlock_id
WHERE (tr.metadata->>'migrated_from_unlock')::boolean = true
  AND r.status IN ('confirmed', 'completed', 'cancelled'); -- Only migrate meaningful statuses

-- Log redemption migration results
DO $$
DECLARE
  v_migrated_claims INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_migrated_claims FROM reward_claims WHERE (metadata->>'migrated_from_redemption')::boolean = true;
  RAISE NOTICE 'Successfully migrated % redemptions to reward_claims', v_migrated_claims;
END $$;

-- ============================================================================
-- UPDATE INVENTORY COUNTS
-- ============================================================================

-- Update inventory_claimed counts to match actual claims (the trigger should handle this, but let's be explicit)
UPDATE tier_rewards 
SET inventory_claimed = (
  SELECT COUNT(*)::INTEGER 
  FROM reward_claims rc 
  WHERE rc.reward_id = tier_rewards.id 
    AND rc.access_status = 'granted'
)
WHERE (metadata->>'migrated_from_unlock')::boolean = true;

-- ============================================================================
-- CREATE BACKUP TABLES FOR ROLLBACK
-- ============================================================================

-- Create backup of original unlocks table for rollback purposes
CREATE TABLE unlocks_backup_pre_migration AS SELECT * FROM unlocks;
CREATE TABLE redemptions_backup_pre_migration AS SELECT * FROM redemptions;

-- Add migration timestamp
COMMENT ON TABLE unlocks_backup_pre_migration IS 'Backup of unlocks table before tier rewards migration - Created on 2024-01-15';
COMMENT ON TABLE redemptions_backup_pre_migration IS 'Backup of redemptions table before tier rewards migration - Created on 2024-01-15';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Create a view to help verify the migration
CREATE VIEW v_migration_verification AS
SELECT 
  'tier_rewards' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE (metadata->>'migrated_from_unlock')::boolean = true) as migrated_records,
  COUNT(*) FILTER (WHERE (metadata->>'migrated_from_unlock')::boolean IS NULL OR (metadata->>'migrated_from_unlock')::boolean = false) as new_records
FROM tier_rewards
UNION ALL
SELECT 
  'reward_claims' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE (metadata->>'migrated_from_redemption')::boolean = true) as migrated_records,
  COUNT(*) FILTER (WHERE (metadata->>'migrated_from_redemption')::boolean IS NULL OR (metadata->>'migrated_from_redemption')::boolean = false) as new_records
FROM reward_claims;

-- Create a detailed migration report
CREATE VIEW v_migration_report AS
SELECT 
  tr.id as reward_id,
  tr.title,
  tr.tier,
  tr.reward_type,
  tr.inventory_limit,
  tr.inventory_claimed,
  c.name as club_name,
  tr.metadata->>'original_type' as original_unlock_type,
  (tr.metadata->>'migrated_from_unlock')::boolean as is_migrated,
  COUNT(rc.id) as total_claims,
  COUNT(rc.id) FILTER (WHERE (rc.metadata->>'migrated_from_redemption')::boolean = true) as migrated_claims,
  COUNT(rc.id) FILTER (WHERE (rc.metadata->>'migrated_from_redemption')::boolean IS NULL OR (rc.metadata->>'migrated_from_redemption')::boolean = false) as new_claims
FROM tier_rewards tr
LEFT JOIN clubs c ON c.id = tr.club_id
LEFT JOIN reward_claims rc ON rc.reward_id = tr.id
WHERE (tr.metadata->>'migrated_from_unlock')::boolean = true
GROUP BY tr.id, tr.title, tr.tier, tr.reward_type, tr.inventory_limit, tr.inventory_claimed, c.name, tr.metadata->>'original_type'
ORDER BY c.name, tr.title;

-- ============================================================================
-- CLEANUP FUNCTIONS (for helper functions)
-- ============================================================================

-- Drop the temporary mapping functions (they're no longer needed)
DROP FUNCTION IF EXISTS map_unlock_type_to_reward_type(TEXT);
DROP FUNCTION IF EXISTS map_min_status_to_tier(TEXT);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Final verification and summary
DO $$
DECLARE
  v_total_unlocks INTEGER;
  v_migrated_rewards INTEGER;
  v_total_redemptions INTEGER;
  v_migrated_claims INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_unlocks FROM unlocks WHERE is_active = true;
  SELECT COUNT(*) INTO v_migrated_rewards FROM tier_rewards WHERE (metadata->>'migrated_from_unlock')::boolean = true;
  SELECT COUNT(*) INTO v_total_redemptions FROM redemptions WHERE status IN ('confirmed', 'completed', 'cancelled');
  SELECT COUNT(*) INTO v_migrated_claims FROM reward_claims WHERE (metadata->>'migrated_from_redemption')::boolean = true;
  
  RAISE NOTICE '=== MIGRATION SUMMARY ===';
  RAISE NOTICE 'Active unlocks migrated: %/%', v_migrated_rewards, v_total_unlocks;
  RAISE NOTICE 'Redemptions migrated: %/%', v_migrated_claims, v_total_redemptions;
  RAISE NOTICE 'Backup tables created: unlocks_backup_pre_migration, redemptions_backup_pre_migration';
  RAISE NOTICE 'Verification views created: v_migration_verification, v_migration_report';
  RAISE NOTICE '=========================';
END $$;

-- Add comment to track migration
COMMENT ON TABLE tier_rewards IS 'Tier rewards system with migrated data from unlocks - Migration 021 - Created on 2024-01-15';
