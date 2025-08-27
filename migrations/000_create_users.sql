-- Create users table (required for membership tables)
-- This table tracks users for membership but Metal wallets are created on-demand
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL UNIQUE, -- This is the main identifier from Privy auth
  email TEXT,
  name TEXT,
  wallet_address TEXT, -- Optional: can store Privy embedded wallet address
  metal_holder_id TEXT, -- Optional: store Metal holder ID when first created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add updated_at trigger for users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
