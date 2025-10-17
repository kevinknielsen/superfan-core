-- Add Metal Presale support to reward_claims table
-- This allows campaign items to be purchased with USDC through Metal

-- Add payment tracking fields
ALTER TABLE reward_claims
ADD COLUMN IF NOT EXISTS usdc_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Create unique index on usdc_tx_hash to prevent duplicate Metal purchases
CREATE UNIQUE INDEX IF NOT EXISTS reward_claims_usdc_tx_hash_unique 
ON reward_claims (usdc_tx_hash) 
WHERE usdc_tx_hash IS NOT NULL;

-- Add check constraint for payment method
ALTER TABLE reward_claims
DROP CONSTRAINT IF EXISTS reward_claims_payment_method_check;

ALTER TABLE reward_claims
ADD CONSTRAINT reward_claims_payment_method_check
CHECK (payment_method IN ('stripe', 'metal_presale', 'free_claim'));

-- Update claim_method to support metal_presale
ALTER TABLE reward_claims
DROP CONSTRAINT IF EXISTS reward_claims_claim_method_check;

ALTER TABLE reward_claims
ADD CONSTRAINT reward_claims_claim_method_check
CHECK (claim_method IN ('tier_qualified', 'upgrade_purchased', 'metal_presale'));

-- Add helpful comments
COMMENT ON COLUMN reward_claims.usdc_tx_hash IS 'Base blockchain transaction hash for Metal Presale payments. NULL for Stripe/free claims.';
COMMENT ON COLUMN reward_claims.payment_method IS 'Payment method: stripe (Stripe checkout), metal_presale (Metal presale with USDC), or free_claim (no payment)';

-- For existing records, ensure they have payment_method set
UPDATE reward_claims 
SET payment_method = 'stripe' 
WHERE payment_method IS NULL 
  AND stripe_payment_intent_id IS NOT NULL;

UPDATE reward_claims
SET payment_method = 'free_claim'
WHERE payment_method IS NULL
  AND stripe_payment_intent_id IS NULL;

-- Make payment_method NOT NULL after backfill
ALTER TABLE reward_claims
ALTER COLUMN payment_method SET NOT NULL;

