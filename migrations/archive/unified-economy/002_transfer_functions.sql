-- Migration: Add Point Transfer Functions
-- Supporting functions for the unified points transfer system

BEGIN;

-- Function to safely transfer points between wallets
CREATE OR REPLACE FUNCTION transfer_points(
  sender_wallet_id UUID,
  recipient_wallet_id UUID,
  points_amount INTEGER,
  transfer_type TEXT DEFAULT 'purchased_only',
  transfer_message TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  sender_wallet RECORD;
  recipient_wallet RECORD;
  points_to_deduct_purchased INTEGER := 0;
  points_to_deduct_earned INTEGER := 0;
  result JSON;
BEGIN
  -- Get sender wallet with row-level lock to prevent race conditions
  SELECT * INTO sender_wallet FROM point_wallets WHERE id = sender_wallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sender wallet not found');
  END IF;
  
  -- Get recipient wallet with row-level lock to prevent race conditions
  SELECT * INTO recipient_wallet FROM point_wallets WHERE id = recipient_wallet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Recipient wallet not found');
  END IF;
  
  -- Validate transfer amount
  IF points_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Transfer amount must be positive');
  END IF;
  
  -- Determine deduction strategy based on transfer type
  IF transfer_type = 'purchased_only' THEN
    -- Only allow transferring purchased points
    IF sender_wallet.purchased_pts < points_amount THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'Insufficient purchased points',
        'available', sender_wallet.purchased_pts,
        'requested', points_amount
      );
    END IF;
    points_to_deduct_purchased := points_amount;
    points_to_deduct_earned := 0;
  ELSE
    -- Allow transferring any points (purchased first, then earned)
    IF sender_wallet.balance_pts < points_amount THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'Insufficient total points',
        'available', sender_wallet.balance_pts,
        'requested', points_amount
      );
    END IF;
    
    points_to_deduct_purchased := LEAST(points_amount, sender_wallet.purchased_pts);
    points_to_deduct_earned := points_amount - points_to_deduct_purchased;
  END IF;
  
  -- Execute the transfer atomically
  -- Update sender wallet
  UPDATE point_wallets SET
    balance_pts = balance_pts - points_amount,
    purchased_pts = purchased_pts - points_to_deduct_purchased,
    earned_pts = earned_pts - points_to_deduct_earned,
    updated_at = NOW()
  WHERE id = sender_wallet_id;
  
  -- Update recipient wallet (all transferred points become "purchased" for recipient)
  UPDATE point_wallets SET
    balance_pts = balance_pts + points_amount,
    purchased_pts = purchased_pts + points_amount,
    updated_at = NOW()
  WHERE id = recipient_wallet_id;
  
  -- Return success
  RETURN json_build_object(
    'success', true,
    'points_transferred', points_amount,
    'deducted_purchased', points_to_deduct_purchased,
    'deducted_earned', points_to_deduct_earned,
    'sender_remaining_balance', sender_wallet.balance_pts - points_amount,
    'recipient_new_balance', recipient_wallet.balance_pts + points_amount
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Rollback is automatic in functions
  RETURN json_build_object(
    'success', false, 
    'error', 'Transfer failed: ' || SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get point wallet with status calculation (if view doesn't work in some contexts)
CREATE OR REPLACE FUNCTION get_wallet_with_status(
  p_user_id UUID,
  p_club_id UUID
) RETURNS JSON AS $$
DECLARE
  wallet_data RECORD;
  escrowed_points INTEGER;
  status_points INTEGER;
  result JSON;
BEGIN
  -- Get wallet data
  SELECT * INTO wallet_data 
  FROM point_wallets 
  WHERE user_id = p_user_id AND club_id = p_club_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  
  -- Calculate escrowed points
  SELECT COALESCE(SUM(points_escrowed), 0) INTO escrowed_points
  FROM point_escrow 
  WHERE user_id = p_user_id AND club_id = p_club_id AND status = 'held';
  
  -- Calculate status points (earned - escrowed)
  status_points := wallet_data.earned_pts - escrowed_points;
  
  RETURN json_build_object(
    'success', true,
    'wallet', json_build_object(
      'id', wallet_data.id,
      'user_id', wallet_data.user_id,
      'club_id', wallet_data.club_id,
      'balance_pts', wallet_data.balance_pts,
      'earned_pts', wallet_data.earned_pts,
      'purchased_pts', wallet_data.purchased_pts,
      'spent_pts', wallet_data.spent_pts,
      'escrowed_pts', escrowed_points,
      'status_pts', status_points,
      'last_activity_at', wallet_data.last_activity_at,
      'created_at', wallet_data.created_at,
      'updated_at', wallet_data.updated_at
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Add helpful indexes for the new functionality
CREATE INDEX IF NOT EXISTS idx_point_transactions_wallet_source_type ON point_transactions(wallet_id, source, type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_ref ON point_transactions(ref) WHERE ref IS NOT NULL;

-- Add missing performance index for point_escrow queries
CREATE INDEX IF NOT EXISTS idx_point_escrow_user_club_status 
  ON point_escrow(user_id, club_id, status) 
  WHERE status = 'held';

COMMIT;