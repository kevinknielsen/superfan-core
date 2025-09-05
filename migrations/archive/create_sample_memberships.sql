-- Create sample club memberships for testing
-- Run this in Supabase SQL Editor

-- First, let's see what clubs exist
SELECT 'Existing clubs:' as info;
SELECT id, name, owner_id FROM clubs;

-- Check what users exist
SELECT 'Existing users:' as info;
SELECT id, privy_id, name, email FROM users;

-- Create memberships for the current user (fa1f3b51-823c-4846-a434-de63ae8883c0)
-- Join them to all existing clubs
INSERT INTO club_memberships (user_id, club_id, status, points, current_status, last_activity_at, join_date)
SELECT 
  'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid as user_id,
  c.id as club_id,
  'active' as status,
  150 as points, -- Some initial points 
  'cadet' as current_status, -- Starting status
  NOW() as last_activity_at,
  NOW() as join_date
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM club_memberships cm 
  WHERE cm.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid 
  AND cm.club_id = c.id
);

-- Add some sample points to the points ledger for this user
INSERT INTO points_ledger (user_id, club_id, delta, reason, created_at)
SELECT 
  'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid as user_id,
  c.id as club_id,
  50 as delta,
  'welcome_bonus' as reason,
  NOW() as created_at
FROM clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM points_ledger pl 
  WHERE pl.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid 
  AND pl.club_id = c.id
  AND pl.reason = 'welcome_bonus'
);

-- Add another points entry (show entry simulation)
INSERT INTO points_ledger (user_id, club_id, delta, reason, created_at)
SELECT 
  'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid as user_id,
  c.id as club_id,
  100 as delta,
  'show_entry' as reason,
  NOW() - INTERVAL '1 day' as created_at
FROM clubs c
LIMIT 1; -- Just for one club

-- Verify the data was created
SELECT 'Created memberships:' as info;
SELECT cm.*, c.name as club_name 
FROM club_memberships cm 
JOIN clubs c ON c.id = cm.club_id
WHERE cm.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid;

SELECT 'Points ledger entries:' as info;
SELECT pl.*, c.name as club_name 
FROM points_ledger pl 
JOIN clubs c ON c.id = pl.club_id
WHERE pl.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'::uuid
ORDER BY pl.created_at DESC;
