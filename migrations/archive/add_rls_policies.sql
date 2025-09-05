-- Add Row Level Security policies for club-related tables
-- This fixes the 406 "Not Acceptable" errors from Supabase

-- Enable RLS on all club tables (if not already enabled)
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tap_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_transactions ENABLE ROW LEVEL SECURITY;

-- Clubs: Public read, owner can edit
DROP POLICY IF EXISTS "clubs_public_read" ON clubs;
CREATE POLICY "clubs_public_read" ON clubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "clubs_owner_all" ON clubs;
CREATE POLICY "clubs_owner_all" ON clubs FOR ALL USING (auth.uid()::text = owner_id::text);

-- Club Memberships: Users can view/edit their own memberships, club owners can view all
DROP POLICY IF EXISTS "club_memberships_user_own" ON club_memberships;
CREATE POLICY "club_memberships_user_own" ON club_memberships FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = club_memberships.user_id
  )
);

DROP POLICY IF EXISTS "club_memberships_club_owner" ON club_memberships;
CREATE POLICY "club_memberships_club_owner" ON club_memberships FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM clubs, users 
    WHERE clubs.id = club_memberships.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- Tap-ins: Users can view/create their own, club owners can view all
DROP POLICY IF EXISTS "tap_ins_user_own" ON tap_ins;
CREATE POLICY "tap_ins_user_own" ON tap_ins FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = tap_ins.user_id
  )
);

DROP POLICY IF EXISTS "tap_ins_club_owner" ON tap_ins;
CREATE POLICY "tap_ins_club_owner" ON tap_ins FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clubs, users 
    WHERE clubs.id = tap_ins.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- Points Ledger: Same as tap-ins
DROP POLICY IF EXISTS "points_ledger_user_own" ON points_ledger;
CREATE POLICY "points_ledger_user_own" ON points_ledger FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = points_ledger.user_id
  )
);

DROP POLICY IF EXISTS "points_ledger_club_owner" ON points_ledger;
CREATE POLICY "points_ledger_club_owner" ON points_ledger FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clubs, users 
    WHERE clubs.id = points_ledger.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- Unlocks: Public read, club owners can edit
DROP POLICY IF EXISTS "unlocks_public_read" ON unlocks;
CREATE POLICY "unlocks_public_read" ON unlocks FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "unlocks_club_owner_all" ON unlocks;
CREATE POLICY "unlocks_club_owner_all" ON unlocks FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM clubs, users 
    WHERE clubs.id = unlocks.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- Redemptions: Users can view/create their own, club owners can view all
DROP POLICY IF EXISTS "redemptions_user_own" ON redemptions;
CREATE POLICY "redemptions_user_own" ON redemptions FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = redemptions.user_id
  )
);

DROP POLICY IF EXISTS "redemptions_club_owner" ON redemptions;
CREATE POLICY "redemptions_club_owner" ON redemptions FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM unlocks, clubs, users 
    WHERE unlocks.id = redemptions.unlock_id
    AND clubs.id = unlocks.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- House Accounts: Users can view/edit their own, club owners can view
DROP POLICY IF EXISTS "house_accounts_user_own" ON house_accounts;
CREATE POLICY "house_accounts_user_own" ON house_accounts FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = house_accounts.user_id
  )
);

DROP POLICY IF EXISTS "house_accounts_club_owner" ON house_accounts;
CREATE POLICY "house_accounts_club_owner" ON house_accounts FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clubs, users 
    WHERE clubs.id = house_accounts.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- House Transactions: Users can view their own, club owners can view, admins can manage
DROP POLICY IF EXISTS "house_transactions_user_own" ON house_transactions;
CREATE POLICY "house_transactions_user_own" ON house_transactions FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM house_accounts, users 
    WHERE house_accounts.id = house_transactions.house_account_id
    AND users.privy_id = auth.jwt() ->> 'sub' 
    AND users.id = house_accounts.user_id
  )
);

DROP POLICY IF EXISTS "house_transactions_club_owner" ON house_transactions;
CREATE POLICY "house_transactions_club_owner" ON house_transactions FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM house_accounts, clubs, users 
    WHERE house_accounts.id = house_transactions.house_account_id
    AND clubs.id = house_accounts.club_id 
    AND users.privy_id = auth.jwt() ->> 'sub'
    AND users.id = clubs.owner_id
  )
);

-- Status thresholds: Public read (no auth needed)
ALTER TABLE status_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "status_thresholds_public_read" ON status_thresholds;
CREATE POLICY "status_thresholds_public_read" ON status_thresholds FOR SELECT USING (true);
