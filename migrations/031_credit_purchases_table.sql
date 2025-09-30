-- Migration: Create credit_purchases table for campaign credit transactions
-- This separates credit purchases from reward_claims which has constraints for tier rewards

-- Create credit_purchases table
CREATE TABLE credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User and club references
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Purchase details
  credits_purchased INTEGER NOT NULL CHECK (credits_purchased > 0),
  price_paid_cents INTEGER NOT NULL CHECK (price_paid_cents > 0),
  
  -- Stripe integration
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT NOT NULL,
  idempotency_key TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'failed')),
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none', 'partial', 'full')),
  refunded_amount_cents INTEGER DEFAULT 0,
  
  -- Ensure refund_status consistency with status
  CONSTRAINT check_refund_consistency CHECK (
    (status = 'refunded' AND refund_status IN ('partial', 'full')) OR
    (status != 'refunded' AND refund_status = 'none')
  ),
  
  -- Timestamps
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  
  -- Metadata for additional context
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_credit_purchases_user ON credit_purchases(user_id, purchased_at DESC);
CREATE INDEX idx_credit_purchases_campaign ON credit_purchases(campaign_id, purchased_at DESC);
CREATE INDEX idx_credit_purchases_club ON credit_purchases(club_id, purchased_at DESC);
CREATE INDEX idx_credit_purchases_stripe_pi ON credit_purchases(stripe_payment_intent_id);
CREATE INDEX idx_credit_purchases_status ON credit_purchases(status, purchased_at DESC);

-- Enable RLS
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own purchases
CREATE POLICY "Users can view own credit purchases"
  ON credit_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access to credit purchases"
  ON credit_purchases FOR ALL
  USING (auth.role() = 'service_role');

-- Create helper function to get user's total credits for a campaign
CREATE OR REPLACE FUNCTION get_user_campaign_credits(
  p_user_id UUID,
  p_campaign_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  purchased_credits INTEGER;
  redeemed_credits INTEGER;
BEGIN
  -- Sum all completed credit purchases from credit_purchases table
  SELECT COALESCE(SUM(credits_purchased), 0)
  INTO purchased_credits
  FROM credit_purchases
  WHERE user_id = p_user_id
    AND campaign_id = p_campaign_id
    AND status = 'completed';
    
  -- Subtract credits spent on campaign items
  -- tickets_redeemed tracks how many credits were spent from reward_claims
  -- Only count credits actually redeemed, not just purchased items
  SELECT COALESCE(SUM(tickets_redeemed), 0)
  INTO redeemed_credits
  FROM reward_claims
  WHERE user_id = p_user_id
    AND campaign_id = p_campaign_id
    AND is_ticket_claim = true;
    
  RETURN GREATEST(0, purchased_credits - redeemed_credits);
END;
$$;

COMMENT ON TABLE credit_purchases IS 'Tracks direct credit purchases for campaigns - separate from reward_claims to avoid constraint conflicts';
COMMENT ON FUNCTION get_user_campaign_credits IS 'Returns available credit balance for a user in a specific campaign';
