-- Migration: Unified Economy Hardening (spend safety + idempotency)
-- - Add unique index on (wallet_id, ref) for idempotent transaction logging
-- - Harden spend_points_unified: positive amount check + row lock to prevent races

BEGIN;

-- Ensure pgcrypto is available if later needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Idempotency support for API-layer transaction inserts
CREATE UNIQUE INDEX IF NOT EXISTS uniq_point_transactions_wallet_ref
  ON point_transactions(wallet_id, ref)
  WHERE ref IS NOT NULL;

-- Harden spend_points_unified with input validation, row lock, and transaction logging
CREATE OR REPLACE FUNCTION spend_points_unified(
  p_wallet_id UUID,
  p_points_to_spend INTEGER,
  p_preserve_status BOOLEAN DEFAULT false,
  p_current_status TEXT DEFAULT 'cadet',
  p_ref TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'Point spending'
) RETURNS JSON AS $$
DECLARE
  wallet_record RECORD;
  status_threshold INTEGER;
  available_purchased INTEGER;
  available_earned INTEGER;
  spend_purchased INTEGER;
  spend_earned INTEGER;
BEGIN
  -- Validate positive spend amount
  IF p_points_to_spend IS NULL OR p_points_to_spend <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Spend amount must be positive');
  END IF;

  -- Lock the wallet row to prevent concurrent races
  SELECT * INTO wallet_record 
  FROM point_wallets 
  WHERE id = p_wallet_id 
  FOR UPDATE;

  -- Check wallet exists immediately after SELECT
  IF wallet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Idempotency re-check under lock (using EXISTS to avoid affecting FOUND)
  IF p_ref IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM point_transactions WHERE wallet_id = p_wallet_id AND ref = p_ref) THEN
      RETURN json_build_object(
        'success', true,
        'idempotent', true,
        'message', 'Transaction already processed',
        'points_spent', (SELECT pts FROM point_transactions WHERE wallet_id = p_wallet_id AND ref = p_ref LIMIT 1),
        'spent_purchased', COALESCE((SELECT (metadata->'spent_breakdown'->>'purchased')::int FROM point_transactions WHERE wallet_id = p_wallet_id AND ref = p_ref LIMIT 1), NULL),
        'spent_earned', COALESCE((SELECT (metadata->'spent_breakdown'->>'earned')::int FROM point_transactions WHERE wallet_id = p_wallet_id AND ref = p_ref LIMIT 1), NULL),
        'remaining_balance', (SELECT balance_pts FROM point_wallets WHERE id = p_wallet_id)
      );
    END IF;
  END IF;

  -- Check if user has enough points
  IF wallet_record.balance_pts < p_points_to_spend THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient points');
  END IF;

  -- Determine status threshold if protection is enabled (unified peg thresholds)
  IF p_preserve_status THEN
    -- Validate status and set threshold
    IF p_current_status = 'superfan' THEN
      status_threshold := 40000;
    ELSIF p_current_status = 'headliner' THEN
      status_threshold := 15000;
    ELSIF p_current_status = 'resident' THEN
      status_threshold := 5000;
    ELSIF p_current_status = 'cadet' THEN
      status_threshold := 0;
    ELSE
      RAISE EXCEPTION 'Invalid status for preservation: %. Valid statuses are: cadet, resident, headliner, superfan', p_current_status;
    END IF;
  ELSE
    status_threshold := 0;
  END IF;

  -- Calculate available points by source (clamp to zero to avoid negative values)
  available_purchased := GREATEST(0, wallet_record.purchased_pts);
  available_earned := GREATEST(0, wallet_record.earned_pts - status_threshold);

  -- Determine spending breakdown (purchased first, then earned)
  spend_purchased := LEAST(p_points_to_spend, available_purchased);
  spend_earned := GREATEST(0, p_points_to_spend - spend_purchased);

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

  -- Atomically log the transaction (if ref provided)
  IF p_ref IS NOT NULL THEN
    INSERT INTO point_transactions (
      wallet_id, 
      type, 
      pts, 
      source, 
      affects_status, 
      ref, 
      metadata
    ) VALUES (
      p_wallet_id,
      'SPEND',
      p_points_to_spend,
      'spent',
      false,
      p_ref,
      json_build_object(
        'description', p_description,
        'spent_breakdown', json_build_object(
          'purchased', spend_purchased,
          'earned', spend_earned
        ),
        'preserve_status', p_preserve_status,
        'status_at_time', p_current_status
      )
    );
  END IF;

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

COMMIT;

