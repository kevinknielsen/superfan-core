-- Temporary fix: Disable RLS on club_memberships to allow admin access
-- This allows admins to access the admin dashboard without needing club memberships

-- Option 1: Completely disable RLS on club_memberships (simple but less secure)
ALTER TABLE club_memberships DISABLE ROW LEVEL SECURITY;

-- Option 2: Add admin bypass policy (more secure)
-- Uncomment this and comment the line above if you prefer:
-- DROP POLICY IF EXISTS "admin_bypass_club_memberships" ON club_memberships;
-- CREATE POLICY "admin_bypass_club_memberships" ON club_memberships FOR ALL USING (true);

-- Also disable RLS on related tables that might cause issues
ALTER TABLE points_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE tap_ins DISABLE ROW LEVEL SECURITY;

-- Keep RLS enabled on sensitive admin-only tables
-- clubs, unlocks, redemptions, house_accounts remain with RLS enabled
