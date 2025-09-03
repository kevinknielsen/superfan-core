-- Migration: Add Point Transfer Functions (Secure with All Validations)
-- Supporting functions for the unified points transfer system

BEGIN;

-- Ensure pgcrypto extension is available for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  transfer_ref TEXT;
  escrowed_earned INTEGER := 0;
  available_earned INTEGER := 0;
BEGIN
  -- Generate single unique reference for this transfer
  transfer_ref := 'transfer_' || gen_random_uuid()::text;
  
  -- Validate transfer_type to prevent typos from defaulting to permissive mode
  IF transfer_type NOT IN ('purchased_only', 'any') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid transfer_type: must be purchased_only or any');
  END IF;

  -- Prevent same-wallet transfers (security issue: converts earned→purchased without net change)
  IF sender_wallet_id = recipient_wallet_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot transfer to the same wallet');
  END IF;

  -- Lock wallets in deterministic order to prevent deadlocks
  -- Always lock the smaller UUID first, then the larger UUID
  IF sender_wallet_id < recipient_wallet_id THEN
    SELECT * INTO sender_wallet FROM point_wallets WHERE id = sender_wallet_id FOR UPDATE;
    SELECT * INTO recipient_wallet FROM point_wallets WHERE id = recipient_wallet_id FOR UPDATE;
  ELSE
    SELECT * INTO recipient_wallet FROM point_wallets WHERE id = recipient_wallet_id FOR UPDATE;
    SELECT * INTO sender_wallet FROM point_wallets WHERE id = sender_wallet_id FOR UPDATE;
  END IF;
  
  -- Validate both wallets exist after locking
  IF sender_wallet.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender wallet not found');
  END IF;
  
  IF recipient_wallet.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipient wallet not found');
  END IF;
  
  -- Validate transfer amount
  IF points_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Transfer amount must be positive');
  END IF;

  -- Enforce same club (prevent cross-club transfers)
  IF sender_wallet.club_id <> recipient_wallet.club_id THEN
    RETURN json_build_object('success', false, 'error', 'Wallets must belong to the same club');
  END IF;
  
  -- Calculate escrowed earned points for sender (cannot transfer escrowed points)
  SELECT COALESCE(SUM(points_escrowed), 0) INTO escrowed_earned
  FROM point_escrow 
  WHERE user_id = sender_wallet.user_id 
    AND club_id = sender_wallet.club_id 
    AND status = 'held';
  
  -- Calculate available earned points (total earned minus escrowed)
  available_earned := GREATEST(0, sender_wallet.earned_pts - escrowed_earned);
  
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
  ELSIF transfer_type = 'any' THEN
    -- Allow transferring any points (purchased first, then non-escrowed earned)
    IF sender_wallet.balance_pts - escrowed_earned < points_amount THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'Insufficient available points (excluding escrowed)',
        'available', sender_wallet.balance_pts - escrowed_earned,
        'requested', points_amount,
        'escrowed', escrowed_earned
      );
    END IF;
    
    -- Deduct purchased points first, then available earned
    points_to_deduct_purchased := LEAST(points_amount, sender_wallet.purchased_pts);
    points_to_deduct_earned := LEAST(points_amount - points_to_deduct_purchased, available_earned);
    
    -- Final validation that we're not exceeding available points
    IF points_to_deduct_purchased + points_to_deduct_earned < points_amount THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot transfer escrowed points',
        'available_purchased', sender_wallet.purchased_pts,
        'available_earned', available_earned,
        'escrowed_earned', escrowed_earned
      );
    END IF;
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
  
  -- Create transaction records atomically within the same function
  INSERT INTO point_transactions (wallet_id, type, pts, source, affects_status, ref, metadata)
  VALUES 
    (sender_wallet_id, 'SPEND', points_amount, 'transferred', false, 
     transfer_ref, 
     jsonb_build_object(
       'transfer_type', 'outgoing', 
       'message', COALESCE(transfer_message, 'Point transfer'),
       'recipient_wallet_id', recipient_wallet_id,
       'deducted_purchased', points_to_deduct_purchased,
       'deducted_earned', points_to_deduct_earned
     )),
    (recipient_wallet_id, 'PURCHASE', points_amount, 'transferred', false,
     transfer_ref,
     jsonb_build_object(
       'transfer_type', 'incoming', 
       'message', COALESCE(transfer_message, 'Point transfer'),
       'sender_wallet_id', sender_wallet_id
     ));
  
  -- Return success with detailed breakdown
  RETURN json_build_object(
    'success', true,
    'points_transferred', points_amount,
    'deducted_purchased', points_to_deduct_purchased,
    'deducted_earned', points_to_deduct_earned,
    'sender_remaining_balance', sender_wallet.balance_pts - points_amount,
    'recipient_new_balance', recipient_wallet.balance_pts + points_amount,
    'transfer_ref', transfer_ref
  );
  
  -- Remove EXCEPTION handler to ensure proper transaction rollback on errors
  -- If there's an error, the entire transaction will be rolled back automatically
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

-- Add index for point_wallets club_id for cross-club validation
CREATE INDEX IF NOT EXISTS idx_point_wallets_club_id ON point_wallets(club_id);

COMMIT;
