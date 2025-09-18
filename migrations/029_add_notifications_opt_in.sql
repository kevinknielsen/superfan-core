-- Add notifications opt-in field to users table
-- This allows users to opt into launch alerts and other notifications

ALTER TABLE users 
ADD COLUMN notifications_opt_in BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN users.notifications_opt_in IS 'User has opted in to receive notifications including launch alerts';

-- Create index for efficient querying of opted-in users
CREATE INDEX idx_users_notifications_opt_in ON users(notifications_opt_in) WHERE notifications_opt_in = true;
