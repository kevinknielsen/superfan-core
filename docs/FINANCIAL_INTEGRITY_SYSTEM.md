# Financial Integrity System Design

## Overview

The Superfan points system requires financial backing to maintain integrity between virtual points and real monetary value. This document outlines the complete architecture for ensuring all point claims are backed by real money and all point spending results in actual payments.

## Core Principle

**1 Point = $0.01 USD (100 Points = $1 USD)**

Every point in circulation must be backed by real money in escrow to prevent infinite money creation and ensure venues/merchants get paid when points are spent.

### Monetary Peg and Accounting Rules

- **USD Peg**: Points are pegged to USD cents (1 point = 0.01 USD)
- **Internal Accounting**: All escrow and settlement accounting is maintained in USD cents
- **Rounding Rules**: Use banker's rounding (round-to-even) for all point↔USD conversions
- **Rounding Boundaries**: Round only at conversion boundaries and display; track fractional cents separately
- **FX Handling**: 
  - Authorized FX rate source: Real-time rates from authorized provider (timestamp recorded)
  - Convert non-USD transactions to USD at transaction time using current rate
  - Record FX rate and rounding adjustments in transaction/audit log
  - Escrow and settlement remain in USD to avoid peg drift
  - Periodic reconciliation frequency: Daily balance checks with 0.1% tolerance threshold

## System Architecture

### 1. Point Earning (Backed by Real Money)

#### Tap-In Points (Organic Earning)
```
User taps QR at event → Earns points → Backed by pre-funded escrow
├── These are "earned" through engagement
├── Funded by club/event marketing budget
└── Pre-funded in club's escrow allocation before issuance
```

#### Claim Code Points (Subsidized)
```
Admin creates claim codes → Must deposit real money to escrow
├── Want to give away 500 × 100 points ($500 value)
├── Admin must deposit $500 to Superfan escrow FIRST
├── Only then can claim codes be generated
└── Each code redemption moves $1 from escrow to user's spendable balance
```

### 2. Point Spending (Two Channels, Same Balance)

#### Physical QR Code Spending
```
User scans QR at venue → Points deducted → Venue gets paid
├── User has 1,000 points ($10) in Billfold
├── Spends 500 points ($5) at venue
├── $5 moves from Superfan escrow to venue settlement account
└── User balance: 500 points remaining
```

#### Digital In-App Spending
```
User buys digital service → Points deducted → Merchant gets paid
├── User spends 300 points ($3) on digital purchase
├── $3 moves from Superfan escrow to merchant account
├── Same unified balance as QR spending
└── User balance: 200 points remaining
```

### 3. Status-Based Perks (No Spending Required)

```
Perk Access Check:
├── System checks user's total point balance
├── 15,000+ points = Headliner status
├── Grants access to Line Skip, Studio Visit, etc.
├── NO POINTS ARE DEDUCTED
└── Just a status verification, not a transaction
```

## Required Database Changes

### New Tables

#### `escrow_accounts`
```sql
CREATE TABLE escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL CHECK (account_type IN ('master', 'club', 'event')),
  club_id UUID, -- Only set when account_type = 'club'
  event_id UUID, -- Only set when account_type = 'event'
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = UPPER(currency)), -- ISO 4217 uppercase
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0 AND reserved_cents <= balance_cents),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Type-specific column constraints
  CONSTRAINT chk_escrow_master CHECK (
    (account_type = 'master' AND club_id IS NULL AND event_id IS NULL) OR
    (account_type = 'club' AND club_id IS NOT NULL AND event_id IS NULL) OR
    (account_type = 'event' AND event_id IS NOT NULL AND club_id IS NULL)
  ),
  
  -- Foreign key references
  CONSTRAINT fk_escrow_club FOREIGN KEY (club_id) REFERENCES clubs(id),
  CONSTRAINT fk_escrow_event FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Automatic updated_at maintenance
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_escrow_accounts_updated_at 
  BEFORE UPDATE ON escrow_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Partial unique indexes to prevent duplicate accounts by type and currency
CREATE UNIQUE INDEX ux_escrow_master ON escrow_accounts(account_type, currency) 
  WHERE account_type = 'master';

CREATE UNIQUE INDEX ux_escrow_club ON escrow_accounts(account_type, club_id, currency) 
  WHERE account_type = 'club';

CREATE UNIQUE INDEX ux_escrow_event ON escrow_accounts(account_type, event_id, currency) 
  WHERE account_type = 'event';
```

#### `escrow_transactions`
```sql
CREATE TABLE escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_escrow_account_id UUID REFERENCES escrow_accounts(id),
  to_escrow_account_id UUID REFERENCES escrow_accounts(id),
  type TEXT NOT NULL, -- 'deposit', 'reserve', 'settle', 'refund', 'release'
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  reference_type TEXT, -- 'claim_code', 'point_spend', 'settlement'
  reference_id UUID,
  description TEXT,
  stripe_payment_intent_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure at least one account is specified
  CONSTRAINT chk_escrow_tx_accounts CHECK (
    from_escrow_account_id IS NOT NULL OR to_escrow_account_id IS NOT NULL
  )
);

-- Unique idempotency constraint
CREATE UNIQUE INDEX ux_escrow_tx_idem ON escrow_transactions(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Performance indexes
CREATE INDEX ix_escrow_tx_from_account ON escrow_transactions(from_escrow_account_id, created_at);
CREATE INDEX ix_escrow_tx_to_account ON escrow_transactions(to_escrow_account_id, created_at);
CREATE INDEX ix_escrow_tx_reference ON escrow_transactions(reference_type, reference_id);
```

**Alternative: Strict Double-Entry Ledger**
For full double-entry accounting, consider this alternative structure:
```sql
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL, -- Groups debit/credit pairs
  debit_account_id UUID REFERENCES escrow_accounts(id),
  credit_account_id UUID REFERENCES escrow_accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each entry must have exactly one debit OR credit
  CONSTRAINT chk_ledger_entry_single_side CHECK (
    (debit_account_id IS NOT NULL AND credit_account_id IS NULL) OR
    (debit_account_id IS NULL AND credit_account_id IS NOT NULL)
  )
);

-- Derive account balances from ledger
CREATE VIEW account_balances AS
WITH account_activity AS (
  -- Credits (money coming into accounts)
  SELECT credit_account_id as account_id, SUM(amount_cents) as credits
  FROM ledger_entries 
  WHERE credit_account_id IS NOT NULL
  GROUP BY credit_account_id
  
  UNION ALL
  
  -- Debits (money going out of accounts)
  SELECT debit_account_id as account_id, -SUM(amount_cents) as debits
  FROM ledger_entries 
  WHERE debit_account_id IS NOT NULL
  GROUP BY debit_account_id
)
SELECT 
  account_id,
  SUM(COALESCE(credits, 0) + COALESCE(debits, 0)) as balance_cents
FROM account_activity
GROUP BY account_id;
```

#### `point_liabilities`
```sql
CREATE TABLE point_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (points >= 0),
  source_type TEXT NOT NULL, -- 'claim_code', 'tap_in', 'purchase'
  source_id UUID,
  escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
  reservation_id UUID REFERENCES reservations(id), -- Link to escrow hold
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'spent', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spent_at TIMESTAMPTZ,
  
  -- Spent liabilities must have spent_at timestamp
  CONSTRAINT chk_point_liability_spent CHECK (
    (status = 'spent' AND spent_at IS NOT NULL) OR 
    (status != 'spent' AND spent_at IS NULL)
  )
);

-- Index for FIFO spend ordering and reporting
CREATE INDEX ix_point_liabilities_fifo ON point_liabilities(
  escrow_account_id, status, created_at
) WHERE status = 'active';

-- Index for user balance queries
CREATE INDEX ix_point_liabilities_user ON point_liabilities(
  user_id, status, created_at
);

-- Note: cents_value removed - derive as points * 0.01 when needed
-- This prevents data inconsistency and ensures single source of truth
```

#### `spend_liability_allocations`
```sql
CREATE TABLE spend_liability_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_id UUID NOT NULL, -- References the spend transaction
  liability_id UUID NOT NULL REFERENCES point_liabilities(id),
  points_allocated INTEGER NOT NULL CHECK (points_allocated > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate allocations for same spend/liability pair
  CONSTRAINT ux_spend_liability UNIQUE(spend_id, liability_id)
);

-- Index for liability consumption queries
CREATE INDEX ix_spend_alloc_liability ON spend_liability_allocations(liability_id, points_allocated);

-- Index for spend audit queries  
CREATE INDEX ix_spend_alloc_spend ON spend_liability_allocations(spend_id, created_at);
```

#### `reservations`
```sql
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
  reserved_cents INTEGER NOT NULL CHECK (reserved_cents > 0),
  remaining_cents INTEGER NOT NULL CHECK (remaining_cents >= 0 AND remaining_cents <= reserved_cents),
  purpose TEXT NOT NULL, -- 'redemption_codes', 'point_spend', 'settlement'
  reference_type TEXT, -- 'claim_code_batch', 'user_spend', 'merchant_payout'
  reference_id UUID,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partial', 'completed', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Completed reservations must have completion timestamp
  CONSTRAINT chk_reservation_completed CHECK (
    (status IN ('completed', 'expired', 'cancelled') AND completed_at IS NOT NULL) OR 
    (status NOT IN ('completed', 'expired', 'cancelled') AND completed_at IS NULL)
  )
);

-- Index for expiry cleanup jobs
CREATE INDEX ix_reservations_expiry ON reservations(expires_at, status) 
  WHERE expires_at IS NOT NULL AND status IN ('active', 'partial');

-- Index for account balance calculations
CREATE INDEX ix_reservations_account ON reservations(escrow_account_id, status);
```

### Modified Tables

#### `redemption_codes` (Add Escrow Backing)
```sql
ALTER TABLE redemption_codes ADD COLUMN escrow_account_id UUID REFERENCES escrow_accounts(id);
ALTER TABLE redemption_codes ADD COLUMN reservation_id UUID REFERENCES reservations(id);
ALTER TABLE redemption_codes ADD COLUMN requires_funding BOOLEAN DEFAULT true;
ALTER TABLE redemption_codes ADD COLUMN funded_at TIMESTAMPTZ;

-- Ensure funded codes have funding timestamp
ALTER TABLE redemption_codes ADD CONSTRAINT chk_redemption_funding 
  CHECK (requires_funding = false OR funded_at IS NOT NULL);
```

#### `house_transactions` (Link to Escrow)
```sql
ALTER TABLE house_transactions ADD COLUMN escrow_transaction_id UUID REFERENCES escrow_transactions(id);
```

## API Changes Required

### 1. Escrow Management APIs

#### `POST /api/admin/escrow/deposit`
```typescript
// Admin deposits real money to back point claims
{
  amount_cents: number,
  currency: string, // ISO 4217 code (e.g., 'USD', 'EUR')
  entity_type: 'club' | 'event' | 'master',
  entity_id?: string,
  stripe_payment_intent_id: string,
  idempotency_key: string, // Client-supplied or auto-generated
  actor_id: string, // Admin user ID
  actor_type: 'admin' | 'system' | 'api_key'
}

// Response includes deposit tracking ID and webhook expectations
Response: {
  deposit_id: string,
  status: 'pending' | 'confirmed' | 'failed',
  expected_webhook_events: ['payment_intent.succeeded', 'payment_intent.payment_failed'],
  webhook_timeout_seconds: 300
}
```

**Stripe Webhook Reconciliation Flow:**
1. **Webhook Receipt**: Verify Stripe signature and extract event data
2. **Event Mapping**: Match `payment_intent.succeeded/failed` to deposit by `stripe_payment_intent_id`
3. **Idempotent Processing**: Use stored `idempotency_key` to prevent duplicate processing
4. **Status Update**: Update deposit status and escrow balance atomically
5. **Audit Logging**: Record all state changes with timestamp and event correlation
6. **Error Handling**: Log mismatches or verification failures for manual reconciliation

#### `GET /api/admin/escrow/balance`
```typescript
// Check escrow balances and liabilities
Response: {
  available_cents: number,
  reserved_cents: number, // Outstanding point liabilities
  total_points_issued: number,
  backing_ratio: number // Should always be 1.0 or higher
}
```

### 2. Enhanced Redemption Code Creation

#### `POST /api/admin/redemption-codes` (Enhanced)
```typescript
// Must verify escrow funding before creating codes
{
  value_cents: number,
  quantity: number,
  total_cost: number, // value_cents * quantity
  escrow_account_id: string, // Must have sufficient balance
  expires_at?: string, // ISO 8601 timestamp, optional TTL
  requires_funding: true,
  idempotency_key: string
}

// Response includes reservation tracking
Response: {
  batch_id: string,
  reservation_id: string,
  codes: string[],
  reserved_cents: number,
  expires_at?: string,
  status: 'active'
}
```

**Atomic Redemption Code Creation Process:**
```sql
BEGIN TRANSACTION;

-- 1. Create reservation (atomic fund hold)
INSERT INTO reservations (
  escrow_account_id, reserved_cents, remaining_cents, 
  purpose, expires_at, status
) VALUES (
  $escrow_account_id, $total_cost, $total_cost,
  'redemption_codes', $expires_at, 'active'
) RETURNING id as reservation_id;

-- 2. Lock and update escrow account (prevent concurrent reservations)
SELECT 1 FROM escrow_accounts 
WHERE id = $escrow_account_id FOR UPDATE;

UPDATE escrow_accounts 
SET reserved_cents = reserved_cents + $total_cost,
    updated_at = NOW()
WHERE id = $escrow_account_id 
  AND balance_cents >= reserved_cents + $total_cost -- Ensure sufficient funds
RETURNING id;

-- Explicit check: fail if no rows were updated (insufficient funds or race condition)
IF NOT FOUND THEN
  RAISE EXCEPTION 'Insufficient escrow balance or concurrent reservation conflict';
END IF;

-- 3. Create redemption codes linked to reservation
INSERT INTO redemption_codes (
  code, value_cents, escrow_account_id, reservation_id,
  requires_funding, funded_at, expires_at
) VALUES ... ; -- Bulk insert all codes

COMMIT;
```

**Partial Redemption & Expiry Handling:**
- **On Code Redemption**: Decrement `reservation.remaining_cents`, create `point_liabilities`
- **Partial Completion**: When `remaining_cents = 0`, mark reservation as 'completed'
- **Expiry Release**: Background job processes expired reservations:
  ```sql
  -- Atomic expiry processing with proper fund release
  WITH expired_reservations AS (
    SELECT id, escrow_account_id, remaining_cents
    FROM reservations 
    WHERE expires_at < NOW() AND status IN ('active', 'partial')
    FOR UPDATE
  ),
  expired_totals AS (
    SELECT escrow_account_id, SUM(remaining_cents) as total_to_release
    FROM expired_reservations
    GROUP BY escrow_account_id
  )
  UPDATE escrow_accounts 
  SET reserved_cents = GREATEST(0, reserved_cents - expired_totals.total_to_release),
      updated_at = NOW()
  FROM expired_totals
  WHERE escrow_accounts.id = expired_totals.escrow_account_id;
  
  -- Mark reservations and codes as expired
  UPDATE reservations 
  SET status = 'expired', completed_at = NOW()
  WHERE expires_at < NOW() AND status IN ('active', 'partial');
  
  UPDATE redemption_codes 
  SET status = 'expired'
  WHERE reservation_id IN (
    SELECT id FROM reservations WHERE status = 'expired'
  );
  ```

### 3. Point Spending Settlement

#### `POST /api/points/spend`
```typescript
// Unified spending endpoint for both QR and digital
{
  user_id: string,
  amount_points: number,
  spend_type: 'qr_code' | 'digital_purchase',
  merchant_id: string,
  transaction_reference: string, // Must be unique per user
  idempotency_key: string, // Client-supplied or auto-generated
  sequence_number?: number // Optional client-side ordering
}

// Response includes spend tracking and settlement info
Response: {
  spend_id: string,
  amount_points: number,
  amount_cents: number,
  settlement_id: string,
  status: 'completed' | 'queued' | 'failed',
  processed_at: string,
  merchant_payout_eta: string
}
```

**FIFO Spend Processing with Concurrency Protection:**
```sql
-- Idempotency table for request deduplication
CREATE TABLE spend_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  response_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Per-user spend queue for FIFO ordering
CREATE TABLE user_spend_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sequence_number BIGINT NOT NULL,
  spend_request JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  UNIQUE(user_id, sequence_number)
);

-- Atomic spend processing with FIFO guarantee
BEGIN TRANSACTION;

-- 1. Check idempotency (return stored response if duplicate)
SELECT response_data FROM spend_idempotency 
WHERE idempotency_key = $idempotency_key;

-- 2. Acquire user spend lock (prevents concurrent spends)
SELECT user_id FROM users WHERE id = $user_id FOR UPDATE;

-- 3. Select oldest active liabilities (FIFO order) with remaining points
SELECT id, points, 
       COALESCE(points - COALESCE(SUM(allocated_points), 0), points) as points_remaining
FROM point_liabilities pl
LEFT JOIN spend_liability_allocations sla ON pl.id = sla.liability_id
WHERE pl.user_id = $user_id AND pl.status = 'active'
GROUP BY pl.id, pl.points, pl.created_at
HAVING COALESCE(points - COALESCE(SUM(allocated_points), 0), points) > 0
ORDER BY pl.created_at ASC
FOR UPDATE;

-- 4. Create allocation records for this spend (supports partial allocation)
INSERT INTO spend_liability_allocations (
  spend_id, liability_id, points_allocated, created_at
) 
SELECT $spend_id, liability_id, allocated_amount, NOW()
FROM (
  -- Calculate allocation per liability (FIFO distribution)
  SELECT id as liability_id,
         LEAST(points_remaining, 
               GREATEST(0, $amount_points - LAG(running_total, 1, 0) OVER (ORDER BY created_at))
         ) as allocated_amount
  FROM (
    SELECT id, points_remaining, created_at,
           SUM(points_remaining) OVER (ORDER BY created_at ROWS UNBOUNDED PRECEDING) as running_total
    FROM selected_liabilities
  ) t
  WHERE allocated_amount > 0
) allocations;

-- 5. Mark fully consumed liabilities as spent
UPDATE point_liabilities 
SET status = 'spent', spent_at = NOW()
WHERE id IN (
  SELECT pl.id 
  FROM point_liabilities pl
  JOIN (
    SELECT liability_id, SUM(points_allocated) as total_allocated
    FROM spend_liability_allocations 
    WHERE liability_id IN (SELECT id FROM selected_liabilities)
    GROUP BY liability_id
  ) alloc ON pl.id = alloc.liability_id
  WHERE pl.points = alloc.total_allocated
);

-- 6. Create settlement transaction
INSERT INTO escrow_transactions (
  from_escrow_account_id, to_escrow_account_id,
  type, amount_cents, idempotency_key
) VALUES (...);

-- 7. Store idempotency record
INSERT INTO spend_idempotency (
  idempotency_key, user_id, request_hash, response_data
) VALUES (...);

COMMIT;
```

**Concurrency & Deduplication Guarantees:**
- **Request Deduplication**: `idempotency_key` ensures identical responses for retries
- **User-Level Locking**: `SELECT ... FOR UPDATE` prevents concurrent spends per user
- **FIFO Enforcement**: Liability selection by `created_at ASC` ensures oldest-first spending
- **Unique Constraints**: `(user_id, transaction_reference)` prevents duplicate transactions
- **TTL Cleanup**: Background job removes expired idempotency records

### 4. Settlement System

#### `POST /api/admin/settlements/process`
```typescript
// Process pending settlements to merchants/venues
// Runs daily/weekly to pay out accumulated point spending
```

## Implementation Phases

### Phase 1: Escrow Foundation (Week 1)
- [ ] Create escrow database tables
- [ ] Build basic escrow account management
- [ ] Create deposit API for funding escrow
- [ ] Add escrow balance checking

### Phase 2: Redemption Code Backing (Week 1)
- [ ] Modify redemption code creation to require escrow funding
- [ ] Add funding verification before code generation
- [ ] Link redemption codes to escrow reservations
- [ ] Prevent code creation without sufficient funds

### Phase 3: Point Spending Settlement (Week 2)
- [ ] Create unified point spending API
- [ ] Build settlement transaction system
- [ ] Add merchant payout queue
- [ ] Implement daily settlement processing

### Phase 4: Monitoring & Reconciliation (Week 2)
- [ ] Build admin dashboard for escrow monitoring
- [ ] Add backing ratio alerts (should always be ≥ 1.0)
- [ ] Create reconciliation reports
- [ ] Add fraud detection for unusual patterns

## Financial Controls

### Backing Ratio Monitoring
```
Backing Ratio = Total Escrow Balance / Total Outstanding Points Value

Target: ≥ 1.0 (100% backing)
Alert: < 1.0 (underfunded - critical issue)
```

### Daily Reconciliation Checks
- Total points issued = Total escrow reservations
- Total points spent = Total settlement payments
- No "phantom" points exist without backing
- All merchant payments are processed

### Admin Safeguards
- Redemption codes cannot be created without funding
- Point claims automatically reserve escrow funds
- Settlement payments are automated and audited
- All financial transactions have audit trails

## Risk Mitigation

### Fraud Prevention
- All point issuance requires escrow backing
- Settlement payments are batched and reviewed
- Unusual spending patterns trigger alerts
- Admin actions require multi-factor authentication

### Financial Stability
- Escrow accounts are held in separate bank accounts
- Regular reconciliation prevents discrepancies
- Backing ratio monitoring ensures solvency
- Emergency procedures for system issues

## Success Metrics

- **100% Backing Ratio**: All points backed by real money
- **Zero Phantom Points**: No unbacked point creation
- **Automated Settlements**: Merchants paid automatically
- **Real-Time Monitoring**: Live financial health dashboard
- **Audit Compliance**: Complete transaction trails

---

## Next Steps

### Pre-Implementation Requirements
1. **Money Transmitter Licensing Review**
   - Assess MT license requirements by jurisdiction
   - Document exemptions (if applicable) with legal counsel
   - File necessary applications and await approvals

2. **KYC/KYB Process Implementation**
   - Design KYC flows for high-value users (>$3,000/year)
   - Implement KYB processes for merchant onboarding
   - Set up identity verification and risk scoring

3. **Tax & Reporting Impact Assessment**
   - Define reporting thresholds (1099-K, etc.)
   - Set up data retention policies (7+ years)
   - Implement tax reporting automation

### Implementation Phases
4. **Review and approve this architecture**
5. **Set up escrow bank accounts with Stripe**
6. **Begin Phase 1 implementation**
7. **Create admin tools for escrow management**
8. **Test with small amounts before full deployment**

## Compliance Checklist

### Required Approvals
| Requirement | Owner | Timeline | Status | Documentation |
|-------------|-------|----------|---------|---------------|
| Money Transmitter License Review | Legal Team | 4-8 weeks | Pending | MT_Analysis.pdf |
| KYC/AML Policy Documentation | Compliance | 2-3 weeks | Pending | KYC_Policy.pdf |
| Tax Reporting Framework | Tax Advisor | 3-4 weeks | Pending | Tax_Framework.pdf |
| Data Retention Policy | Privacy Team | 1-2 weeks | Pending | Retention_Policy.pdf |
| Financial Audit Readiness | Finance Team | 2-3 weeks | Pending | Audit_Checklist.pdf |

### Regulatory Thresholds (Configuration-Driven)

**⚠️ All threshold values must be read from compliance configuration, not hard-coded:**

- **KYC Trigger**: `compliance.thresholds.kyc.annual_purchase_limit` (fallback: $3,000)
- **KYB Requirement**: `compliance.thresholds.kyb.annual_payout_limit` (fallback: $600)
- **1099-K Reporting**: 
  - 2023+: `compliance.thresholds.reporting.1099k.2023` (fallback: $600)
  - Pre-2023: `compliance.thresholds.reporting.1099k.legacy` (fallback: $20,000 + 200 transactions)
  - Per-jurisdiction overrides: `compliance.thresholds.reporting.1099k.state.{STATE_CODE}`
- **Record Retention**: `compliance.recordRetention.years` (fallback: 7 years)

**Configuration Keys:**
```json
{
  "compliance": {
    "thresholds": {
      "kyc": {
        "annual_purchase_limit": 3000,
        "description": "USD cents - trigger individual KYC"
      },
      "kyb": {
        "annual_payout_limit": 60000,
        "description": "USD cents - trigger business verification"
      },
      "reporting": {
        "1099k": {
          "2023": 60000,
          "legacy": 2000000,
          "transaction_count_legacy": 200,
          "state": {
            "VT": 60000,
            "MA": 60000
          }
        }
      }
    },
    "recordRetention": {
      "years": 7,
      "description": "Financial transaction and user data retention period"
    }
  }
}
```

**Implementation Requirements:**
- Load thresholds from configuration service at runtime
- Cache values with TTL for performance
- Fall back to documented defaults only when config is unavailable
- Update configuration when IRS/state regulations change
- Log threshold changes for audit compliance

**⚠️ Implementation cannot begin until all compliance requirements are satisfied**

This system ensures financial integrity while maintaining the user experience of seamless point earning and spending across both digital and physical channels.
