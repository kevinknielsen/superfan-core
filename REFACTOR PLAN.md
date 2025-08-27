# Superfan Core → Membership App Refactor Plan

## 🎯 Status: Phase 2 Complete ✅

**Phase 1 (Feature Flags & Route Removals) - COMPLETED**
- ✅ All funding features disabled via feature flags
- ✅ Legacy components moved to `/legacy` folder
- ✅ Navigation updated for membership focus
- ✅ NPM dependencies cleaned up
- ✅ TypeScript compilation successful

**Phase 2 (Database Connect & Data Access Layer) - COMPLETED ✅**
- ✅ Connected to Supabase database with environment variables from Vercel
- ✅ Created comprehensive membership schema (users, membership_plans, memberships, house_accounts, etc.)
- ✅ Built data access hooks (use-membership.ts, use-house-account.ts) with React Query
- ✅ Enhanced UnifiedAuthContext to include membership status and features
- ✅ Created membership API routes skeleton (/api/membership/*, /api/house/*)
- ✅ Maintained full Privy authentication + Metal wallet compatibility
- ✅ Development server running successfully

**Next:** Phase 3 - Membership UX (Frontend Implementation)

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

## 3. Target Architecture (Membership)

### Data Model

```sql
-- User table (leverage existing with Privy ID)
-- users table exists, extends with membership fields

-- Membership Plans
CREATE TABLE membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL, -- in cents, e.g. 999 = $9.99
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  features JSONB DEFAULT '[]', -- array of feature strings
  max_house_account_balance_cents INTEGER DEFAULT 0, -- 0 = no house account
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Memberships
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN DEFAULT true,
  stripe_subscription_id TEXT UNIQUE, -- if using Stripe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id) -- one active membership per user
);

-- House Accounts (prepaid credit system)
CREATE TABLE house_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER DEFAULT 0 CHECK (balance_cents >= 0),
  lifetime_topup_cents INTEGER DEFAULT 0, -- total ever added
  lifetime_spend_cents INTEGER DEFAULT 0, -- total ever spent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- House Account Transactions
CREATE TABLE house_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_account_id UUID NOT NULL REFERENCES house_accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'spend', 'refund', 'adjustment')),
  amount_cents INTEGER NOT NULL, -- positive for credits, negative for debits
  description TEXT NOT NULL,
  reference_id TEXT, -- external transaction ID, redemption code, etc.
  stripe_payment_intent_id TEXT, -- if paid via Stripe
  admin_user_id UUID REFERENCES users(id), -- if admin action
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redemption Codes (optional feature)
CREATE TABLE redemption_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  value_cents INTEGER NOT NULL CHECK (value_cents > 0),
  uses_remaining INTEGER DEFAULT 1 CHECK (uses_remaining >= 0),
  max_uses INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX(code, is_active)
);

-- Redemption History
CREATE TABLE code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_code_id UUID NOT NULL REFERENCES redemption_codes(id),
  user_id UUID NOT NULL REFERENCES users(id),
  house_transaction_id UUID NOT NULL REFERENCES house_transactions(id),
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(redemption_code_id, user_id) -- prevent double redemption by same user
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

### Phase 3: Membership UX (16 hours, Frontend Dev)
**Tasks:**
- [ ] Create `/membership` pricing page with 3 tiers
- [ ] Create `/account` page showing current plan, renewal date, balance
- [ ] Add membership gating middleware for protected routes
- [ ] Create `MemberPassCard` component
- [ ] Update dashboard to show membership status
- [ ] Add upgrade/cancel membership flows

**Owner:** Frontend Dev  
**Acceptance Criteria:** Users can view plans, see account status, membership gates work

### Phase 4: House Accounts (Optional, 12 hours, Full Stack)
**Tasks:**
- [ ] Create house account top-up API with Stripe integration
- [ ] Add balance management UI to `/account` page
- [ ] Implement redemption code system
- [ ] Add transaction history view
- [ ] Create top-up tiers ($40→$50, $80→$100, $160→$200)

**Owner:** Full Stack Dev  
**Acceptance Criteria:** Users can add credit, redeem codes, view transaction history

### Phase 5: Admin Lite (8 hours, Backend Dev)
**Tasks:**
- [ ] Create `/admin` protected routes
- [ ] Member list with search/filter
- [ ] Transaction ledger views
- [ ] Manual redemption code creation
- [ ] Simple admin dashboard

**Owner:** Backend Dev  
**Acceptance Criteria:** Admins can view members, create codes, basic management

### Phase 6: Vercel Deploy & Webhooks (6 hours, DevOps)
**Tasks:**
- [ ] Configure Stripe webhooks for subscription events
- [ ] Set up proper environment variables in Vercel
- [ ] Configure custom domains
- [ ] Run smoke tests (auth, membership purchase, account page)
- [ ] Monitor error rates and performance

**Owner:** DevOps  
**Acceptance Criteria:** Production deployment stable, webhooks working, monitoring active

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