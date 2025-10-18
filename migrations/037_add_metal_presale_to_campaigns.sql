-- Migration 037: Add Metal Presale Integration to Campaigns
-- Links campaigns to Metal presales for crypto-native fundraising

-- Add metal_presale_id to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS metal_presale_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_metal_presale_id 
ON campaigns(metal_presale_id) 
WHERE metal_presale_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN campaigns.metal_presale_id IS 'Metal presale ID for crypto-native campaign fundraising. When set, users can participate via Metal''s presale infrastructure.';

-- Ensure clubs have metal_token_address for presale creation
-- Note: This should be added separately if not exists
-- ALTER TABLE clubs ADD COLUMN IF NOT EXISTS metal_token_address TEXT;
-- COMMENT ON COLUMN clubs.metal_token_address IS 'Base chain token address for this club, used for Metal presales and token trading';

