-- Fix admin role assignment to use privy_id instead of internal id
-- Run this in your Supabase SQL editor

-- First, let's see what users we have and their privy_ids
SELECT id, privy_id, email, role, created_at 
FROM users 
ORDER BY created_at;

-- Update the user with the Privy DID to be admin
-- Replace 'did:privy:cm9kbrlj900del50mclhziloz' with your actual Privy DID
UPDATE users 
SET role = 'admin' 
WHERE privy_id = 'did:privy:cm9kbrlj900del50mclhziloz';

-- Verify the update worked
SELECT id, privy_id, email, role 
FROM users 
WHERE role = 'admin';

-- Show all users and their roles
SELECT 
  privy_id,
  email,
  role,
  created_at
FROM users 
ORDER BY created_at;
