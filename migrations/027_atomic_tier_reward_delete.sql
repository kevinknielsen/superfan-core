-- Migration: Add atomic tier reward delete function
-- This provides atomic deletion with proper validation to eliminate race conditions

-- Create atomic delete function for tier rewards
CREATE OR REPLACE FUNCTION admin_delete_tier_reward(p_reward_id uuid)
RETURNS tier_rewards
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec tier_rewards;
BEGIN
  -- Check if reward has any claims
  IF EXISTS (
    SELECT 1 
    FROM reward_claims 
    WHERE reward_id = p_reward_id
  ) THEN
    RAISE EXCEPTION 'Cannot delete tier reward with existing claims' 
      USING ERRCODE = 'P0001';
  END IF;

  -- Check if reward has any in-flight transactions
  IF EXISTS (
    SELECT 1 
    FROM upgrade_transactions 
    WHERE reward_id = p_reward_id 
      AND status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'Cannot delete tier reward with in-flight transactions' 
      USING ERRCODE = 'P0002';
  END IF;

  -- Perform the deletion and return the deleted record
  DELETE FROM tier_rewards 
  WHERE id = p_reward_id 
  RETURNING * INTO rec;
  
  -- Check if the record was actually deleted
  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Tier reward not found' 
      USING ERRCODE = 'NO_DATA_FOUND';
  END IF;

  RETURN rec;
END $$;

-- Add comment explaining the function
COMMENT ON FUNCTION admin_delete_tier_reward(uuid) IS 
'Atomically delete a tier reward with validation checks for claims and in-flight transactions. Used by admin endpoints to prevent race conditions.';

-- Grant execute permission to service role (adjust as needed for your setup)
-- GRANT EXECUTE ON FUNCTION admin_delete_tier_reward(uuid) TO service_role;
