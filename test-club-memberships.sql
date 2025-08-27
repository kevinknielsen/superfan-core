-- Test query to debug club_memberships access
-- Run this in Supabase SQL Editor to check what's happening

-- 1. Check if the table exists and has data
SELECT 'Table exists and structure:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'club_memberships' 
ORDER BY ordinal_position;

-- 2. Check RLS status
SELECT 'RLS Status:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'club_memberships';

-- Alternative RLS check
SELECT 'RLS Enabled:' as info;
SELECT c.relname, c.relrowsecurity
FROM pg_class c 
WHERE c.relname = 'club_memberships';

-- 3. Check for any existing policies
SELECT 'Existing RLS Policies:' as info;
SELECT pol.policyname, pol.cmd, pol.roles, pol.qual 
FROM pg_policy pol 
JOIN pg_class pc ON pol.polrelid = pc.oid 
WHERE pc.relname = 'club_memberships';

-- 4. Try a simple count (this will fail if RLS is enabled without policies)
SELECT 'Record count:' as info;
SELECT COUNT(*) as total_memberships FROM club_memberships;

-- 5. Try the exact failing query structure
SELECT 'Testing exact query pattern:' as info;
SELECT cm.*, c.name as club_name
FROM club_memberships cm
LEFT JOIN clubs c ON cm.club_id = c.id
WHERE cm.user_id = 'fa1f3b51-823c-4846-a434-de63ae8883c0'
LIMIT 5;
