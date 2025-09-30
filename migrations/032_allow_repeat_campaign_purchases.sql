-- Migration: Allow repeat purchases of campaign items
-- Drop UNIQUE constraint and add conditional constraint for non-campaign items only

-- Drop the existing UNIQUE constraint
ALTER TABLE reward_claims DROP CONSTRAINT IF EXISTS reward_claims_user_id_reward_id_key;

-- Add conditional unique index (only for non-campaign items)
-- This allows users to claim free tier rewards only once, but buy campaign items multiple times
CREATE UNIQUE INDEX reward_claims_unique_non_campaign 
  ON reward_claims(user_id, reward_id) 
  WHERE campaign_id IS NULL;

COMMENT ON INDEX reward_claims_unique_non_campaign IS 'Users can claim non-campaign rewards only once, but can purchase campaign items multiple times';
