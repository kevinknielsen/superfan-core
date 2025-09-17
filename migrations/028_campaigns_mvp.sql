-- Migration 028: Campaigns MVP Implementation
-- Adds campaign and instant discount functionality to existing tier_rewards system
-- Run this in Supabase SQL editor

-- ============================================================================
-- ENHANCE EXISTING TIER_REWARDS TABLE
-- ============================================================================

-- Add campaign fields to existing tier_rewards table
ALTER TABLE tier_rewards 
ADD COLUMN campaign_id UUID,
ADD COLUMN campaign_title TEXT,
ADD COLUMN campaign_funding_goal_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_current_funding_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_deadline TIMESTAMPTZ,
ADD COLUMN campaign_status TEXT DEFAULT 'single_reward' CHECK (
  campaign_status IN ('single_reward', 'campaign_active', 'campaign_funded', 'campaign_failed')
),
ADD COLUMN is_campaign_tier BOOLEAN DEFAULT FALSE,

-- Percentage-based discounts per tier
ADD COLUMN resident_discount_percentage DECIMAL(5,2) DEFAULT 10.0, -- 10% off
ADD COLUMN headliner_discount_percentage DECIMAL(5,2) DEFAULT 15.0, -- 15% off
ADD COLUMN superfan_discount_percentage DECIMAL(5,2) DEFAULT 25.0, -- 25% off

-- Add constraints
ADD CONSTRAINT chk_goal_nonneg CHECK (campaign_funding_goal_cents >= 0),
ADD CONSTRAINT chk_current_nonneg CHECK (campaign_current_funding_cents >= 0);

-- ============================================================================
-- ENHANCE EXISTING REWARD_CLAIMS TABLE
-- ============================================================================

-- Add discount tracking to existing reward_claims table
ALTER TABLE reward_claims
ADD COLUMN original_price_cents INTEGER DEFAULT 0, -- Full tier price
ADD COLUMN paid_price_cents INTEGER DEFAULT 0, -- Amount user actually paid
ADD COLUMN discount_applied_cents INTEGER DEFAULT 0, -- Discount amount
ADD COLUMN campaign_id UUID, -- Link to campaign
ADD COLUMN stripe_payment_intent_id TEXT, -- Stripe payment reference
ADD COLUMN refund_status TEXT DEFAULT 'none' CHECK (refund_status IN ('none', 'pending', 'processed', 'failed')),
ADD COLUMN refunded_at TIMESTAMPTZ,
ADD COLUMN stripe_refund_id TEXT, -- For tracking refunds

-- Add constraints
ADD CONSTRAINT chk_original_price_nonneg CHECK (original_price_cents >= 0),
ADD CONSTRAINT chk_paid_price_nonneg CHECK (paid_price_cents >= 0),
ADD CONSTRAINT chk_discount_nonneg CHECK (discount_applied_cents >= 0);

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for campaign queries
CREATE INDEX IF NOT EXISTS idx_tier_rewards_campaign_id ON tier_rewards(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tier_rewards_campaign_status ON tier_rewards(campaign_status, campaign_deadline);

-- Indexes for refund jobs
CREATE INDEX IF NOT EXISTS idx_reward_claims_campaign_refund ON reward_claims(campaign_id, refund_status);
CREATE INDEX IF NOT EXISTS idx_reward_claims_refund_status ON reward_claims(refund_status, refunded_at);

-- Unique index for payment idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_claims_stripe_payment ON reward_claims(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Add tier rank function (needed for discount calculations)
CREATE OR REPLACE FUNCTION get_tier_rank(tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  CASE tier
    WHEN 'cadet' THEN RETURN 0;
    WHEN 'resident' THEN RETURN 1;
    WHEN 'headliner' THEN RETURN 2;
    WHEN 'superfan' THEN RETURN 3;
    ELSE RETURN 0;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate discount for a user
CREATE OR REPLACE FUNCTION get_user_discount(
  p_user_tier TEXT,
  p_tier_reward_tier TEXT,
  p_tier_reward_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_discount INTEGER := 0;
  v_tier_reward tier_rewards;
BEGIN
  -- Get the tier reward
  SELECT * INTO v_tier_reward FROM tier_rewards WHERE id = p_tier_reward_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Only apply discount if user's earned tier matches or exceeds the tier reward tier
  IF get_tier_rank(p_user_tier) >= get_tier_rank(v_tier_reward.tier) THEN
    -- Calculate percentage-based discount
    CASE p_user_tier
      WHEN 'resident' THEN 
        v_discount := ROUND(v_tier_reward.upgrade_price_cents * COALESCE(v_tier_reward.resident_discount_percentage, 10.0) / 100);
      WHEN 'headliner' THEN 
        v_discount := ROUND(v_tier_reward.upgrade_price_cents * COALESCE(v_tier_reward.headliner_discount_percentage, 15.0) / 100);
      WHEN 'superfan' THEN 
        v_discount := ROUND(v_tier_reward.upgrade_price_cents * COALESCE(v_tier_reward.superfan_discount_percentage, 25.0) / 100);
      ELSE v_discount := 0;
    END CASE;
  END IF;
  
  RETURN v_discount;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CAMPAIGN PROGRESS VIEW
-- ============================================================================

-- Simple view for campaign progress tracking
CREATE VIEW v_campaign_progress AS
SELECT 
  campaign_id,
  campaign_title,
  campaign_funding_goal_cents,
  campaign_current_funding_cents,
  campaign_deadline,
  campaign_status,
  COUNT(DISTINCT id) as tier_count,
  CASE 
    WHEN campaign_funding_goal_cents > 0 THEN 
      (campaign_current_funding_cents::DECIMAL / campaign_funding_goal_cents * 100)
    ELSE 0 
  END as funding_percentage,
  CASE 
    WHEN campaign_deadline > NOW() THEN 
      EXTRACT(EPOCH FROM (campaign_deadline - NOW()))::INTEGER
    ELSE 0
  END as seconds_remaining,
  CASE
    WHEN campaign_status = 'campaign_active' AND campaign_current_funding_cents >= campaign_funding_goal_cents THEN 'ready_to_fund'
    WHEN campaign_status = 'campaign_active' AND campaign_deadline <= NOW() THEN 'expired'
    ELSE campaign_status
  END as computed_status
FROM tier_rewards
WHERE campaign_id IS NOT NULL
GROUP BY campaign_id, campaign_title, campaign_funding_goal_cents, 
         campaign_current_funding_cents, campaign_deadline, campaign_status;

-- ============================================================================
-- RPC FUNCTIONS FOR ATOMIC OPERATIONS
-- ============================================================================

-- Atomic campaign funding increment function
CREATE OR REPLACE FUNCTION increment_campaign_funding(
  p_campaign_id UUID,
  p_amount_cents INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE tier_rewards 
  SET campaign_current_funding_cents = campaign_current_funding_cents + p_amount_cents
  WHERE campaign_id = p_campaign_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON COLUMN tier_rewards.campaign_id IS 'Campaigns MVP - Migration 028 - Added for campaigns-as-tiers functionality';
