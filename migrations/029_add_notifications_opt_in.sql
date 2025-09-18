-- Add notifications opt-in field to users table
-- This allows users to opt into launch alerts and other notifications

-- Check if column exists, if not add it
DO $$ 
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'notifications_opt_in'
    ) THEN
        ALTER TABLE users ADD COLUMN notifications_opt_in BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Backfill existing rows by setting any NULL values to false
UPDATE users 
SET notifications_opt_in = false 
WHERE notifications_opt_in IS NULL;

-- Set the column to NOT NULL with DEFAULT false (safe to run multiple times)
DO $$ 
BEGIN
    -- Only alter if column is currently nullable
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'notifications_opt_in'
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE users ALTER COLUMN notifications_opt_in SET NOT NULL;
    END IF;
END $$;

-- Add comment for clarity (safe to run multiple times)
COMMENT ON COLUMN users.notifications_opt_in IS 'User has opted in to receive notifications including launch alerts';

-- Create index for efficient querying of opted-in users (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_users_notifications_opt_in ON users(notifications_opt_in) WHERE notifications_opt_in = true;
