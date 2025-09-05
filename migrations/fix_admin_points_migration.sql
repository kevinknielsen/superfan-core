-- Fix admin points migration from membership to point wallets
-- This migrates the 120 points from club_memberships to point_wallets

BEGIN;

-- Migrate membership points to point wallets for the admin user
INSERT INTO point_wallets (user_id, club_id, balance_pts, earned_pts, purchased_pts, spent_pts, escrowed_pts)
SELECT 
  cm.user_id,
  cm.club_id,
  cm.points, -- Use existing membership points as balance
  cm.points, -- Assume all existing points are earned
  0, -- No purchased points yet
  0, -- No spent points yet  
  0  -- No escrowed points yet
FROM club_memberships cm
JOIN users u ON u.id = cm.user_id
WHERE u.privy_id = 'did:privy:cm9kbrlj900del50mclhziloz'
  AND cm.points > 0
ON CONFLICT (user_id, club_id) 
DO UPDATE SET
  balance_pts = EXCLUDED.balance_pts,
  earned_pts = EXCLUDED.earned_pts,
  updated_at = NOW();

-- Record the migration as a transaction (only if not already recorded)
INSERT INTO point_transactions (wallet_id, type, pts, source, affects_status, ref)
SELECT 
  pw.id,
  'PURCHASE',
  pw.balance_pts,
  'earned',
  true,
  'migration_from_membership_' || pw.id -- Make ref unique per wallet
FROM point_wallets pw
JOIN club_memberships cm ON cm.user_id = pw.user_id AND cm.club_id = pw.club_id
JOIN users u ON u.id = pw.user_id
WHERE u.privy_id = 'did:privy:cm9kbrlj900del50mclhziloz'
  AND pw.balance_pts > 0
  AND NOT EXISTS (
    SELECT 1 FROM point_transactions pt 
    WHERE pt.wallet_id = pw.id 
    AND pt.ref LIKE 'migration_from_membership_%'
  ); -- Only insert if migration transaction doesn't already exist

COMMIT;

-- Verify the migration worked
SELECT 'Migration Results:' as info;
SELECT 
  pw.balance_pts,
  pw.earned_pts,
  pw.purchased_pts,
  c.name as club_name,
  cm.points as original_membership_points
FROM point_wallets pw
JOIN clubs c ON c.id = pw.club_id
JOIN club_memberships cm ON cm.user_id = pw.user_id AND cm.club_id = pw.club_id
JOIN users u ON u.id = pw.user_id
WHERE u.privy_id = 'did:privy:cm9kbrlj900del50mclhziloz'
ORDER BY c.name;