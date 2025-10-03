-- Add USDC payment support for Farcaster/Base wallet app users
-- This allows wallet users to pay with USDC instead of going through Stripe

-- Add USDC wallet address to clubs (controlled by Superfan for MVP)
ALTER TABLE clubs 
ADD COLUMN IF NOT EXISTS usdc_wallet_address TEXT;

-- Add helpful comment
COMMENT ON COLUMN clubs.usdc_wallet_address IS 'Base chain USDC wallet address for receiving campaign payments from wallet app users';

-- Extend credit_purchases table to support USDC payments
ALTER TABLE credit_purchases
ADD COLUMN IF NOT EXISTS tx_hash TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'stripe';

-- Create unique index on tx_hash to prevent double-spending
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_tx_hash_unique 
ON credit_purchases (tx_hash) 
WHERE tx_hash IS NOT NULL;

-- Add check constraint for payment method
ALTER TABLE credit_purchases
ADD CONSTRAINT credit_purchases_payment_method_check
CHECK (payment_method IN ('stripe', 'usdc'));

-- Add helpful comments
COMMENT ON COLUMN credit_purchases.tx_hash IS 'Base blockchain transaction hash for USDC payments. NULL for Stripe payments.';
COMMENT ON COLUMN credit_purchases.payment_method IS 'Payment method used: stripe (credit card via Stripe) or usdc (direct USDC transfer on Base)';

-- For existing records, ensure they have payment_method set
UPDATE credit_purchases 
SET payment_method = 'stripe' 
WHERE payment_method IS NULL;

