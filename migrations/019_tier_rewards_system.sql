-- Migration 019: Tier Rewards System
-- This migration creates the complete tier rewards system as specified in TIER_REWARDS_IMPLEMENTATION.md
-- Run this in the Supabase SQL editor

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- 1. Create tier_rewards table
CREATE TABLE tier_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('cadet', 'resident', 'headliner', 'superfan')),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('access', 'digital_product', 'physical_product', 'experience')),
  
  -- Cost structure (artist estimates for pricing only)
  artist_cost_estimate_cents INTEGER NOT NULL DEFAULT 0, -- Artist's cost estimate for upgrade pricing
  upgrade_price_cents INTEGER, -- Auto-calculated on save
  safety_factor DECIMAL(3,2) DEFAULT 1.25, -- Dynamic, auto-tuned based on demand
  
  -- Availability settings
  availability_type TEXT DEFAULT 'permanent' CHECK (availability_type IN ('permanent', 'seasonal', 'limited_time')),
  available_start TIMESTAMPTZ,
  available_end TIMESTAMPTZ,
  inventory_limit INTEGER,
  inventory_claimed INTEGER DEFAULT 0,
  
  -- Rolling status configuration
  rolling_window_days INTEGER DEFAULT 60,
  
  -- Metadata for different reward types
  metadata JSONB DEFAULT '{}',
  /*
  For access rewards:
  {
    "instructions": "Check your email for presale code",
    "redemption_url": "https://tickets.example.com"
  }
  
  For digital products:
  {
    "instructions": "Download link will be sent to your email",
    "redemption_url": "https://artist.com/exclusive-download?code=XYZ",
    "details": "320kbps MP3, exclusive remix"
  }
  
  For physical products:
  {
    "instructions": "Use this link to claim your vinyl with free shipping",
    "redemption_url": "https://artist-shop.com/exclusive-vinyl?access_code=ABC123",
    "details": "180g vinyl, gatefold sleeve, limited to 100 units",
    "estimated_shipping": "2-3 weeks"
  }
  
  For experiences:
  {
    "instructions": "Email us at booking@artist.com with this access code",
    "redemption_url": "mailto:booking@artist.com?subject=Meet%20%26%20Greet%20Booking&body=Access%20code:%20XYZ123",
    "details": "30-minute meet & greet, photo opportunity",
    "location": "Studio A, Nashville",
    "requirements": "Must be 18+, valid ID required"
  }
  */
  
  -- Admin settings
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_tier_rewards_dates CHECK (
    availability_type = 'permanent' OR 
    (available_start IS NOT NULL AND available_end IS NOT NULL AND available_start < available_end)
  ),
  CONSTRAINT chk_tier_rewards_inventory CHECK (
    inventory_limit IS NULL OR 
    (inventory_limit > 0 AND inventory_claimed <= inventory_limit)
  )
);

-- Indexes for tier_rewards
CREATE INDEX idx_tier_rewards_club_active ON tier_rewards(club_id, is_active);
CREATE INDEX idx_tier_rewards_availability ON tier_rewards(availability_type, available_start, available_end);
CREATE INDEX idx_tier_rewards_tier ON tier_rewards(tier, is_active);

-- 2. Create upgrade_transactions table (needed for foreign key in other tables)
CREATE TABLE upgrade_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  reward_id UUID NOT NULL REFERENCES tier_rewards(id),
  
  -- Stripe integration
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT,
  
  -- Transaction details
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Purchase type and context
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('tier_boost', 'direct_unlock')),
  user_tier_at_purchase TEXT NOT NULL,
  user_points_at_purchase INTEGER NOT NULL,
  target_tier TEXT NOT NULL, -- For tier_boost purchases
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT chk_upgrade_transactions_amounts CHECK (amount_cents > 0)
);

-- Indexes for upgrade_transactions
CREATE INDEX idx_upgrade_transactions_user ON upgrade_transactions(user_id, created_at DESC);
CREATE INDEX idx_upgrade_transactions_stripe ON upgrade_transactions(stripe_payment_intent_id);
CREATE INDEX idx_upgrade_transactions_status ON upgrade_transactions(status, created_at);

-- 3. Create reward_claims table
CREATE TABLE reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  reward_id UUID NOT NULL REFERENCES tier_rewards(id),
  club_id UUID NOT NULL REFERENCES clubs(id), -- Denormalized for easier queries
  
  -- Claim method
  claim_method TEXT NOT NULL CHECK (claim_method IN ('tier_qualified', 'upgrade_purchased')),
  user_tier_at_claim TEXT NOT NULL,
  user_points_at_claim INTEGER NOT NULL,
  
  -- Payment info (for upgrades)
  upgrade_transaction_id TEXT REFERENCES upgrade_transactions(stripe_payment_intent_id),
  upgrade_amount_cents INTEGER,
  
  -- Access tracking (no fulfillment - just access granted)
  access_status TEXT DEFAULT 'granted' CHECK (access_status IN ('granted', 'revoked')),
  access_code TEXT, -- Unique code for redemption URLs
  
  -- Timestamps
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  UNIQUE(user_id, reward_id), -- One claim per reward per user
  
  CONSTRAINT chk_reward_claims_upgrade CHECK (
    (claim_method = 'upgrade_purchased' AND upgrade_transaction_id IS NOT NULL AND upgrade_amount_cents > 0) OR
    (claim_method = 'tier_qualified' AND upgrade_transaction_id IS NULL AND upgrade_amount_cents IS NULL)
  )
);

-- Indexes for reward_claims
CREATE INDEX idx_reward_claims_user ON reward_claims(user_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_reward ON reward_claims(reward_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_access ON reward_claims(access_status, claimed_at);
CREATE INDEX idx_reward_claims_club ON reward_claims(club_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_access_code ON reward_claims(access_code) WHERE access_code IS NOT NULL;

-- 4. Create temporary_tier_boosts table
CREATE TABLE temporary_tier_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Boost details
  boosted_tier TEXT NOT NULL CHECK (boosted_tier IN ('resident', 'headliner', 'superfan')),
  quarter_year INTEGER NOT NULL, -- e.g., 2024
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  
  -- Usage tracking
  is_consumed BOOLEAN DEFAULT false,
  consumed_at TIMESTAMPTZ,
  consumed_by_reward_id UUID REFERENCES tier_rewards(id),
  
  -- Purchase context
  upgrade_transaction_id TEXT NOT NULL REFERENCES upgrade_transactions(stripe_payment_intent_id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Constraints
  UNIQUE(user_id, club_id, quarter_year, quarter_number), -- One boost per club per quarter
  
  CONSTRAINT chk_tier_boosts_consumption CHECK (
    (is_consumed = true AND consumed_at IS NOT NULL AND consumed_by_reward_id IS NOT NULL) OR
    (is_consumed = false AND consumed_at IS NULL AND consumed_by_reward_id IS NULL)
  )
);

-- Indexes for temporary_tier_boosts
CREATE INDEX idx_tier_boosts_user_club ON temporary_tier_boosts(user_id, club_id, quarter_year, quarter_number);
CREATE INDEX idx_tier_boosts_active ON temporary_tier_boosts(user_id, club_id, expires_at) WHERE NOT is_consumed;
CREATE INDEX idx_tier_boosts_quarter ON temporary_tier_boosts(quarter_year, quarter_number, expires_at);

-- 5. Create quarterly_claim_tracking table
CREATE TABLE quarterly_claim_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Quarter identification
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  
  -- Claim details
  reward_claim_id UUID NOT NULL REFERENCES reward_claims(id),
  claim_method TEXT NOT NULL CHECK (claim_method IN ('earned_status', 'temporary_boost')),
  tier_at_claim TEXT NOT NULL,
  
  -- Timestamps
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints - one free claim per user per club per quarter
  UNIQUE(user_id, club_id, quarter_year, quarter_number)
);

-- Indexes for quarterly_claim_tracking
CREATE INDEX idx_quarterly_claims_user_club ON quarterly_claim_tracking(user_id, club_id, quarter_year, quarter_number);
CREATE INDEX idx_quarterly_claims_quarter ON quarterly_claim_tracking(quarter_year, quarter_number, claimed_at);

-- 6. Create webhook_events table
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Event metadata
  event_data JSONB,
  processing_attempts INTEGER DEFAULT 0,
  last_error TEXT,
  
  -- Constraints
  CONSTRAINT chk_webhook_events_processing CHECK (
    (processed_at IS NULL AND processing_attempts >= 0) OR
    (processed_at IS NOT NULL AND processing_attempts > 0)
  )
);

-- Indexes for webhook_events
CREATE INDEX idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type, created_at DESC);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed_at) WHERE processed_at IS NOT NULL;
CREATE INDEX idx_webhook_events_pending ON webhook_events(created_at) WHERE processed_at IS NULL;

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to get current quarter
CREATE OR REPLACE FUNCTION get_current_quarter()
RETURNS TABLE(year INTEGER, quarter INTEGER, start_date DATE, end_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(YEAR FROM NOW())::INTEGER as year,
    EXTRACT(QUARTER FROM NOW())::INTEGER as quarter,
    DATE_TRUNC('quarter', NOW())::DATE as start_date,
    (DATE_TRUNC('quarter', NOW()) + INTERVAL '3 months - 1 day')::DATE as end_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate quarter end date
CREATE OR REPLACE FUNCTION calculate_quarter_end(year INTEGER, quarter INTEGER)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN (DATE_TRUNC('year', MAKE_DATE(year, 1, 1)) + 
          INTERVAL '3 months' * quarter - 
          INTERVAL '1 second')::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function for auto-calculating upgrade price
CREATE OR REPLACE FUNCTION calculate_upgrade_price()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate upgrade price if artist sets a cost estimate
  IF NEW.artist_cost_estimate_cents > 0 THEN
    -- U = ceil((K / m) * S) where m = 0.96 (Stripe fees), S = dynamic safety_factor
    NEW.upgrade_price_cents := CEIL((NEW.artist_cost_estimate_cents / 0.96) * NEW.safety_factor);
  ELSE
    NEW.upgrade_price_cents := NULL;
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-calculating upgrade price
CREATE TRIGGER tr_tier_rewards_calculate_price
  BEFORE INSERT OR UPDATE ON tier_rewards
  FOR EACH ROW EXECUTE FUNCTION calculate_upgrade_price();

-- Trigger function to update reward inventory count
CREATE OR REPLACE FUNCTION update_reward_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tier_rewards 
    SET inventory_claimed = inventory_claimed + 1
    WHERE id = NEW.reward_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tier_rewards 
    SET inventory_claimed = GREATEST(0, inventory_claimed - 1)
    WHERE id = OLD.reward_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory tracking
CREATE TRIGGER tr_reward_claims_inventory
  AFTER INSERT OR DELETE ON reward_claims
  FOR EACH ROW EXECUTE FUNCTION update_reward_inventory();

-- ============================================================================
-- BUSINESS LOGIC FUNCTIONS
-- ============================================================================

-- Atomic function for processing successful upgrades
CREATE OR REPLACE FUNCTION process_successful_upgrade(
  p_transaction_id UUID,
  p_payment_intent_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_transaction upgrade_transactions%ROWTYPE;
  v_current_quarter_year INTEGER;
  v_current_quarter_number INTEGER;
  v_quarter_end TIMESTAMPTZ;
BEGIN
  -- Get transaction details
  SELECT * INTO v_transaction 
  FROM upgrade_transactions 
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
  
  -- Complete the transaction
  UPDATE upgrade_transactions 
  SET 
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_transaction_id;
  
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

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- Create comprehensive analytics view
CREATE VIEW v_tier_rewards_with_stats AS
SELECT 
  tr.*,
  c.name as club_name,
  
  -- Claim statistics
  COALESCE(claim_stats.total_claims, 0) as total_claims,
  COALESCE(claim_stats.tier_qualified_claims, 0) as tier_qualified_claims,
  COALESCE(claim_stats.upgrade_claims, 0) as upgrade_claims,
  COALESCE(claim_stats.total_upgrade_revenue_cents, 0) as total_upgrade_revenue_cents,
  
  -- Availability status
  CASE 
    WHEN NOT tr.is_active THEN 'inactive'
    WHEN tr.availability_type = 'permanent' THEN 'available'
    WHEN tr.availability_type = 'limited_time' AND NOW() < tr.available_start THEN 'upcoming'
    WHEN tr.availability_type = 'limited_time' AND NOW() > tr.available_end THEN 'expired'
    WHEN tr.availability_type = 'seasonal' AND NOW() BETWEEN tr.available_start AND tr.available_end THEN 'available'
    WHEN tr.availability_type = 'seasonal' THEN 'out_of_season'
    ELSE 'available'
  END as current_status,
  
  -- Inventory status
  CASE 
    WHEN tr.inventory_limit IS NULL THEN 'unlimited'
    WHEN tr.inventory_claimed >= tr.inventory_limit THEN 'sold_out'
    WHEN tr.inventory_claimed >= (tr.inventory_limit * 0.9) THEN 'low_stock'
    ELSE 'available'
  END as inventory_status

FROM tier_rewards tr
LEFT JOIN clubs c ON tr.club_id = c.id
LEFT JOIN (
  SELECT 
    reward_id,
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE claim_method = 'tier_qualified') as tier_qualified_claims,
    COUNT(*) FILTER (WHERE claim_method = 'upgrade_purchased') as upgrade_claims,
    SUM(upgrade_amount_cents) FILTER (WHERE claim_method = 'upgrade_purchased') as total_upgrade_revenue_cents
  FROM reward_claims
  GROUP BY reward_id
) claim_stats ON tr.id = claim_stats.reward_id;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE tier_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_tier_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarterly_claim_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Policies for tier_rewards (public read, club owners and admins can write)
CREATE POLICY "tier_rewards_select_policy" ON tier_rewards
  FOR SELECT USING (true);

CREATE POLICY "tier_rewards_insert_policy" ON tier_rewards
  FOR INSERT WITH CHECK (
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = tier_rewards.club_id)
  );

CREATE POLICY "tier_rewards_update_policy" ON tier_rewards
  FOR UPDATE USING (
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = tier_rewards.club_id)
  );

-- Policies for reward_claims (users can see their own claims, club owners and admins can see all)
CREATE POLICY "reward_claims_select_policy" ON reward_claims
  FOR SELECT USING (
    auth.uid() = user_id
    OR
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = reward_claims.club_id)
  );

CREATE POLICY "reward_claims_insert_policy" ON reward_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for temporary_tier_boosts (users can see their own boosts, club owners and admins can see all)
CREATE POLICY "tier_boosts_select_policy" ON temporary_tier_boosts
  FOR SELECT USING (
    auth.uid() = user_id
    OR
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = temporary_tier_boosts.club_id)
  );

-- Policies for quarterly_claim_tracking (users can see their own tracking, club owners and admins can see all)
CREATE POLICY "quarterly_claims_select_policy" ON quarterly_claim_tracking
  FOR SELECT USING (
    auth.uid() = user_id
    OR
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = quarterly_claim_tracking.club_id)
  );

-- Policies for upgrade_transactions (users can see their own transactions, club owners and admins can see all)
CREATE POLICY "upgrade_transactions_select_policy" ON upgrade_transactions
  FOR SELECT USING (
    auth.uid() = user_id
    OR
    -- Allow admins
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
    OR
    -- Allow club owners
    auth.uid() IN (SELECT owner_id FROM clubs WHERE id = upgrade_transactions.club_id)
  );

CREATE POLICY "upgrade_transactions_insert_policy" ON upgrade_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for webhook_events (admin only)
CREATE POLICY "webhook_events_admin_policy" ON webhook_events
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM users WHERE role = 'admin')
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON TABLE tier_rewards IS 'Tier rewards system - Migration 019 - Created on 2024-01-XX';
