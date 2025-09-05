-- Migration: Add Unique Constraint on Transaction References
-- Prevents duplicate spend records from repeated requests

BEGIN;

-- Add unique constraint on point_transactions(ref, wallet_id) to prevent duplicates
-- This ensures that the same reference ID cannot be used twice for the same wallet
CREATE UNIQUE INDEX IF NOT EXISTS idx_point_transactions_ref_wallet_unique
  ON point_transactions(ref, wallet_id)
  WHERE ref IS NOT NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_point_transactions_ref_wallet_unique IS 
  'Prevents duplicate transactions with the same reference ID for a given wallet. Enables idempotent spending operations.';

COMMIT;
