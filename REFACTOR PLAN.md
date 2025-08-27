# Superfan Core → Club Membership Platform Refactor Plan

## 🎯 Status: Phase 3 Complete ✅ - CLUB PLATFORM READY

**Phase 1 (Feature Flags & Route Removals) - COMPLETED**
- ✅ All funding features disabled via feature flags
- ✅ Legacy components moved to `/legacy` folder
- ✅ Navigation updated for membership focus
- ✅ NPM dependencies cleaned up
- ✅ TypeScript compilation successful

**Phase 2 (Database Connect & Data Access Layer) - COMPLETED ✅**
- ✅ Connected to Supabase database with environment variables from Vercel
- ✅ Created Club-based schema (7 tables) matching Superfan memo
- ✅ Built data access hooks with React Query
- ✅ Enhanced UnifiedAuthContext 
- ✅ Created API routes skeleton
- ✅ Maintained full Privy authentication + Metal wallet compatibility
- ✅ Development server running successfully

**Phase 3 (Club UX & Pass System) - COMPLETED ✅**
- ✅ Updated schema from subscription model to Club-based model (clubs, memberships, tap_ins, unlocks, etc.)
- ✅ Transformed dashboard to show Club memberships (club-card.tsx)
- ✅ Created Club detail view (club-details-modal.tsx) with unlocks and status
- ✅ Implemented Status system: Cadet → Resident → Headliner → Superfan with progress rings
- ✅ Built Unlocks grid showing available perks with status requirements
- ✅ Implemented Tap-in system for point earning
- ✅ Working Pass view with membership credential and status display

**Next:** Phase 4 - QR/NFC Tap-ins & Advanced Features

## 🚀 TRANSFORMATION COMPLETE: Club Membership Platform

**From:** Funding/Investment Platform  
**To:** Club-Based Membership Platform (per Superfan memo)

### 🎯 What We Built

The app has been successfully transformed from a funding platform to a **Club-based membership platform** that perfectly matches the Superfan product memo:

**✅ Core Features Working:**
- **Club Discovery & Joining** - Browse and join artist/label clubs instantly
- **Status Progression** - Cadet (0) → Resident (500) → Headliner (1500) → Superfan (4000) points
- **Tap-in System** - Earn points through engagement (QR ready, link-based working)
- **Unlocks System** - Perks locked behind status tiers (presales, line-skip, studio visits, vinyl lotteries)
- **Real-time Updates** - Points and status update immediately after tap-ins
- **Membership Passes** - Visual credential showing status and progress

**🔧 Technical Foundation:**
- **Database Schema** - 7 tables matching memo (clubs, memberships, tap_ins, unlocks, etc.)
- **APIs** - Full CRUD for clubs, joining, tap-ins, point earning
- **Authentication** - Privy + embedded wallets preserved
- **UI Components** - Club cards, status rings, unlock grids, tap-in actions

**🎵 Sample Data:**
- **PHAT Club** (Los Angeles) - Presales, line-skip, studio visits
- **Vault Records** (Brooklyn) - Vinyl lotteries, backstage access

### 🎮 User Flow Working
1. **Browse Clubs** → Discover page shows available clubs
2. **Join Club** → One-click membership (free, embedded wallet credential)  
3. **Earn Points** → Tap-in at shows/online (+10-100 points per action)
4. **Progress Status** → Automatic tier advancement with visual feedback
5. **Unlock Perks** → Access presales, line-skip, exclusive content based on status
6. **View Pass** → Digital membership credential with status and unlocks

This is now a **functional Club membership platform** ready for artists and fans! 🎉

## 1. System Map (Current)

### Routes & Pages Touching Funding/Investment Features

| Category | Path | Description | Action Required |
|----------|------|-------------|-----------------|
| **Funding Routes** | `/launch` | Project creation with funding settings | Repurpose for membership onboarding |
| | `/projects/[id]/cap-table` | Revenue splits visualization | **REMOVE** |
| | `/projects/[id]/collaborators` | Team member management | Simplify (remove revenue splits) |
| | `/review/[projectId]` | Project review for funding approval | **REMOVE** |
| | `/your-projects` | User's created projects | **REMOVE** |
| **API Endpoints** | `/api/contributions` | Handle funding contributions | **REMOVE** |
| | `/api/funded-projects` | List user's funded projects | **REMOVE** |
| | `/api/presales` | Metal presale integration | **REMOVE** |
| | `/api/metal` | Metal holder management | **REMOVE** |
| | `/api/project/[id]/financing` | Project funding settings | **REMOVE** |
| | `/api/project/[id]/team` | Team revenue splits | Simplify |
| **Component Stack** | `components/fund-modal.tsx` | Funding interface with MoonPay | **REMOVE** |
| | `components/trade-modal.tsx` | Token trading interface | **REMOVE** |
| | `components/financing-form.tsx` | Funding goal configuration | **REMOVE** |
| | `components/team-splits-form.tsx` | Revenue split management | Simplify |
| | `components/project-details-modal.tsx` | Shows funding info | Simplify |

### Auth & Wallet Usage Map

| File | Purpose | Status |
|------|---------|--------|
| `lib/auth-context.tsx` | Privy auth wrapper | **KEEP** |
| `lib/unified-auth-context.tsx` | Multi-platform auth (Privy + Farcaster) | **KEEP** |
| `lib/farcaster-auth.tsx` | Farcaster-specific auth | **KEEP** |
| `app/api/auth.ts` | Unified auth verification | **KEEP** |
| `app/providers.tsx` | Auth provider setup | **KEEP** |
| `components/wallet-settings.tsx` | Embedded wallet management | **KEEP** |

### Dependency Graph for Funding/Tokenization

| Package | Usage | Action |
|---------|-------|--------|
| `@0xsplits/splits-sdk` | Revenue splits contracts | **REMOVE** |
| `@moonpay/moonpay-js` + `@moonpay/moonpay-react` | Crypto onramp | **REMOVE** |
| `viem` + `wagmi` | Ethereum interactions | **KEEP** (for future crypto payments) |
| `ethers` | Legacy Ethereum lib | **REMOVE** |

## 2. Cut Plan (What to Disable/Remove)

### Feature Flags File

```typescript
// config/featureFlags.ts
export interface FeatureFlags {
  // Legacy funding features (DISABLED)
  enableFunding: boolean;
  enableTokens: boolean;
  enablePresales: boolean;
  enableRevenueSplits: boolean;
  enableCapTable: boolean;
  enableProjectReview: boolean;
  
  // New membership features
  enableMembership: boolean;
  enableHouseAccounts: boolean;
  enableRedemptionCodes: boolean;
  
  // Admin features
  enableAdminPanel: boolean;
}

const flags: FeatureFlags = {
  // Legacy - ALL DISABLED
  enableFunding: false,
  enableTokens: false,
  enablePresales: false,
  enableRevenueSplits: false,
  enableCapTable: false,
  enableProjectReview: false,
  
  // New features
  enableMembership: true,
  enableHouseAccounts: process.env.ENABLE_HOUSE_ACCOUNTS === 'true',
  enableRedemptionCodes: process.env.ENABLE_REDEMPTION_CODES === 'true',
  enableAdminPanel: process.env.ENABLE_ADMIN_PANEL === 'true',
};

export { flags };

// Guard utility
export function requireFeature(flag: keyof FeatureFlags) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      if (!flags[flag]) {
        throw new Error(`Feature ${flag} is disabled`);
      }
      return originalMethod.apply(this, args);
    };
  };
}

// Route guard
export function isRouteEnabled(path: string): boolean {
  const legacyRoutes = [
    '/launch', '/your-projects', '/review', 
    '/projects/[id]/cap-table', '/projects/[id]/collaborators'
  ];
  
  if (legacyRoutes.some(route => path.startsWith(route.replace('[id]', '')))) {
    return false;
  }
  
  if (path.startsWith('/membership') && !flags.enableMembership) {
    return false;
  }
  
  if (path.startsWith('/admin') && !flags.enableAdminPanel) {
    return false;
  }
  
  return true;
}
```

### Routes to 404/Redirect

| Route | Action | Destination |
|-------|--------|-------------|
| `/launch` | Redirect | `/membership` |
| `/your-projects` | 404 | - |
| `/review/*` | 404 | - |
| `/projects/[id]/cap-table` | 404 | - |
| `/projects/[id]/collaborators` | 404 | - |
| `/moonpay-test` | 404 | - |

### API Endpoints to Disable

| Endpoint | Action |
|----------|--------|
| `/api/contributions` | 404 |
| `/api/funded-projects` | 404 |
| `/api/presales` | 404 |
| `/api/metal` | 404 |
| `/api/project/[id]/financing` | 404 |

### NPM Dependencies to Remove

```bash
npm uninstall @0xsplits/splits-sdk @moonpay/moonpay-js @moonpay/moonpay-react ethers
```

### Files to Move to `/legacy` (Safer than Delete)

```
/legacy/
  components/
    fund-modal.tsx
    trade-modal.tsx
    financing-form.tsx
  hooks/
    use-financing.ts
    use-presale.ts
    use-contributions.ts
  api/
    contributions/
    funded-projects/
    presales/
    metal/
```

## 3. Target Architecture (Club-Based Membership)

### Core Product Model (From Memo)

**Superfan** is a membership layer for music where:
- **Clubs** = artist/label/curator communities (NOT paid subscriptions)
- **Passes** = membership credentials (embedded wallet on Base)
- **Tap-ins** = QR/NFC/link actions that earn Points
- **Points** = engagement currency with decay (NOT payments)
- **Status** = Cadet → Resident → Headliner → Superfan (earned through engagement)
- **Unlocks** = perks unlocked by status: presales, line-skip, vinyl, studio visits, lotteries
- **House Accounts** = prepaid balances for frictionless spending at shows/merch

### Corrected Data Model

```sql
-- Core Objects from Memo
-- Users (Privy-based, embedded wallet)
-- users table exists, need to update

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

-- Club Memberships (free to join, no billing)
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
```

### SQL Migrations

**001_membership_init.sql:**
```sql
-- Create membership plans table
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

-- Create memberships table
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

-- Create house accounts table
CREATE TABLE house_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER DEFAULT 0 CHECK (balance_cents >= 0),
  lifetime_topup_cents INTEGER DEFAULT 0,
  lifetime_spend_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create house transactions table
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

-- Create redemption codes table
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

-- Create redemption history table
CREATE TABLE code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_code_id UUID NOT NULL REFERENCES redemption_codes(id),
  user_id UUID NOT NULL REFERENCES users(id),
  house_transaction_id UUID NOT NULL REFERENCES house_transactions(id),
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default membership plans
INSERT INTO membership_plans (name, description, price_cents, billing_period, features, sort_order) VALUES
('Superfan', 'Access to exclusive content and early releases', 999, 'monthly', '["early_access", "exclusive_content"]', 1),
('Superfan Pro', 'All Superfan benefits plus voting rights and backstage content', 1999, 'monthly', '["early_access", "exclusive_content", "voting_rights", "backstage_access"]', 2),
('Superfan VIP', 'Ultimate fan experience with direct artist contact', 4999, 'monthly', '["early_access", "exclusive_content", "voting_rights", "backstage_access", "direct_contact", "house_account"]', 3);

-- Add unique constraints
ALTER TABLE memberships ADD CONSTRAINT unique_user_membership UNIQUE(user_id);
ALTER TABLE house_accounts ADD CONSTRAINT unique_user_house_account UNIQUE(user_id);
ALTER TABLE code_redemptions ADD CONSTRAINT unique_code_user_redemption UNIQUE(redemption_code_id, user_id);
```

**002_membership_indexes.sql:**
```sql
-- Performance indexes
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_period_end ON memberships(current_period_end);

CREATE INDEX idx_house_accounts_user_id ON house_accounts(user_id);
CREATE INDEX idx_house_transactions_account_id ON house_transactions(house_account_id);
CREATE INDEX idx_house_transactions_type ON house_transactions(type);
CREATE INDEX idx_house_transactions_created_at ON house_transactions(created_at);

CREATE INDEX idx_redemption_codes_code ON redemption_codes(code) WHERE is_active = true;
CREATE INDEX idx_redemption_codes_expires_at ON redemption_codes(expires_at) WHERE is_active = true;

CREATE INDEX idx_code_redemptions_user_id ON code_redemptions(user_id);
CREATE INDEX idx_code_redemptions_redeemed_at ON code_redemptions(redeemed_at);

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_membership_plans_updated_at BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_house_accounts_updated_at BEFORE UPDATE ON house_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Environment Variables Contract

```bash
# Privy Auth (KEEP EXISTING)
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Database (NEW)
DATABASE_URL=postgresql://user:password@host:port/membership_db
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe Payments (NEW)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Admin & Features (NEW)
ADMIN_ALLOWLIST=user_id_1,user_id_2,user_id_3
ENABLE_HOUSE_ACCOUNTS=true
ENABLE_REDEMPTION_CODES=true
ENABLE_ADMIN_PANEL=true

# App URLs (EXISTING)
NEXT_PUBLIC_APP_URL=https://app.superfan.one
VERCEL_URL=auto-filled-by-vercel
```

## 4. Implementation Plan (Phased)

### Phase 0: Repo Bootstrap & Env Audit (4 hours, DevOps)
**Tasks:**
- [ ] Set up new Vercel project linked to repo
- [ ] Create new Postgres database (Supabase or Vercel Postgres)
- [ ] Audit and update environment variables
- [ ] Test Privy auth in new environment

**Owner:** DevOps  
**Acceptance Criteria:** New deployment environment ready, auth working

### Phase 1: Feature Flag Guards & Route Removals ✅ COMPLETED (8 hours, Senior Dev)
**Tasks:**
- [x] Create `config/featureFlags.ts`
- [x] Add feature guards to `middleware.ts`
- [x] Update navigation to hide funding-related links
- [x] Move funding components to `/legacy` folder
- [x] Remove funding-related NPM dependencies
- [x] Fixed import errors and TypeScript compilation

**Owner:** Senior Dev  
**Acceptance Criteria:** ✅ No funding features accessible, clean nav, app compiles successfully

**✅ COMPLETED:** All funding routes now redirect or return 404, navigation updated with membership focus, legacy components safely moved to `/legacy` folder, dependencies cleaned up.

### Phase 2: DB Connect & Data Access Layer ✅ COMPLETED (12 hours, Backend Dev)
**Tasks:**
- [x] Connect to new Postgres database
- [x] Run membership migrations (001_init.sql, 002_indexes.sql)
- [x] Create data access hooks (`use-membership.ts`, `use-house-account.ts`)
- [x] Update auth context to include membership status
- [x] Create membership API routes skeleton

**Owner:** Backend Dev  
**Acceptance Criteria:** ✅ Database connected, membership tables created, basic API structure

**✅ COMPLETED:** 
- Database connected to Supabase with Vercel environment variables
- Full membership schema created with 7 tables (users, membership_plans, memberships, house_accounts, house_transactions, redemption_codes, code_redemptions)
- 3 default membership plans inserted (Superfan $9.99, Pro $19.99, VIP $49.99)
- React Query hooks created for membership and house account operations
- UnifiedAuthContext enhanced with membership status (hasActiveMembership, membershipFeatures)
- API routes created: /api/membership/plans, /api/membership/me, /api/house/balance, /api/users/me
- Maintained full compatibility with existing Privy authentication and Metal wallet system
- Development server running successfully

### Phase 3: Club UX & Pass System ✅ COMPLETED (16 hours, Frontend Dev)
**Tasks:**
- [x] Update schema: Replace subscription tables with Club-based schema
- [x] Transform dashboard: Show user's Club memberships (adapt project-card.tsx → club-card.tsx)
- [x] Create Club detail view: Adapt project-details-modal.tsx → club-details-modal.tsx
- [x] Add Status system: Cadet → Resident → Headliner → Superfan progress rings
- [x] Create Unlocks grid: Show available perks with status requirements
- [x] Implement Tap-in system: QR codes and link-based point earning
- [x] Build Pass view: Show user's membership credential and status

**Owner:** Frontend Dev  
**Acceptance Criteria:** ✅ Users can join Clubs, see status progress, view unlocks, earn points through tap-ins

**✅ COMPLETED FEATURES:**
- **Club Discovery & Joining:** Users can browse and join clubs with one click
- **Status Progression:** Visual progress rings showing Cadet → Resident → Headliner → Superfan advancement
- **Points System:** Automatic point calculation and status updates based on engagement
- **Unlocks System:** Dynamic grid showing available vs. locked perks based on member status
- **Tap-in Actions:** Point earning through various sources (link, QR code ready)
- **Membership Dashboard:** "Your Clubs" and "Discover Clubs" sections with search
- **Club Details Modal:** Comprehensive view with membership status, unlocks, and quick actions
- **API Integration:** Full CRUD operations for clubs, memberships, tap-ins, and unlocks

**🎯 CURRENT STATE:**
- Dashboard shows 2 sample clubs (PHAT Club, Vault Records)
- Users can join clubs and immediately see membership status
- Tap-in system awards points and updates status in real-time
- Unlocks dynamically show/hide based on member status level
- All data persists in Supabase with proper relationships

### Phase 4: QR/NFC Tap-ins & Enhanced Features (14 hours, Full Stack)
**Tasks:**
- [ ] QR Code Generation: Create unique QR codes for events, merch, and locations
- [ ] Tap-in Scanner: Mobile-optimized QR scanner for real-time point earning
- [ ] Location-based Tap-ins: GPS integration for venue/event check-ins
- [ ] Unlock Redemption: Allow users to claim and use their earned perks
- [ ] Points Decay System: Implement 1%/day decay after 30 days inactivity (per memo)
- [ ] Admin Dashboard: Basic club management and analytics for club owners

**Owner:** Full Stack Dev  
**Acceptance Criteria:** QR tap-ins work at events, unlocks are redeemable, points decay properly

### Phase 5: House Accounts & Payments (12 hours, Full Stack)
**Tasks:**
- [ ] Create house account top-up API with Stripe integration
- [ ] Add balance management UI for frictionless spending
- [ ] Implement redemption code system for gifting credits
- [ ] Add transaction history and spending analytics
- [ ] Create top-up tiers and spending flows at events

**Owner:** Full Stack Dev  
**Acceptance Criteria:** Users can preload credits and spend seamlessly at shows/merch

### Phase 6: Club Admin Dashboard (8 hours, Backend Dev)
**Tasks:**
- [ ] Create `/admin` protected routes for club owners
- [ ] Club member management with status analytics
- [ ] Unlock/perk creation and management interface
- [ ] Tap-in analytics and engagement metrics
- [ ] Manual point adjustments and member management tools

**Owner:** Backend Dev  
**Acceptance Criteria:** Club owners can manage their clubs, view analytics, create unlocks

### Phase 7: Production Deploy & Monitoring (6 hours, DevOps)
**Tasks:**
- [ ] Configure Stripe webhooks for house account payments
- [ ] Set up proper environment variables in Vercel production
- [ ] Configure custom domains and SSL
- [ ] Run smoke tests (auth, club joining, tap-ins, unlocks)
- [ ] Set up monitoring for club engagement and point system
- [ ] Performance optimization for mobile tap-in flows

**Owner:** DevOps  
**Acceptance Criteria:** Production deployment stable, QR tap-ins work on mobile, monitoring active

## 5. Concrete File Plan

| Action | File Path | Description |
|--------|-----------|-------------|
| **CREATE** | `config/featureFlags.ts` | Feature flag configuration and guards |
| **CREATE** | `app/membership/page.tsx` | Pricing tiers selection page |
| **CREATE** | `app/account/page.tsx` | User account dashboard |
| **CREATE** | `app/admin/page.tsx` | Admin dashboard (gated) |
| **CREATE** | `app/admin/members/page.tsx` | Member management |
| **CREATE** | `app/admin/codes/page.tsx` | Redemption code management |
| **CREATE** | `app/api/membership/plans/route.ts` | Get membership plans |
| **CREATE** | `app/api/membership/subscribe/route.ts` | Create Stripe subscription |
| **CREATE** | `app/api/membership/cancel/route.ts` | Cancel subscription |
| **CREATE** | `app/api/house/balance/route.ts` | Get house account balance |
| **CREATE** | `app/api/house/topup/route.ts` | Add house account credit |
| **CREATE** | `app/api/redemptions/validate/route.ts` | Validate redemption code |
| **CREATE** | `app/api/redemptions/redeem/route.ts` | Redeem code for credit |
| **CREATE** | `app/api/webhooks/stripe/route.ts` | Handle Stripe subscription events |
| **CREATE** | `components/MemberPassCard.tsx` | Membership status display |
| **CREATE** | `components/PricingGrid.tsx` | Membership plans selection |
| **CREATE** | `components/HouseAccountWidget.tsx` | Balance and top-up interface |
| **CREATE** | `hooks/use-membership.ts` | Membership data and actions |
| **CREATE** | `hooks/use-house-account.ts` | House account balance and transactions |
| **CREATE** | `migrations/001_membership_init.sql` | Initial membership schema |
| **CREATE** | `migrations/002_membership_indexes.sql` | Performance indexes |
| **MODIFY** | `middleware.ts` | Add membership gating logic |
| **MODIFY** | `app/layout.tsx` | Remove funding-related meta tags |
| **MODIFY** | `components/header.tsx` | Update navigation (remove funding links) |
| **MODIFY** | `app/dashboard/page.tsx` | Remove funding features, add membership status |
| **MODIFY** | `app/providers.tsx` | Remove Metal/funding providers |
| **MODIFY** | `package.json` | Remove funding dependencies |
| **DELETE** | `app/launch/page.tsx` | Project creation (redirect to `/membership`) |
| **DELETE** | `app/your-projects/page.tsx` | User projects list |
| **DELETE** | `app/review/[projectId]/page.tsx` | Project review |
| **DELETE** | `app/projects/[id]/cap-table/page.tsx` | Cap table visualization |
| **DELETE** | `app/moonpay-test/page.tsx` | MoonPay testing |
| **MOVE** | `components/fund-modal.tsx` | → `legacy/fund-modal.tsx` |
| **MOVE** | `components/trade-modal.tsx` | → `legacy/trade-modal.tsx` |
| **MOVE** | `components/financing-form.tsx` | → `legacy/financing-form.tsx` |
| **MOVE** | `hooks/use-financing.ts` | → `legacy/use-financing.ts` |
| **MOVE** | `hooks/use-presale.ts` | → `legacy/use-presale.ts` |

## 6. Provider Abstractions

### Payment Provider Interface

```typescript
// lib/payments/provider.ts
export interface PaymentProvider {
  createCheckoutSession(params: {
    planId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }>;
  
  cancelSubscription(subscriptionId: string): Promise<{ success: boolean }>;
  
  createTopUpSession(params: {
    userId: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }>;
  
  handleWebhook(body: string, signature: string): Promise<{
    type: 'subscription.created' | 'subscription.updated' | 'subscription.deleted' | 'payment.succeeded';
    data: any;
  }>;
}

// lib/payments/stripe.ts
export class StripePaymentProvider implements PaymentProvider {
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }
  
  async createCheckoutSession(params: {
    planId: string;
    userId: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price: params.planId, // Stripe price ID
        quantity: 1,
      }],
      customer_creation: 'always',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
      },
    });
    
    return {
      sessionId: session.id,
      url: session.url!,
    };
  }
  
  async cancelSubscription(subscriptionId: string) {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      return { success: false };
    }
  }
  
  async createTopUpSession(params: {
    userId: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'House Account Top-Up',
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
        type: 'house_account_topup',
      },
    });
    
    return {
      sessionId: session.id,
      url: session.url!,
    };
  }
  
  async handleWebhook(body: string, signature: string) {
    const event = this.stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    
    return {
      type: event.type as any,
      data: event.data.object,
    };
  }
}
```

**Notes for Future Crypto Rails:**
- Keep the `PaymentProvider` interface unchanged
- Implement `CryptoPaymentProvider` class with same methods
- Use environment flag to switch between Stripe and crypto
- Crypto implementation could use USDC on Base (existing wagmi setup)

## 7. Testing & QA

### Unit Test Plan

```typescript
// __tests__/lib/membership.test.ts
describe('Membership Business Logic', () => {
  test('balance transactions are atomic', async () => {
    // Test that house account top-ups and spends maintain consistency
  });
  
  test('webhook processing is idempotent', async () => {
    // Test duplicate webhook events don't double-credit accounts
  });
  
  test('membership gates work correctly', async () => {
    // Test access control based on membership status
  });
  
  test('redemption codes prevent double usage', async () => {
    // Test same user can't redeem same code twice
  });
});
```

### E2E Flow List (Playwright-Ready)

1. **Sign-in Flow:** User logs in with Privy → Dashboard shows non-member state
2. **Membership Purchase:** Click upgrade → Select plan → Stripe checkout → Success redirect → Account shows active membership
3. **Gated Route Access:** Non-member tries premium route → Redirected to pricing → Member accesses successfully
4. **House Account Top-up:** Member adds $50 credit → Balance increases → Transaction recorded
5. **Redemption Code:** Member enters valid code → Credit added → Code marked as used
6. **Admin Functions:** Admin views member list → Creates redemption code → Code appears in system

### Rollback Strategy

- **Feature Flags:** Toggle `enableMembership: false` to disable new features
- **Git Tags:** Tag pre-membership version as `v1.0-funding` for quick revert
- **Database:** Keep legacy tables intact during transition period
- **Environment:** Maintain separate staging environment for testing

## 8. Risk Register & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Stale KYC checks blocking membership** | High | Low | Remove all KYC/accreditation requirements from membership flow |
| **Race conditions on house account spends** | Medium | Medium | Use database transactions and row-level locking on balance updates |
| **Webhook duplication causing double credits** | High | Medium | Track `processed_event_ids` table, idempotent webhook processing |
| **Environment variable drift between local/Vercel** | Medium | High | Use `.env.example` template, automated environment validation |
| **Stripe webhook failures causing sync issues** | High | Low | Implement webhook retry mechanism and manual reconciliation tools |
| **Users losing access during transition** | High | Low | Maintain Privy auth as-is, graceful degradation for missing membership data |

### Code Hooks for Mitigations

```typescript
// Webhook idempotency table
CREATE TABLE processed_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

// Atomic balance updates
async function updateHouseAccountBalance(userId: string, amountCents: number, description: string) {
  return await db.transaction(async (tx) => {
    // Lock the house account row
    const account = await tx.houseAccounts
      .findFirst({ where: { userId }, lock: 'update' });
    
    if (account.balance + amountCents < 0) {
      throw new Error('Insufficient balance');
    }
    
    // Update balance and create transaction record
    await tx.houseAccounts.update({
      where: { userId },
      data: { balance: account.balance + amountCents }
    });
    
    await tx.houseTransactions.create({
      data: { 
        houseAccountId: account.id,
        amountCents,
        description,
        type: amountCents > 0 ? 'topup' : 'spend'
      }
    });
  });
}
```

## 9. Vercel Deployment Checklist

### New Project Setup
- [ ] Link GitHub repo to new Vercel project
- [ ] Configure build command: `npm run build`
- [ ] Set install command: `npm ci` (or `pnpm install` if using pnpm)
- [ ] Set output directory: `.next`
- [ ] Configure Node.js version: `18.x`

### Environment Variables (Production)
```bash
# Copy these to Vercel Environment Variables
NEXT_PUBLIC_PRIVY_APP_ID=your_production_privy_app_id
PRIVY_APP_SECRET=your_production_privy_secret
DATABASE_URL=postgresql://...production_db
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...production_webhook_secret
ADMIN_ALLOWLIST=admin_user_id_1,admin_user_id_2
ENABLE_HOUSE_ACCOUNTS=true
ENABLE_REDEMPTION_CODES=true
ENABLE_ADMIN_PANEL=true
```

### Domain & SSL Configuration
- [ ] Configure custom domain: `app.superfan.one`
- [ ] Verify SSL certificate auto-renewal
- [ ] Update Privy allowed origins to include production domain

### Webhook Configuration
- [ ] Create Stripe webhook endpoint: `https://app.superfan.one/api/webhooks/stripe`
- [ ] Enable events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`
- [ ] Copy webhook secret to environment variables

### Post-Deploy Smoke Tests
1. **Auth Test:** Login with test account → Verify JWT token generation
2. **Membership Test:** View pricing page → Start checkout flow (don't complete)
3. **API Test:** Call `/api/membership/plans` → Verify response
4. **Database Test:** Check membership tables exist and are accessible
5. **Error Monitoring:** Verify error logging and monitoring active

### Monitoring & Alerts
- [ ] Set up Vercel Analytics
- [ ] Configure error tracking (Sentry optional)
- [ ] Monitor API response times and error rates
- [ ] Set up alerts for webhook failures
- [ ] Database connection monitoring
Ran tool
## Summary

This comprehensive refactor plan transforms the Superfan funding/tokens app into a membership-focused platform while preserving the robust Privy authentication and embedded wallet infrastructure. The plan is optimized for execution in 2-3 short PRs:

**PR A (Flags & Cuts):** Implement feature flags, disable funding routes, clean navigation
**PR B (Membership Core):** Database setup, membership UX, basic subscription flow  
**PR C (Payments/Admin):** Stripe integration, house accounts, admin panel

Key design decisions:
- **Zero Downtime:** Feature flags ensure immediate disabling of funding features
- **Safe Removal:** Move components to `/legacy` instead of deletion for safety
- **Postgres-First:** Supabase-compatible schema with proper indexes and constraints
- **Stripe-Ready:** Payment provider abstraction allows future crypto integration
- **Admin-Lite:** Simple management tools without overwhelming complexity

The implementation preserves all authentication patterns while eliminating investor/financial complexity in favor of clean membership tiers and optional prepaid accounts. Total estimated effort: ~66 hours across 6 phases.