-- Fix credit_purchases table to support USDC payments properly
-- The original schema had NOT NULL constraints on Stripe fields which prevents USDC purchases

-- Make Stripe fields nullable since USDC purchases don't use Stripe
ALTER TABLE credit_purchases
ALTER COLUMN stripe_payment_intent_id DROP NOT NULL,
ALTER COLUMN stripe_session_id DROP NOT NULL;

-- Add constraint to ensure Stripe fields are present for Stripe payments
-- and tx_hash is present for USDC/Metal payments
ALTER TABLE credit_purchases
ADD CONSTRAINT credit_purchases_stripe_fields_check
CHECK (
  (payment_method = 'stripe' AND stripe_payment_intent_id IS NOT NULL AND stripe_session_id IS NOT NULL AND tx_hash IS NULL) OR
  (payment_method IN ('usdc', 'metal_presale') AND tx_hash IS NOT NULL AND stripe_payment_intent_id IS NULL AND stripe_session_id IS NULL)
);

-- Update any existing USDC placeholder records to use proper NULL values
UPDATE credit_purchases
SET 
  stripe_payment_intent_id = NULL,
  stripe_session_id = NULL
WHERE payment_method = 'usdc' 
  AND (stripe_payment_intent_id LIKE 'usdc_pi_%' OR stripe_session_id LIKE 'usdc_%');

-- Add helpful comments
COMMENT ON CONSTRAINT credit_purchases_stripe_fields_check ON credit_purchases IS 'Ensures Stripe fields are required for Stripe payments and tx_hash is required for USDC/Metal payments';

