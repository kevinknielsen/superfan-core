-- Migration 029: Phat Trax Ticket Campaigns Implementation (Fixed)
-- Adds ticket-based campaign functionality with maximum component reuse
-- Run this in Supabase SQL editor

-- ============================================================================
-- DROP EXISTING VIEW TO AVOID CONFLICTS
-- ============================================================================

-- Drop the existing campaign progress view so we can recreate it
DROP VIEW IF EXISTS v_campaign_progress;

-- ============================================================================
-- CREATE CAMPAIGNS TABLE 
-- ============================================================================

-- Dedicated campaigns table for ticket-based campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  title TEXT NOT NULL,
  description TEXT,
  funding_goal_cents INTEGER NOT NULL DEFAULT 1, -- Minimum positive default
  current_funding_cents INTEGER NOT NULL DEFAULT 0, -- Full value progress tracking
  stripe_received_cents INTEGER NOT NULL DEFAULT 0, -- Actual Stripe payments (after discounts)
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'funded', 'failed')),
  ticket_price_cents INTEGER NOT NULL DEFAULT 1800, -- ~$18 per ticket
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT chk_funding_goal_positive CHECK (funding_goal_cents > 0),
  CONSTRAINT chk_current_funding_nonneg CHECK (current_funding_cents >= 0),
  CONSTRAINT chk_stripe_received_nonneg CHECK (stripe_received_cents >= 0),
  CONSTRAINT chk_ticket_price_positive CHECK (ticket_price_cents > 0)
);

-- ============================================================================
-- AUTO-UPDATE TRIGGER FOR CAMPAIGNS.UPDATED_AT
-- ============================================================================

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trigger_campaigns_updated_at ON campaigns;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trigger_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();

-- ============================================================================
-- ENHANCE EXISTING TIER_REWARDS TABLE FOR CAMPAIGN ITEMS
-- ============================================================================

-- Add ticket campaign fields to existing tier_rewards table
ALTER TABLE tier_rewards 
ADD COLUMN ticket_cost INTEGER DEFAULT 1, -- How many tickets to redeem this item
ADD COLUMN is_ticket_campaign BOOLEAN DEFAULT FALSE,
ADD COLUMN cogs_cents INTEGER DEFAULT 0; -- Cost of goods sold for campaign items

-- Add constraints for ticket campaigns
ALTER TABLE tier_rewards
ADD CONSTRAINT chk_ticket_cost_positive CHECK (ticket_cost > 0),
ADD CONSTRAINT chk_cogs_nonneg CHECK (cogs_cents >= 0);

-- ============================================================================
-- ENHANCE EXISTING REWARD_CLAIMS TABLE FOR TICKET TRACKING
-- ============================================================================

-- Add ticket tracking to existing reward_claims table (reuse instead of new table)
ALTER TABLE reward_claims
ADD COLUMN tickets_purchased INTEGER DEFAULT 0, -- For ticket campaigns
ADD COLUMN tickets_available INTEGER DEFAULT 0, -- purchased - redeemed  
ADD COLUMN tickets_redeemed INTEGER DEFAULT 0,  -- tickets spent on items
ADD COLUMN is_ticket_claim BOOLEAN DEFAULT FALSE; -- distinguish ticket vs tier claims

-- Add constraints for ticket tracking
ALTER TABLE reward_claims
ADD CONSTRAINT chk_tickets_purchased_nonneg CHECK (tickets_purchased >= 0),
ADD CONSTRAINT chk_tickets_available_nonneg CHECK (tickets_available >= 0),
ADD CONSTRAINT chk_tickets_redeemed_nonneg CHECK (tickets_redeemed >= 0);

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Indexes for campaign queries
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, deadline);
CREATE INDEX IF NOT EXISTS idx_campaigns_club_status ON campaigns(club_id, status);

-- Indexes for ticket tracking
CREATE INDEX IF NOT EXISTS idx_reward_claims_campaign_tickets ON reward_claims(campaign_id, is_ticket_claim);
CREATE INDEX IF NOT EXISTS idx_reward_claims_user_tickets ON reward_claims(user_id, campaign_id, is_ticket_claim);

-- Indexes for campaign items
CREATE INDEX IF NOT EXISTS idx_tier_rewards_campaign ON tier_rewards(campaign_id, is_ticket_campaign);
CREATE INDEX IF NOT EXISTS idx_tier_rewards_ticket_campaign ON tier_rewards(is_ticket_campaign, campaign_id);

-- ============================================================================
-- UTILITY FUNCTIONS FOR TICKET CAMPAIGNS
-- ============================================================================

-- Function to get user's ticket balance for a campaign
CREATE OR REPLACE FUNCTION get_user_ticket_balance(
  p_user_id UUID,
  p_campaign_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_balance INTEGER := 0;
BEGIN
  -- Sum up all ticket purchases minus redemptions for this user in this campaign
  SELECT 
    COALESCE(SUM(tickets_purchased), 0) - COALESCE(SUM(tickets_redeemed), 0)
  INTO v_balance
  FROM reward_claims
  WHERE user_id = p_user_id 
    AND campaign_id = p_campaign_id 
    AND is_ticket_claim = TRUE;
    
  RETURN GREATEST(0, v_balance); -- Never return negative balance
END;
$$ LANGUAGE plpgsql;

-- Function to atomically spend tickets for item redemption (with concurrency protection)
CREATE OR REPLACE FUNCTION spend_tickets_for_item(
  p_user_id UUID,
  p_campaign_id UUID,
  p_item_id UUID,
  p_tickets_to_spend INTEGER
)
RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available_tickets INTEGER;
  v_item tier_rewards;
  v_lock_key BIGINT;
  v_lock_string TEXT;
BEGIN
  -- Create deterministic lock key from user_id + campaign_id
  v_lock_string := p_user_id::TEXT || p_campaign_id::TEXT;
  v_lock_key := ('x' || substr(md5(v_lock_string), 1, 15))::bit(60)::BIGINT;
  
  -- Acquire advisory lock for this user+campaign combination
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  -- Re-check user's available ticket balance while holding lock
  v_available_tickets := get_user_ticket_balance(p_user_id, p_campaign_id);
  
  -- Check if user has enough tickets
  IF v_available_tickets < p_tickets_to_spend THEN
    RETURN FALSE; -- Not enough tickets
  END IF;
  
  -- Get the item to redeem (re-check while locked)
  SELECT * INTO v_item FROM tier_rewards 
  WHERE id = p_item_id AND campaign_id = p_campaign_id AND is_ticket_campaign = TRUE;
  
  IF NOT FOUND OR v_item.ticket_cost != p_tickets_to_spend THEN
    RETURN FALSE; -- Item not found or wrong ticket cost
  END IF;
  
  -- Create redemption record (spending tickets) - now safe from double-spend
  INSERT INTO reward_claims (
    user_id,
    reward_id,
    campaign_id,
    claim_method,
    is_ticket_claim,
    tickets_redeemed,
    claimed_at
  ) VALUES (
    p_user_id,
    p_item_id,
    p_campaign_id,
    'ticket_redemption',
    TRUE,
    p_tickets_to_spend,
    NOW()
  );
  
  RETURN TRUE; -- Success
END;
$$;

-- ============================================================================
-- RECREATE CAMPAIGN PROGRESS VIEW (ENHANCED)
-- ============================================================================

-- Enhanced view for campaign progress tracking (includes ticket campaigns)
CREATE VIEW v_campaign_progress AS
SELECT 
  c.*,
  COUNT(DISTINCT tr.id) as item_count,
  COUNT(DISTINCT rc.user_id) FILTER (WHERE rc.is_ticket_claim = TRUE) as participant_count,
  COALESCE(SUM(rc.tickets_purchased), 0) as total_tickets_sold,
  CASE 
    WHEN c.funding_goal_cents > 0 THEN 
      (c.current_funding_cents::DECIMAL / c.funding_goal_cents * 100)
    ELSE 0 
  END as funding_percentage,
  CASE 
    WHEN c.deadline > NOW() THEN 
      EXTRACT(EPOCH FROM (c.deadline - NOW()))::INTEGER
    ELSE 0
  END as seconds_remaining,
  CASE
    WHEN c.status = 'active' AND c.current_funding_cents >= c.funding_goal_cents THEN 'ready_to_fund'
    WHEN c.status = 'active' AND c.deadline <= NOW() THEN 'expired'
    ELSE c.status
  END as computed_status
FROM campaigns c
LEFT JOIN tier_rewards tr ON tr.campaign_id = c.id AND tr.is_ticket_campaign = TRUE
LEFT JOIN reward_claims rc ON rc.campaign_id = c.id AND rc.is_ticket_claim = TRUE
GROUP BY c.id;

-- ============================================================================
-- WEBHOOK SUPPORT FUNCTIONS
-- ============================================================================

-- Function to atomically increment campaign counters (used by webhook)
CREATE OR REPLACE FUNCTION increment_campaigns_ticket_progress(
  p_campaign_id UUID,
  p_increment_current_funding_cents INTEGER,
  p_increment_stripe_received_cents INTEGER,
  p_increment_total_tickets_sold INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE campaigns
  SET
    current_funding_cents = current_funding_cents + GREATEST(0, COALESCE(p_increment_current_funding_cents, 0)),
    stripe_received_cents = stripe_received_cents + GREATEST(0, COALESCE(p_increment_stripe_received_cents, 0)),
    updated_at = NOW()
  WHERE id = p_campaign_id;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON TABLE campaigns IS 'Phat Trax campaigns - Migration 029 - Ticket-based campaigns with component reuse';
