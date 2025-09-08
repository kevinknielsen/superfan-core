# Financial Integrity System Design

## Overview

The Superfan points system requires financial backing to maintain integrity between virtual points and real monetary value. This document outlines the complete architecture for ensuring all point claims are backed by real money and all point spending results in actual payments.

## Core Principle

**1 Point = $0.01 USD (100 Points = $1 USD)**

Every point in circulation must be backed by real money in escrow to prevent infinite money creation and ensure venues/merchants get paid when points are spent.

## System Architecture

### 1. Point Earning (Backed by Real Money)

#### Tap-In Points (Organic Earning)
```
User taps QR at event → Earns points → No escrow needed
├── These are "earned" through engagement
├── Funded by club/event marketing budget
└── Pre-funded in club's escrow allocation
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
  account_type TEXT NOT NULL, -- 'master', 'club', 'event'
  entity_id UUID, -- club_id or event_id (null for master)
  balance_cents INTEGER NOT NULL DEFAULT 0,
  reserved_cents INTEGER NOT NULL DEFAULT 0, -- Outstanding point liabilities
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `escrow_transactions`
```sql
CREATE TABLE escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
  type TEXT NOT NULL, -- 'deposit', 'reserve', 'settle', 'refund'
  amount_cents INTEGER NOT NULL,
  reference_type TEXT, -- 'claim_code', 'point_spend', 'settlement'
  reference_id UUID,
  description TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `point_liabilities`
```sql
CREATE TABLE point_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  cents_value INTEGER NOT NULL, -- points * 1 cent
  source_type TEXT NOT NULL, -- 'claim_code', 'tap_in', 'purchase'
  source_id UUID,
  escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'spent', 'expired'
  created_at TIMESTAMP DEFAULT NOW(),
  spent_at TIMESTAMP
);
```

### Modified Tables

#### `redemption_codes` (Add Escrow Backing)
```sql
ALTER TABLE redemption_codes ADD COLUMN escrow_account_id UUID REFERENCES escrow_accounts(id);
ALTER TABLE redemption_codes ADD COLUMN requires_funding BOOLEAN DEFAULT true;
ALTER TABLE redemption_codes ADD COLUMN funded_at TIMESTAMP;
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
  entity_type: 'club' | 'event' | 'master',
  entity_id?: string,
  stripe_payment_intent_id: string
}
```

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
  requires_funding: true
}

// Process:
// 1. Check escrow account has sufficient balance
// 2. Reserve the funds (move to reserved_cents)
// 3. Create redemption codes
// 4. Link codes to escrow reservation
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
  transaction_reference: string
}

// Process:
// 1. Deduct points from user balance
// 2. Create escrow settlement transaction
// 3. Queue payment to merchant
// 4. Update point liability status to 'spent'
```

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

1. **Review and approve this architecture**
2. **Set up escrow bank accounts with Stripe**
3. **Begin Phase 1 implementation**
4. **Create admin tools for escrow management**
5. **Test with small amounts before full deployment**

This system ensures financial integrity while maintaining the user experience of seamless point earning and spending across both digital and physical channels.
