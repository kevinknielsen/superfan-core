-- Create point wallets for admin user
-- Run this in your Supabase SQL editor to fix admin points balance

-- Get admin user ID (replace with your actual admin user ID)
-- You can find this by running: SELECT id, privy_id, name FROM users WHERE privy_id = 'your-admin-privy-id';

-- For now, using the existing admin user ID from create_admin_membership.sql
-- Replace 'fa1f3b51-823c-4846-a434-de63ae8883c0' with your actual admin user ID

DO $$
DECLARE
  admin_user_id UUID := 'fa1f3b51-823c-4846-a434-de63ae8883c0'; -- Replace with your admin user ID
  club_record RECORD;
BEGIN
  -- Create point wallets for admin user in all active clubs
  FOR club_record IN 
    SELECT id, name FROM clubs WHERE is_active = true
  LOOP
    -- Create point wallet if it doesn't exist
    INSERT INTO point_wallets (user_id, club_id, balance_pts, earned_pts, purchased_pts, spent_pts, escrowed_pts)
    VALUES (admin_user_id, club_record.id, 0, 0, 0, 0, 0)
    ON CONFLICT (user_id, club_id) DO NOTHING;
    
    -- Create club membership if it doesn't exist
    INSERT INTO club_memberships (user_id, club_id, status, points, current_status)
    VALUES (admin_user_id, club_record.id, 'active', 0, 'cadet')
    ON CONFLICT (user_id, club_id) DO NOTHING;
    
    RAISE NOTICE 'Created wallet and membership for club: %', club_record.name;
  END LOOP;
  
  RAISE NOTICE 'Admin point wallets setup complete';
END $$;

-- Verify the setup
SELECT 'Admin point wallets:' as info;
SELECT 
  pw.balance_pts,
  pw.earned_pts,
  pw.purchased_pts,
  c.name as club_name
FROM point_wallets pw
JOIN clubs c ON c.id = pw.club_id
WHERE pw.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'
ORDER BY c.name;

-- If you want to give the admin some test points, uncomment and run:
-- UPDATE point_wallets SET 
--   balance_pts = 5000,
--   earned_pts = 5000
-- WHERE user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0';
