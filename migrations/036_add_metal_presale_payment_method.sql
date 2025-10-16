-- Add Metal Presale as a payment method for credit purchases
-- Metal Presale uses USDC on Base (like direct USDC) but goes through Metal's presale system

-- Drop the old payment method check constraint
ALTER TABLE credit_purchases
DROP CONSTRAINT IF EXISTS credit_purchases_payment_method_check;

-- Add new check constraint that includes metal_presale
ALTER TABLE credit_purchases
ADD CONSTRAINT credit_purchases_payment_method_check
CHECK (payment_method IN ('stripe', 'usdc', 'metal_presale'));

-- Rename tx_hash column to usdc_tx_hash for clarity FIRST (before constraint references it)
ALTER TABLE credit_purchases
RENAME COLUMN tx_hash TO usdc_tx_hash;

-- Update the Stripe fields check to also handle metal_presale (similar to usdc)
ALTER TABLE credit_purchases
DROP CONSTRAINT IF EXISTS credit_purchases_stripe_fields_check;

ALTER TABLE credit_purchases
ADD CONSTRAINT credit_purchases_stripe_fields_check
CHECK (
  (payment_method = 'stripe' AND stripe_payment_intent_id IS NOT NULL AND stripe_session_id IS NOT NULL AND usdc_tx_hash IS NULL) OR
  (payment_method IN ('usdc', 'metal_presale') AND usdc_tx_hash IS NOT NULL AND stripe_payment_intent_id IS NULL AND stripe_session_id IS NULL)
);

-- Update comments
COMMENT ON COLUMN credit_purchases.usdc_tx_hash IS 'Base blockchain transaction hash for USDC/Metal Presale payments. NULL for Stripe payments.';
COMMENT ON COLUMN credit_purchases.payment_method IS 'Payment method: stripe (Stripe checkout), usdc (direct USDC transfer), or metal_presale (Metal presale system with USDC)';
COMMENT ON CONSTRAINT credit_purchases_stripe_fields_check ON credit_purchases IS 'Ensures Stripe fields for Stripe payments and tx_hash for USDC/Metal Presale payments';

