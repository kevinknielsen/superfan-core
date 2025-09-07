-- Migration: Add unique constraint for redemptions to prevent duplicates
-- Prevents multiple redemptions of the same unlock by the same user

BEGIN;

-- Add unique constraint on (user_id, unlock_id) to prevent duplicate redemptions
CREATE UNIQUE INDEX IF NOT EXISTS uniq_redemptions_user_unlock
  ON redemptions(user_id, unlock_id);

COMMIT;

