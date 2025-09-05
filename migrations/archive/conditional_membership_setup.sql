-- Conditional migration script - only creates tables that don't exist
-- Run this in Supabase SQL Editor

-- Create membership_plans table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'membership_plans') THEN
        CREATE TABLE membership_plans (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT,
          price_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
          features JSONB DEFAULT '[]',
          max_house_account_balance_cents INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created membership_plans table';
    ELSE
        RAISE NOTICE 'membership_plans table already exists';
    END IF;
END $$;

-- Create memberships table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'memberships') THEN
        CREATE TABLE memberships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          plan_id UUID NOT NULL REFERENCES membership_plans(id),
          status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
          current_period_start TIMESTAMPTZ NOT NULL,
          current_period_end TIMESTAMPTZ NOT NULL,
          auto_renew BOOLEAN DEFAULT true,
          stripe_subscription_id TEXT UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created memberships table';
    ELSE
        RAISE NOTICE 'memberships table already exists';
    END IF;
END $$;

-- Create house_transactions table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'house_transactions') THEN
        CREATE TABLE house_transactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          house_account_id UUID NOT NULL REFERENCES house_accounts(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('topup', 'spend', 'refund', 'adjustment')),
          amount_cents INTEGER NOT NULL,
          description TEXT NOT NULL,
          reference_id TEXT,
          stripe_payment_intent_id TEXT,
          admin_user_id UUID REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created house_transactions table';
    ELSE
        RAISE NOTICE 'house_transactions table already exists';
    END IF;
END $$;

-- Create redemption_codes table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'redemption_codes') THEN
        CREATE TABLE redemption_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code TEXT NOT NULL UNIQUE,
          value_cents INTEGER NOT NULL CHECK (value_cents > 0),
          uses_remaining INTEGER DEFAULT 1 CHECK (uses_remaining >= 0),
          max_uses INTEGER DEFAULT 1,
          expires_at TIMESTAMPTZ,
          is_active BOOLEAN DEFAULT true,
          created_by_user_id UUID REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created redemption_codes table';
    ELSE
        RAISE NOTICE 'redemption_codes table already exists';
    END IF;
END $$;

-- Create code_redemptions table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'code_redemptions') THEN
        CREATE TABLE code_redemptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          redemption_code_id UUID NOT NULL REFERENCES redemption_codes(id),
          user_id UUID NOT NULL REFERENCES users(id),
          house_transaction_id UUID NOT NULL REFERENCES house_transactions(id),
          redeemed_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'Created code_redemptions table';
    ELSE
        RAISE NOTICE 'code_redemptions table already exists';
    END IF;
END $$;

-- Insert default membership plans (if none exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM membership_plans LIMIT 1) THEN
        INSERT INTO membership_plans (name, description, price_cents, billing_period, features, sort_order) VALUES
        ('Superfan', 'Access to exclusive content and early releases', 999, 'monthly', '["early_access", "exclusive_content"]', 1),
        ('Superfan Pro', 'All Superfan benefits plus voting rights and backstage content', 1999, 'monthly', '["early_access", "exclusive_content", "voting_rights", "backstage_access"]', 2),
        ('Superfan VIP', 'Ultimate fan experience with direct artist contact', 4999, 'monthly', '["early_access", "exclusive_content", "voting_rights", "backstage_access", "direct_contact", "house_account"]', 3);
        RAISE NOTICE 'Inserted default membership plans';
    ELSE
        RAISE NOTICE 'Membership plans already exist';
    END IF;
END $$;

-- Add constraints (if they don't exist)
DO $$ 
BEGIN
    -- Check and add unique_user_membership constraint
    IF NOT EXISTS (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'memberships' 
        AND constraint_name = 'unique_user_membership'
    ) THEN
        ALTER TABLE memberships ADD CONSTRAINT unique_user_membership UNIQUE(user_id);
        RAISE NOTICE 'Added unique_user_membership constraint';
    ELSE
        RAISE NOTICE 'unique_user_membership constraint already exists';
    END IF;

    -- Check and add unique_user_house_account constraint
    IF NOT EXISTS (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'house_accounts' 
        AND constraint_name = 'unique_user_house_account'
    ) THEN
        ALTER TABLE house_accounts ADD CONSTRAINT unique_user_house_account UNIQUE(user_id);
        RAISE NOTICE 'Added unique_user_house_account constraint';
    ELSE
        RAISE NOTICE 'unique_user_house_account constraint already exists';
    END IF;

    -- Check and add unique_code_user_redemption constraint
    IF NOT EXISTS (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'code_redemptions' 
        AND constraint_name = 'unique_code_user_redemption'
    ) THEN
        ALTER TABLE code_redemptions ADD CONSTRAINT unique_code_user_redemption UNIQUE(redemption_code_id, user_id);
        RAISE NOTICE 'Added unique_code_user_redemption constraint';
    ELSE
        RAISE NOTICE 'unique_code_user_redemption constraint already exists';
    END IF;
END $$;
