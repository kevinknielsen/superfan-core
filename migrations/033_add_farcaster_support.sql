-- Add Farcaster authentication support to users table
-- This allows users to authenticate via either Privy or Farcaster

-- STEP 1: Make privy_id nullable (it's currently NOT NULL)
-- This must be done before adding the constraint
ALTER TABLE users 
ALTER COLUMN privy_id DROP NOT NULL;

-- STEP 2: Add farcaster_id column (nullable)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS farcaster_id TEXT;

-- STEP 3: Create unique index on farcaster_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS users_farcaster_id_unique 
ON users (farcaster_id) 
WHERE farcaster_id IS NOT NULL;

-- STEP 4: Add check constraint: user must have either privy_id OR farcaster_id (not both, not neither)
ALTER TABLE users 
ADD CONSTRAINT users_must_have_auth_id 
CHECK (
  (privy_id IS NOT NULL AND farcaster_id IS NULL) OR 
  (privy_id IS NULL AND farcaster_id IS NOT NULL)
);

-- STEP 5: Verify all existing users still have privy_id (they should)
-- This is just a safety check - existing users already have privy_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE privy_id IS NULL AND farcaster_id IS NULL) THEN
    RAISE EXCEPTION 'Found users with neither privy_id nor farcaster_id - data integrity issue';
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN users.privy_id IS 'Privy user ID for web users. Mutually exclusive with farcaster_id.';
COMMENT ON COLUMN users.farcaster_id IS 'Farcaster ID (FID) for users who authenticate via Farcaster wallet apps. Format: "farcaster:12345". Mutually exclusive with privy_id.';

