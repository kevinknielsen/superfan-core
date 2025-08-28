-- Seed Points System Demo Data
-- This adds example rewards to existing clubs and ensures they have proper pricing

-- Ensure existing clubs have pricing data (redundant with previous migration but safe)
UPDATE clubs SET 
  point_sell_cents = COALESCE(point_sell_cents, 120),
  point_settle_cents = COALESCE(point_settle_cents, 60),
  guardrail_min_sell = COALESCE(guardrail_min_sell, 50),
  guardrail_max_sell = COALESCE(guardrail_max_sell, 500),
  guardrail_min_settle = COALESCE(guardrail_min_settle, 25),
  guardrail_max_settle = COALESCE(guardrail_max_settle, 250);

-- Create demo rewards for PHAT Club
INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status)
SELECT 
  c.id,
  'ACCESS',
  'Early Listen',
  'Get exclusive early access to new tracks 48 hours before public release',
  400,
  NULL, -- Unlimited
  'ZERO',
  'active'
FROM clubs c 
WHERE c.name = 'PHAT Club'
ON CONFLICT DO NOTHING;

INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status, window_start, window_end)
SELECT 
  c.id,
  'PRESALE_LOCK',
  '48h Presale Lock',
  'Reserve your spot for upcoming show presales with 48-hour exclusive access',
  700,
  NULL, -- Unlimited
  'ZERO',
  'active',
  NOW() + INTERVAL '1 day', -- Starts tomorrow
  NOW() + INTERVAL '7 days'  -- Ends in a week
FROM clubs c 
WHERE c.name = 'PHAT Club'
ON CONFLICT DO NOTHING;

INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status)
SELECT 
  c.id,
  'VARIANT',
  'Signed Album Cover',
  'Limited edition signed album artwork, hand-signed by the artist',
  4500,
  25, -- Limited stock
  'PRR', -- Point Reserve Ratio
  'active'
FROM clubs c 
WHERE c.name = 'PHAT Club'
ON CONFLICT DO NOTHING;

-- Create demo rewards for Vault Records
INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status)
SELECT 
  c.id,
  'ACCESS',
  'Vault Access',
  'Unlock exclusive vault content including unreleased tracks and studio sessions',
  300,
  NULL, -- Unlimited
  'ZERO',
  'active'
FROM clubs c 
WHERE c.name = 'Vault Records'
ON CONFLICT DO NOTHING;

INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status)
SELECT 
  c.id,
  'VARIANT',
  'Vinyl Lottery Entry',
  'Enter the monthly vinyl lottery for rare and limited edition pressings',
  1200,
  100, -- Limited entries per month
  'ZERO',
  'active'
FROM clubs c 
WHERE c.name = 'Vault Records'
ON CONFLICT DO NOTHING;

INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status)
SELECT 
  c.id,
  'VARIANT',
  'Studio Visit Pass',
  'Behind-the-scenes studio access during recording sessions (NYC area)',
  8000,
  5, -- Very limited
  'PRR',
  'active'
FROM clubs c 
WHERE c.name = 'Vault Records'
ON CONFLICT DO NOTHING;

-- Add a demo reward with time window for testing
INSERT INTO rewards (club_id, kind, title, description, points_price, inventory, settle_mode, status, window_start, window_end)
SELECT 
  c.id,
  'PRESALE_LOCK',
  'Holiday Special Presale',
  'Exclusive holiday show presale access - limited time offer',
  500,
  NULL,
  'ZERO',
  'active',
  NOW() + INTERVAL '2 hours', -- Starts in 2 hours
  NOW() + INTERVAL '3 days'   -- Ends in 3 days
FROM clubs c 
WHERE c.name = 'Vault Records'
ON CONFLICT DO NOTHING;

-- Create different pricing examples for testing
-- PHAT Club: 1.2¢ sell, 0.6¢ settle (demo values from spec)
UPDATE clubs SET 
  point_sell_cents = 120,
  point_settle_cents = 60
WHERE name = 'PHAT Club';

-- Vault Records: slightly higher pricing
UPDATE clubs SET 
  point_sell_cents = 150,
  point_settle_cents = 75
WHERE name = 'Vault Records';

-- Add comments to rewards table for better documentation
COMMENT ON TABLE rewards IS 'Points-based rewards that users can redeem in communities';
COMMENT ON COLUMN rewards.kind IS 'Type of reward: ACCESS (immediate), PRESALE_LOCK (timed hold), VARIANT (physical item)';
COMMENT ON COLUMN rewards.settle_mode IS 'ZERO = no reserve impact, PRR = point reserve ratio applied';
COMMENT ON COLUMN rewards.inventory IS 'NULL = unlimited, number = limited stock';

-- Add comments to point system tables
COMMENT ON TABLE point_wallets IS 'Per-user, per-community point balances';
COMMENT ON TABLE point_transactions IS 'Immutable log of all point movements';
COMMENT ON TABLE reward_redemptions IS 'User redemptions of rewards';
COMMENT ON TABLE weekly_upfront_stats IS 'Weekly financial summaries for admin reporting';
