-- Create the specific club membership that's being queried
-- This will stop the 406 errors immediately

-- First, let's see what's in the database
SELECT 'Current clubs:' as info;
SELECT id, name FROM clubs WHERE id IN ('86fff18d-6124-4a0c-964b-4662525ffe39', 'e2109378-b88d-46b6-a7aa-b8439e9be47e');

SELECT 'Current user:' as info;
SELECT id, privy_id, name FROM users WHERE id = 'fa1f3b51-823c-4846-a434-de63ae8883c0';

-- Create the specific memberships being queried
INSERT INTO club_memberships (user_id, club_id, status, points, current_status)
VALUES 
  ('fa1f3b51-823c-4846-a434-de63ae8883c0', '86fff18d-6124-4a0c-964b-4662525ffe39', 'active', 0, 'cadet'),
  ('fa1f3b51-823c-4846-a434-de63ae8883c0', 'e2109378-b88d-46b6-a7aa-b8439e9be47e', 'active', 0, 'cadet')
ON CONFLICT (user_id, club_id) DO NOTHING;

-- Add some points to the ledger for these clubs
INSERT INTO points_ledger (user_id, club_id, delta, reason)
VALUES 
  ('fa1f3b51-823c-4846-a434-de63ae8883c0', '86fff18d-6124-4a0c-964b-4662525ffe39', 0, 'admin_initial'),
  ('fa1f3b51-823c-4846-a434-de63ae8883c0', 'e2109378-b88d-46b6-a7aa-b8439e9be47e', 0, 'admin_initial')
ON CONFLICT DO NOTHING;

-- Verify the data was created
SELECT 'Created memberships:' as info;
SELECT cm.*, c.name 
FROM club_memberships cm 
JOIN clubs c ON c.id = cm.club_id 
WHERE cm.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0';
