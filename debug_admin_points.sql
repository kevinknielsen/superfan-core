-- Debug admin points balance discrepancy
-- Run this in Supabase SQL editor to see what data exists

-- Check if admin user exists and get their ID
SELECT 'Admin user check:' as info;
SELECT id, privy_id, name, email FROM users 
WHERE privy_id LIKE '%' -- Replace with your admin privy_id if known
ORDER BY created_at DESC LIMIT 5;

-- Check club memberships for admin user
SELECT 'Admin memberships:' as info;
SELECT 
  cm.user_id,
  cm.club_id,
  cm.points,
  cm.current_status,
  c.name as club_name
FROM club_memberships cm
JOIN clubs c ON c.id = cm.club_id
JOIN users u ON u.id = cm.user_id
WHERE u.privy_id LIKE '%' -- Replace with your admin privy_id
ORDER BY c.name;

-- Check point wallets (base table)
SELECT 'Point wallets (base table):' as info;
SELECT 
  pw.user_id,
  pw.club_id,
  pw.balance_pts,
  pw.earned_pts,
  pw.purchased_pts,
  c.name as club_name
FROM point_wallets pw
JOIN clubs c ON c.id = pw.club_id
JOIN users u ON u.id = pw.user_id
WHERE u.privy_id LIKE '%' -- Replace with your admin privy_id
ORDER BY c.name;

-- Check point wallets (computed view)
SELECT 'Point wallets (computed view):' as info;
SELECT 
  vpw.user_id,
  vpw.club_id,
  vpw.balance_pts,
  vpw.earned_pts,
  vpw.purchased_pts,
  vpw.status_pts,
  c.name as club_name
FROM v_point_wallets vpw
JOIN clubs c ON c.id = vpw.club_id
JOIN users u ON u.id = vpw.user_id
WHERE u.privy_id LIKE '%' -- Replace with your admin privy_id
ORDER BY c.name;

-- Check if the view exists and works
SELECT 'View definition check:' as info;
SELECT COUNT(*) as total_wallets_in_view FROM v_point_wallets;

-- Instructions:
-- 1. Replace the LIKE '%' with your actual admin privy_id (e.g., WHERE u.privy_id = 'did:privy:...')
-- 2. Run each section to see where the 120 points are stored vs where the 0 is coming from
