-- Fix admin role - set it on the correct user record that was just synced
-- Run this in your Supabase SQL editor

-- First, let's see the current state
SELECT id, privy_id, email, role, created_at 
FROM users 
WHERE privy_id = 'did:privy:cm9kbrlj900del50mclhziloz'
ORDER BY created_at DESC;

-- Update the correct user record to be admin
UPDATE users 
SET role = 'admin' 
WHERE id = 'fa1f3b51-823c-4846-a434-de63ae8883c0';

-- Also update by privy_id to be sure
UPDATE users 
SET role = 'admin' 
WHERE privy_id = 'did:privy:cm9kbrlj900del50mclhziloz';

-- Verify the update worked
SELECT id, privy_id, email, role, created_at
FROM users 
WHERE role = 'admin' OR privy_id = 'did:privy:cm9kbrlj900del50mclhziloz'
ORDER BY created_at DESC;
