-- Migration: Unified tap-in function for atomic operations (v2)
-- Fixes: race conditions, consistent response shape, missing columns, centralized status logic

BEGIN;

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add missing columns to point_transactions if they don't exist
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS affects_status BOOLEAN DEFAULT false;
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add unique constraint on status column if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS uniq_status_thresholds_status ON status_thresholds(status);

-- Update existing status thresholds table with current values
DO $$
BEGIN
  -- Insert or update each status individually
  INSERT INTO status_thresholds (id, status, min_points, created_at) 
  VALUES (gen_random_uuid(), 'cadet', 0, NOW())
  ON CONFLICT (status) DO UPDATE SET min_points = EXCLUDED.min_points;
  
  INSERT INTO status_thresholds (id, status, min_points, created_at) 
  VALUES (gen_random_uuid(), 'resident', 5000, NOW())
  ON CONFLICT (status) DO UPDATE SET min_points = EXCLUDED.min_points;
  
  INSERT INTO status_thresholds (id, status, min_points, created_at) 
  VALUES (gen_random_uuid(), 'headliner', 15000, NOW())
  ON CONFLICT (status) DO UPDATE SET min_points = EXCLUDED.min_points;
  
  INSERT INTO status_thresholds (id, status, min_points, created_at) 
  VALUES (gen_random_uuid(), 'superfan', 40000, NOW())
  ON CONFLICT (status) DO UPDATE SET min_points = EXCLUDED.min_points;
END
$$;

-- Helper function to compute status from points (using existing table structure)
CREATE OR REPLACE FUNCTION compute_status_sql(p_status_points INTEGER) RETURNS TEXT AS $$
DECLARE
  result_status TEXT;
BEGIN
  SELECT status INTO result_status
  FROM status_thresholds 
  WHERE min_points <= p_status_points 
  ORDER BY min_points DESC 
  LIMIT 1;
  
  RETURN COALESCE(result_status, 'cadet');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add ref column to tap_ins if it doesn't exist (for idempotency)
ALTER TABLE tap_ins ADD COLUMN IF NOT EXISTS ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tap_ins_ref ON tap_ins(ref) WHERE ref IS NOT NULL;

-- Add historical status fields to tap_ins for consistent idempotent responses
ALTER TABLE tap_ins ADD COLUMN IF NOT EXISTS previous_status TEXT;
ALTER TABLE tap_ins ADD COLUMN IF NOT EXISTS current_status TEXT;
ALTER TABLE tap_ins ADD COLUMN IF NOT EXISTS total_points_after INTEGER;

-- Ensure unique constraint on club_memberships
CREATE UNIQUE INDEX IF NOT EXISTS uniq_club_memberships_user_club 
  ON club_memberships(user_id, club_id);

-- Ensure unique constraint on point_wallets  
CREATE UNIQUE INDEX IF NOT EXISTS uniq_point_wallets_user_club
  ON point_wallets(user_id, club_id);

-- Unified tap-in function with race-free upserts and consistent responses
CREATE OR REPLACE FUNCTION award_points_unified(
  p_user_id UUID,
  p_club_id UUID,
  p_source TEXT,
  p_points INTEGER,
  p_location TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_ref TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  wallet_record RECORD;
  membership_record RECORD;
  tap_in_record RECORD;
  old_status TEXT;
  new_status TEXT;
  status_points INTEGER;
  status_changed BOOLEAN;
  total_points_after INTEGER;
BEGIN
  -- Validate positive points
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Points must be positive');
  END IF;

  -- Idempotency is now handled by the INSERT ... ON CONFLICT DO NOTHING below

  -- Get or create wallet using race-free upsert
  INSERT INTO point_wallets (
    user_id, club_id, balance_pts, earned_pts, purchased_pts, spent_pts, escrowed_pts
  ) VALUES (
    p_user_id, p_club_id, 0, 0, 0, 0, 0
  ) ON CONFLICT (user_id, club_id) DO UPDATE SET
    balance_pts = point_wallets.balance_pts  -- no-op to return existing row
  RETURNING * INTO wallet_record;

  -- Get or create membership using race-free upsert
  INSERT INTO club_memberships (
    user_id, club_id, points, current_status, status
  ) VALUES (
    p_user_id, p_club_id, 0, 'cadet', 'active'
  ) ON CONFLICT (user_id, club_id) DO UPDATE SET
    points = club_memberships.points  -- no-op to return existing row
  RETURNING * INTO membership_record;

  old_status := membership_record.current_status;

  -- Calculate total points after this tap-in
  total_points_after := wallet_record.balance_pts + p_points;

  -- Insert tap-in record with race detection
  INSERT INTO tap_ins (
    user_id, club_id, source, points_earned, location, metadata, ref,
    previous_status, current_status, total_points_after
  ) VALUES (
    p_user_id, p_club_id, p_source, p_points, p_location, p_metadata, p_ref,
    old_status, old_status, total_points_after  -- current_status will be updated below
  ) ON CONFLICT (ref) WHERE ref IS NOT NULL DO NOTHING
  RETURNING * INTO tap_in_record;

  -- Check if insert actually created a new row
  IF tap_in_record IS NULL THEN
    -- Conflict occurred, fetch existing record and return idempotently
    SELECT * INTO tap_in_record FROM tap_ins WHERE ref = p_ref;
    
    -- Return existing tap-in result with full consistent payload
    RETURN json_build_object(
      'success', true, 
      'idempotent', true,
      'tap_in', row_to_json(tap_in_record),
      'points_earned', tap_in_record.points_earned,
      'total_points', tap_in_record.total_points_after,
      'current_status', tap_in_record.current_status,
      'previous_status', tap_in_record.previous_status,
      'status_changed', (tap_in_record.previous_status != tap_in_record.current_status),
      'status_points', (
        SELECT status_pts FROM v_point_wallets 
        WHERE user_id = p_user_id AND club_id = p_club_id
      )
    );
  END IF;

  -- Only proceed with side effects if we created a new tap-in record
  
  -- Update wallet with new points
  UPDATE point_wallets SET
    balance_pts = balance_pts + p_points,
    earned_pts = earned_pts + p_points,
    updated_at = NOW()
  WHERE id = wallet_record.id;

  -- Get updated status_pts from view to compute new status
  SELECT status_pts INTO status_points
  FROM v_point_wallets 
  WHERE id = wallet_record.id;

  -- Compute new status using centralized function
  new_status := compute_status_sql(status_points);
  status_changed := (old_status != new_status);

  -- Update membership with new status
  UPDATE club_memberships SET
    current_status = new_status,
    last_activity_at = NOW()
  WHERE user_id = p_user_id AND club_id = p_club_id;

  -- Update tap-in record with final status
  UPDATE tap_ins SET
    current_status = new_status
  WHERE id = tap_in_record.id;

  -- Log transaction
  INSERT INTO point_transactions (
    wallet_id, type, source, pts, ref, affects_status, metadata
  ) VALUES (
    wallet_record.id, 'BONUS', 'earned', p_points, tap_in_record.id, true,
    json_build_object(
      'source', p_source,
      'location', p_location,
      'tap_in_id', tap_in_record.id
    )
  );

  -- Return success with all relevant data (consistent shape)
  RETURN json_build_object(
    'success', true,
    'idempotent', false,
    'tap_in', row_to_json(tap_in_record),
    'points_earned', p_points,
    'total_points', total_points_after,
    'previous_status', old_status,
    'current_status', new_status,
    'status_changed', status_changed,
    'status_points', status_points
  );

EXCEPTION WHEN OTHERS THEN
  -- Return error details
  RETURN json_build_object(
    'success', false, 
    'error', 'Failed to process tap-in: ' || SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

COMMIT;
