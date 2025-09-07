-- Migration: Unified tap-in function for atomic operations
-- Bundles tap-in insert + wallet update + membership update + transaction log

BEGIN;

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Unified tap-in function with idempotency and atomic operations
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
BEGIN
  -- Validate positive points
  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Points must be positive');
  END IF;

  -- Check for existing tap-in with same ref (idempotency)
  IF p_ref IS NOT NULL THEN
    SELECT * INTO tap_in_record FROM tap_ins WHERE ref = p_ref;
    IF FOUND THEN
      -- Return existing tap-in result
      RETURN json_build_object(
        'success', true, 
        'idempotent', true,
        'tap_in', row_to_json(tap_in_record),
        'message', 'Tap-in already processed'
      );
    END IF;
  END IF;

  -- Get or create wallet (with row lock)
  SELECT * INTO wallet_record 
  FROM point_wallets 
  WHERE user_id = p_user_id AND club_id = p_club_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create wallet if it doesn't exist
    INSERT INTO point_wallets (
      user_id, club_id, balance_pts, earned_pts, purchased_pts, spent_pts, escrowed_pts
    ) VALUES (
      p_user_id, p_club_id, 0, 0, 0, 0, 0
    ) RETURNING * INTO wallet_record;
  END IF;

  -- Get or create membership
  SELECT * INTO membership_record 
  FROM club_memberships 
  WHERE user_id = p_user_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    -- Create membership if it doesn't exist
    INSERT INTO club_memberships (
      user_id, club_id, points, current_status, status
    ) VALUES (
      p_user_id, p_club_id, 0, 'cadet', 'active'
    ) RETURNING * INTO membership_record;
  END IF;

  old_status := membership_record.current_status;

  -- Insert tap-in record
  INSERT INTO tap_ins (
    user_id, club_id, source, points_earned, location, metadata, ref
  ) VALUES (
    p_user_id, p_club_id, p_source, p_points, p_location, p_metadata, p_ref
  ) RETURNING * INTO tap_in_record;

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

  -- Compute new status using the same logic as the app
  new_status := CASE 
    WHEN status_points >= 40000 THEN 'superfan'
    WHEN status_points >= 15000 THEN 'headliner'
    WHEN status_points >= 5000 THEN 'resident'
    ELSE 'cadet'
  END;

  status_changed := (old_status != new_status);

  -- Update membership with new status
  UPDATE club_memberships SET
    current_status = new_status,
    last_activity_at = NOW()
  WHERE user_id = p_user_id AND club_id = p_club_id;

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

  -- Return success with all relevant data
  RETURN json_build_object(
    'success', true,
    'tap_in', row_to_json(tap_in_record),
    'points_earned', p_points,
    'total_points', wallet_record.balance_pts + p_points,
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

-- Add ref column to tap_ins if it doesn't exist (for idempotency)
ALTER TABLE tap_ins ADD COLUMN IF NOT EXISTS ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tap_ins_ref ON tap_ins(ref) WHERE ref IS NOT NULL;

COMMIT;
