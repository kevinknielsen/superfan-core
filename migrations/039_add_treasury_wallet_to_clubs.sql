-- Migration 039: Add Treasury Wallet to Clubs
-- Stores the treasury wallet address used for presale purchases on behalf of Stripe users

-- Add treasury_wallet_address to clubs table
ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS treasury_wallet_address TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN clubs.treasury_wallet_address IS 'Base chain wallet address used as treasury for buying presale tokens on behalf of Stripe purchasers. Purchases from this address do not double-count toward campaign progress.';

