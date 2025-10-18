-- Migration 038: Add Metal Token Address to Clubs
-- Enables clubs to have their own Metal tokens for presales and trading

-- Add metal_token_address to clubs table
ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS metal_token_address TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clubs_metal_token_address 
ON clubs(metal_token_address) 
WHERE metal_token_address IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN clubs.metal_token_address IS 'Base chain ERC20 token address for this club. Used for Metal presales, token trading, and in-app rewards.';

