-- Add Farcaster authentication support to users table
-- This allows users to authenticate via either Privy or Farcaster

-- Add farcaster_id column (nullable since existing users have privy_id)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS farcaster_id TEXT;

-- Create unique index on farcaster_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS users_farcaster_id_unique 
ON users (farcaster_id) 
WHERE farcaster_id IS NOT NULL;

-- Add check constraint: user must have either privy_id OR farcaster_id
ALTER TABLE users 
ADD CONSTRAINT users_must_have_auth_id 
CHECK (
  (privy_id IS NOT NULL AND farcaster_id IS NULL) OR 
  (privy_id IS NULL AND farcaster_id IS NOT NULL)
);

-- Update existing users to ensure constraint is met (all have privy_id)
-- No action needed - existing users already have privy_id

-- Add helpful comment
COMMENT ON COLUMN users.farcaster_id IS 'Farcaster ID (FID) for users who authenticate via Farcaster wallet apps. Format: "farcaster:12345"';

