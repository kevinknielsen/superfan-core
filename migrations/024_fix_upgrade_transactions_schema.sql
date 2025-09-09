-- Migration 024: Fix Upgrade Transactions Schema
-- Make stripe_payment_intent_id nullable initially since it's created later by Stripe
-- Run this in the Supabase SQL editor

-- Update the upgrade_transactions table to allow null payment intent initially
ALTER TABLE upgrade_transactions 
ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;

-- Add a unique constraint on stripe_session_id instead
ALTER TABLE upgrade_transactions 
ADD CONSTRAINT upgrade_transactions_session_id_unique UNIQUE (stripe_session_id);

-- Update the webhook processing function to handle session-based lookups
CREATE OR REPLACE FUNCTION process_successful_upgrade_by_session(
  p_session_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_transaction upgrade_transactions%ROWTYPE;
  v_current_quarter_year INTEGER;
  v_current_quarter_number INTEGER;
  v_quarter_end TIMESTAMPTZ;
BEGIN
  -- Get transaction details by session ID first, then update with payment intent
  SELECT * INTO v_transaction 
  FROM upgrade_transactions 
  WHERE stripe_session_id = p_session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found for session: %', p_session_id;
  END IF;
  
  -- Update the transaction with payment intent and complete it
  UPDATE upgrade_transactions 
  SET 
    stripe_payment_intent_id = p_payment_intent_id,
    status = 'completed',
    completed_at = NOW()
  WHERE stripe_session_id = p_session_id;
  
  -- Get current quarter
  SELECT year, quarter INTO v_current_quarter_year, v_current_quarter_number
  FROM get_current_quarter();
  
  IF v_transaction.purchase_type = 'tier_boost' THEN
    -- Create temporary tier boost for current quarter
    v_quarter_end := calculate_quarter_end(v_current_quarter_year, v_current_quarter_number);
    
    INSERT INTO temporary_tier_boosts (
      user_id,
      club_id,
      boosted_tier,
      quarter_year,
      quarter_number,
      upgrade_transaction_id,
      expires_at
    ) VALUES (
      v_transaction.user_id,
      v_transaction.club_id,
      v_transaction.target_tier,
      v_current_quarter_year,
      v_current_quarter_number,
      p_payment_intent_id,
      v_quarter_end
    );
    
  ELSE -- direct_unlock
    -- Create immediate reward claim
    INSERT INTO reward_claims (
      user_id,
      reward_id,
      club_id,
      claim_method,
      user_tier_at_claim,
      user_points_at_claim,
      upgrade_transaction_id,
      upgrade_amount_cents,
      access_code
    ) VALUES (
      v_transaction.user_id,
      v_transaction.reward_id,
      v_transaction.club_id,
      'upgrade_purchased',
      v_transaction.user_tier_at_purchase,
      v_transaction.user_points_at_purchase,
      p_payment_intent_id,
      v_transaction.amount_cents,
      'AC' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8)) -- Generate access code
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment to track this fix
COMMENT ON TABLE upgrade_transactions IS 'Upgrade transactions with nullable payment intent - Migration 024 - Fixed on 2024-01-15';
