-- SUPERFAN MVP SYSTEM CLEANUP
-- Run this in your Supabase SQL editor to clean up overlapping systems
-- This consolidates to the clean schema needed for MVP

BEGIN;

-- ============================================================================
-- STEP 1: Add role column to users table for proper admin access
-- ============================================================================

-- Add role column to replace environment variable admin system
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' 
  CHECK (role IN ('user', 'admin', 'club_owner'));

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role != 'user';

-- Make first user admin for testing (adjust this as needed)
UPDATE users SET role = 'admin' 
WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)
AND role = 'user'; -- Only update if currently 'user'

-- ============================================================================
-- STEP 2: Remove confusing/unused tables that overlap with core system
-- ============================================================================

-- Remove duplicate reward system (we use unlocks instead)
DROP TABLE IF EXISTS reward_redemptions CASCADE;
DROP TABLE IF EXISTS rewards CASCADE;

-- Remove over-engineered status multiplier system (keep simple for MVP)
DROP TABLE IF EXISTS status_multipliers CASCADE;

-- Remove complex operator financial controls (MVP doesn't need this)
DROP TABLE IF EXISTS club_settlement_pools CASCADE;

-- Remove Phase 2 escrow/preorder features
DROP TABLE IF EXISTS preorder_commitments CASCADE;
DROP TABLE IF EXISTS preorder_campaigns CASCADE;

-- Remove complex analytics (basic metrics sufficient for MVP)  
DROP TABLE IF EXISTS weekly_upfront_stats CASCADE;

-- Remove processed events table if it exists (webhook idempotency handled elsewhere)
DROP TABLE IF EXISTS processed_stripe_events CASCADE;

-- ============================================================================
-- STEP 3: Clean up club table - remove complex operator controls
-- ============================================================================

-- Remove complex pricing and operator control columns (unified peg is simpler)
ALTER TABLE clubs DROP COLUMN IF EXISTS earn_multiplier;
ALTER TABLE clubs DROP COLUMN IF EXISTS redeem_multiplier;
ALTER TABLE clubs DROP COLUMN IF EXISTS promo_active;
ALTER TABLE clubs DROP COLUMN IF EXISTS promo_description;
ALTER TABLE clubs DROP COLUMN IF EXISTS promo_discount_pts;
ALTER TABLE clubs DROP COLUMN IF EXISTS promo_expires_at;
ALTER TABLE clubs DROP COLUMN IF EXISTS system_peg_rate;
ALTER TABLE clubs DROP COLUMN IF EXISTS system_purchase_rate;

-- Keep the unified pricing (100 points = $1)
-- Update existing clubs to use unified peg if they don't already
UPDATE clubs SET 
  point_sell_cents = 1,  -- 1 cent per point
  point_settle_cents = 1 -- 1 cent per point  
WHERE point_sell_cents != 1 OR point_settle_cents != 1;

-- ============================================================================
-- STEP 4: Ensure point_wallets uses unified system properly
-- ============================================================================

-- Make sure all point wallets have the required columns for unified system
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS earned_pts INTEGER DEFAULT 0 CHECK (earned_pts >= 0);
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS purchased_pts INTEGER DEFAULT 0 CHECK (purchased_pts >= 0);  
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS spent_pts INTEGER DEFAULT 0 CHECK (spent_pts >= 0);
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS escrowed_pts INTEGER DEFAULT 0 CHECK (escrowed_pts >= 0);

-- Update any wallets that don't have proper breakdown
UPDATE point_wallets 
SET 
  earned_pts = COALESCE(earned_pts, 0),
  purchased_pts = COALESCE(purchased_pts, 0),
  spent_pts = COALESCE(spent_pts, 0),
  escrowed_pts = 0 -- No escrow in MVP
WHERE earned_pts IS NULL OR purchased_pts IS NULL OR spent_pts IS NULL;

-- ============================================================================
-- STEP 5: Add source column to point_transactions if missing
-- ============================================================================

-- Ensure point transactions can track source for unified system
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS source TEXT 
  CHECK (source IN ('earned', 'purchased', 'spent', 'transferred', 'refunded'));

-- Update existing transactions to have a source
UPDATE point_transactions 
SET source = CASE 
  WHEN type = 'PURCHASE' THEN 'purchased'
  WHEN type = 'BONUS' THEN 'earned'  
  WHEN type = 'SPEND' THEN 'spent'
  WHEN type = 'REFUND' THEN 'refunded'
  ELSE 'earned'
END
WHERE source IS NULL;

-- ============================================================================
-- STEP 6: Clean up any views that reference deleted tables
-- ============================================================================

-- Drop and recreate the point wallets view without complex features
DROP VIEW IF EXISTS v_point_wallets CASCADE;

-- Create simple view for point wallets (no escrow complexity for MVP)
CREATE OR REPLACE VIEW v_point_wallets AS
SELECT 
  pw.*,
  c.name as club_name,
  c.is_active as club_active,
  -- Status points = earned points (simple for MVP)
  pw.earned_pts as status_pts
FROM point_wallets pw
JOIN clubs c ON pw.club_id = c.id;

-- ============================================================================
-- STEP 7: Remove complex spending functions, keep simple ones
-- ============================================================================

-- Drop complex spending function
DROP FUNCTION IF EXISTS spend_points_unified(UUID, INTEGER, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS calculate_display_price(INTEGER, UUID, TEXT);

-- Keep the simple increment_balance function
-- (This should already exist from the points system migration)

-- ============================================================================
-- STEP 8: Clean up indexes - remove ones for deleted tables
-- ============================================================================

-- Remove indexes for deleted tables (these will be automatically dropped with tables)
-- Just ensure we have good indexes for the core tables we're keeping

-- Core performance indexes for MVP
CREATE INDEX IF NOT EXISTS idx_point_wallets_user_club ON point_wallets(user_id, club_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_wallet_created ON point_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tap_ins_user_club ON tap_ins(user_id, club_id);
CREATE INDEX IF NOT EXISTS idx_tap_ins_created ON tap_ins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_memberships_user ON club_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_club_active ON unlocks(club_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id);

-- ============================================================================
-- STEP 9: Verification - show what we have after cleanup
-- ============================================================================

DO $$
DECLARE
  table_count INTEGER;
  user_count INTEGER;
  club_count INTEGER;
  wallet_count INTEGER;
BEGIN
  -- Count remaining tables
  SELECT COUNT(*) INTO table_count 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
  
  -- Count data
  SELECT COUNT(*) INTO user_count FROM users;
  SELECT COUNT(*) INTO club_count FROM clubs;
  SELECT COUNT(*) INTO wallet_count FROM point_wallets;
  
  RAISE NOTICE '=== SUPERFAN MVP CLEANUP COMPLETE ===';
  RAISE NOTICE 'Database now has % tables (cleaned up)', table_count;
  RAISE NOTICE 'Users: %, Clubs: %, Point Wallets: %', user_count, club_count, wallet_count;
  RAISE NOTICE 'System simplified to core MVP functionality';
  RAISE NOTICE 'Admin access now uses user.role column instead of env variables';
  RAISE NOTICE 'Points system unified: 100 points = $1';
END $$;

COMMIT;

-- ============================================================================
-- POST-CLEANUP: Verify your core tables exist
-- ============================================================================

-- Run this query to see your clean table structure:
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check that admin role was added:
SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE role = 'admin') as admin_users,
  COUNT(*) FILTER (WHERE role = 'user') as regular_users
FROM users;
