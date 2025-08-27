-- Migration: Add points purchasing system
-- This adds the new tables for community-locked points purchasing

-- Add pricing fields to clubs table (mapping to existing clubs table)
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS point_sell_cents INTEGER DEFAULT 120 CHECK (point_sell_cents > 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS point_settle_cents INTEGER DEFAULT 60 CHECK (point_settle_cents > 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS guardrail_min_sell INTEGER DEFAULT 50 CHECK (guardrail_min_sell > 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS guardrail_max_sell INTEGER DEFAULT 500 CHECK (guardrail_max_sell > 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS guardrail_min_settle INTEGER DEFAULT 25 CHECK (guardrail_min_settle > 0);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS guardrail_max_settle INTEGER DEFAULT 250 CHECK (guardrail_max_settle > 0);

-- Point Wallets (per user per community)
CREATE TABLE point_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  balance_pts INTEGER DEFAULT 0 CHECK (balance_pts >= 0),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, club_id) -- one wallet per user per community
);

-- Point Transactions (purchase, bonus, spend, refund)
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES point_wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PURCHASE', 'BONUS', 'SPEND', 'REFUND')),
  pts INTEGER NOT NULL CHECK (pts > 0),
  unit_sell_cents INTEGER, -- price per point when purchased
  unit_settle_cents INTEGER, -- settle value per point when purchased
  usd_gross_cents INTEGER, -- total USD amount (for purchases)
  ref TEXT, -- external reference (stripe session id, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rewards (ACCESS, PRESALE_LOCK, VARIANT)
CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ACCESS', 'PRESALE_LOCK', 'VARIANT')),
  title TEXT NOT NULL,
  description TEXT,
  points_price INTEGER NOT NULL CHECK (points_price > 0),
  inventory INTEGER, -- null = unlimited
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  settle_mode TEXT NOT NULL DEFAULT 'ZERO' CHECK (settle_mode IN ('ZERO', 'PRR')), -- PRR = Point Reserve Ratio
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redemptions (when users claim rewards)
CREATE TABLE reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL CHECK (points_spent > 0),
  state TEXT NOT NULL DEFAULT 'HELD' CHECK (state IN ('HELD', 'CONFIRMED', 'FULFILLED', 'REFUNDED')),
  hold_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly Upfront Tracking (for admin display)
CREATE TABLE weekly_upfront_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the week
  gross_cents INTEGER DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  reserve_delta_cents INTEGER DEFAULT 0,
  upfront_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(club_id, week_start)
);

-- Processed Stripe Events (for webhook idempotency)
CREATE TABLE processed_stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_point_wallets_user_id ON point_wallets(user_id);
CREATE INDEX idx_point_wallets_club_id ON point_wallets(club_id);
CREATE INDEX idx_point_transactions_wallet_id ON point_transactions(wallet_id);
CREATE INDEX idx_point_transactions_type ON point_transactions(type);
CREATE INDEX idx_point_transactions_created_at ON point_transactions(created_at);
CREATE INDEX idx_rewards_club_id ON rewards(club_id);
CREATE INDEX idx_rewards_status ON rewards(status);
CREATE INDEX idx_reward_redemptions_user_id ON reward_redemptions(user_id);
CREATE INDEX idx_reward_redemptions_club_id ON reward_redemptions(club_id);
CREATE INDEX idx_reward_redemptions_reward_id ON reward_redemptions(reward_id);
CREATE INDEX idx_reward_redemptions_state ON reward_redemptions(state);
CREATE INDEX idx_weekly_upfront_stats_club_id ON weekly_upfront_stats(club_id);
CREATE INDEX idx_weekly_upfront_stats_week_start ON weekly_upfront_stats(week_start);

-- Updated at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_point_wallets_updated_at BEFORE UPDATE ON point_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reward_redemptions_updated_at BEFORE UPDATE ON reward_redemptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_weekly_upfront_stats_updated_at BEFORE UPDATE ON weekly_upfront_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add SQL function for safe balance updates
CREATE OR REPLACE FUNCTION increment_balance(wallet_id UUID, delta INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE point_wallets 
  SET balance_pts = GREATEST(0, balance_pts + delta)
  WHERE id = wallet_id
  RETURNING balance_pts INTO new_balance;
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- Update existing clubs with default pricing
UPDATE clubs SET 
  point_sell_cents = 120,
  point_settle_cents = 60,
  guardrail_min_sell = 50,
  guardrail_max_sell = 500,
  guardrail_min_settle = 25,
  guardrail_max_settle = 250
WHERE point_sell_cents IS NULL;
