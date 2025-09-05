-- Migration: Unified Points Foundation
-- Phase 1 of Unified Economy Implementation
-- Adds spending breakdown and source tracking to existing point system

BEGIN;

-- Enhanced point wallet with spending breakdown
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS earned_pts INTEGER DEFAULT 0;
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS purchased_pts INTEGER DEFAULT 0; 
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS spent_pts INTEGER DEFAULT 0;
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS escrowed_pts INTEGER DEFAULT 0;

-- Enhanced transactions with source tracking
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS source TEXT CHECK (source IN ('earned', 'purchased', 'spent', 'transferred', 'escrowed', 'refunded'));
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS affects_status BOOLEAN DEFAULT false;

-- Create point_escrow table for future escrow system (Phase 3)
CREATE TABLE IF NOT EXISTS point_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  points_escrowed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'charged', 'refunded')),
  reference_id UUID, -- Will reference preorder_commitments in Phase 3
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Create computed view for status points (after point_escrow table exists)
CREATE OR REPLACE VIEW v_point_wallets AS
SELECT pw.*,
       (pw.earned_pts - COALESCE(pe.sum_held, 0)) AS status_pts
FROM point_wallets pw
LEFT JOIN (
  SELECT user_id, club_id, SUM(points_escrowed) AS sum_held
  FROM point_escrow WHERE status = 'held' GROUP BY user_id, club_id
) pe USING (user_id, club_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_point_escrow_user_club ON point_escrow(user_id, club_id) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_point_transactions_source ON point_transactions(source);
CREATE INDEX IF NOT EXISTS idx_point_transactions_affects_status ON point_transactions(affects_status) WHERE affects_status = true;

-- Migrate existing data: All current points are considered "earned" since they came from tap-ins
UPDATE point_wallets SET 
  earned_pts = balance_pts,
  purchased_pts = 0,
  spent_pts = 0,
  escrowed_pts = 0
WHERE earned_pts = 0 AND purchased_pts = 0; -- Only update uninitialized rows

-- Update existing transactions to mark them as "earned" from tap-ins
UPDATE point_transactions SET 
  source = 'earned',
  affects_status = true
WHERE source IS NULL AND type = 'PURCHASE'; -- These were actually tap-in earnings, not purchases

-- Mark actual Stripe purchases as "purchased" (these have usd_gross_cents)
UPDATE point_transactions SET 
  source = 'purchased',
  affects_status = false
WHERE source IS NULL AND usd_gross_cents IS NOT NULL AND usd_gross_cents > 0;

-- Create function to safely spend points with status protection
CREATE OR REPLACE FUNCTION spend_points_with_protection(
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
  
  -- Determine status threshold if protection is enabled
  status_threshold := CASE 
    WHEN NOT p_preserve_status THEN 0
    WHEN p_current_status = 'superfan' THEN 4000
    WHEN p_current_status = 'headliner' THEN 1500  
    WHEN p_current_status = 'resident' THEN 500
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

COMMIT;
