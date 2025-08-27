-- Drop the old subscription-based tables (they don't match the Club model)
DROP TABLE IF EXISTS code_redemptions CASCADE;
DROP TABLE IF EXISTS redemption_codes CASCADE;
DROP TABLE IF EXISTS house_transactions CASCADE;
DROP TABLE IF EXISTS house_accounts CASCADE;
DROP TABLE IF EXISTS memberships CASCADE;
DROP TABLE IF EXISTS membership_plans CASCADE;

-- Create the Club-based schema from the memo

-- Clubs (per artist/label/curator)
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Club Memberships (free to join, points-based status)
CREATE TABLE club_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  points INTEGER DEFAULT 0 CHECK (points >= 0),
  current_status TEXT DEFAULT 'cadet' CHECK (current_status IN ('cadet', 'resident', 'headliner', 'superfan')),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  join_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, club_id) -- one membership per user per club
);

-- Tap-ins (QR/NFC/link actions that earn Points)
CREATE TABLE tap_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  source TEXT NOT NULL, -- 'qr_code', 'nfc', 'link', 'show_entry', 'merch_purchase', etc.
  points_earned INTEGER NOT NULL CHECK (points_earned >= 0),
  location TEXT, -- venue/location if applicable
  metadata JSONB DEFAULT '{}', -- additional context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Points Ledger (for audit trail and decay calculation)
CREATE TABLE points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  delta INTEGER NOT NULL, -- positive for earn, negative for decay/spend
  reason TEXT NOT NULL, -- 'tap_in', 'decay', 'unlock_redemption', etc.
  reference_id UUID, -- tap_in_id, redemption_id, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unlocks/Perks (presales, line-skip, vinyl, studio visits, lotteries)
CREATE TABLE unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  type TEXT NOT NULL CHECK (type IN ('perk', 'lottery', 'allocation')),
  title TEXT NOT NULL,
  description TEXT,
  min_status TEXT NOT NULL CHECK (min_status IN ('cadet', 'resident', 'headliner', 'superfan')),
  requires_accreditation BOOLEAN DEFAULT false,
  stock INTEGER, -- null = unlimited
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  rules JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redemptions (when users claim unlocks)
CREATE TABLE redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  unlock_id UUID NOT NULL REFERENCES unlocks(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  metadata JSONB DEFAULT '{}', -- pickup codes, allocation details, etc.
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- House Accounts (prepaid credit system for frictionless spending)
CREATE TABLE house_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE, -- Club-specific house accounts
  balance_cents INTEGER DEFAULT 0 CHECK (balance_cents >= 0),
  lifetime_topup_cents INTEGER DEFAULT 0,
  lifetime_spend_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, club_id) -- one house account per user per club
);

-- House Account Transactions
CREATE TABLE house_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_account_id UUID NOT NULL REFERENCES house_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'spend', 'refund', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT, -- external transaction ID, etc.
  stripe_payment_intent_id TEXT,
  admin_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample data for development

-- Create sample clubs
INSERT INTO clubs (owner_id, name, description, city) 
SELECT 
  (SELECT id FROM users ORDER BY created_at DESC LIMIT 1), -- Use most recent user as owner
  'PHAT Club',
  'Exclusive club for PHAT fans with presales, line-skip, and studio access',
  'Los Angeles'
WHERE EXISTS (SELECT 1 FROM users);

INSERT INTO clubs (owner_id, name, description, city) 
SELECT 
  (SELECT id FROM users ORDER BY created_at DESC LIMIT 1), -- Use most recent user as owner
  'Vault Records',
  'Underground label collective with vinyl lotteries and backstage access',
  'Brooklyn'
WHERE EXISTS (SELECT 1 FROM users);

-- Create sample unlocks for the clubs
INSERT INTO unlocks (club_id, type, title, description, min_status, stock)
SELECT c.id, 'perk', 'Presale Access', 'Early access to tickets before public sale', 'resident', NULL
FROM clubs c WHERE c.name = 'PHAT Club';

INSERT INTO unlocks (club_id, type, title, description, min_status, stock)
SELECT c.id, 'perk', 'Line Skip', 'Skip the line at shows and events', 'headliner', NULL
FROM clubs c WHERE c.name = 'PHAT Club';

INSERT INTO unlocks (club_id, type, title, description, min_status, stock)
SELECT c.id, 'lottery', 'Vinyl Lottery', 'Limited edition vinyl drops lottery', 'resident', 50
FROM clubs c WHERE c.name = 'Vault Records';

INSERT INTO unlocks (club_id, type, title, description, min_status, stock)
SELECT c.id, 'perk', 'Studio Visit', 'Behind-the-scenes studio access', 'superfan', 10
FROM clubs c WHERE c.name = 'PHAT Club';
