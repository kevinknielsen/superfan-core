-- Migration 023: Fix Tier Thresholds to Match Current System
-- This updates the tier threshold functions to match the current STATUS_THRESHOLDS
-- Run this in the Supabase SQL editor

-- Update the tier thresholds function to match lib/status.ts
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

-- Update the compute tier function to match lib/status.ts
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

-- Add comment to track this fix
COMMENT ON FUNCTION get_tier_thresholds IS 'Tier thresholds matching lib/status.ts - Migration 023 - Fixed on 2024-01-15';
