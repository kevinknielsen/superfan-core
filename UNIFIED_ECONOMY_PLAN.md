# Superfan Unified Economy Implementation Plan

## 🎯 **Vision: Points + Escrow Economy**

Transform Superfan from a membership platform into a complete **artist economy platform** where:
- **Points** = Universal currency (earned through engagement, purchased with USD, spent on everything)
- **Status** = Social tier based on earned points (not affected by spending)
- **Escrow** = Risk-free demand validation for merch/vinyl with automatic fulfillment
- **Community** = Shared investment in artist success through pre-orders

---

## 📋 **5-Phase Implementation Plan**

### **Phase 1: Unified Points Foundation** (2 weeks)
**Goal**: Merge earned/purchased points into single spendable currency

**Database Changes:**
```sql
-- Enhanced point wallet with spending breakdown
ALTER TABLE point_wallets ADD COLUMN earned_pts INTEGER DEFAULT 0;
ALTER TABLE point_wallets ADD COLUMN purchased_pts INTEGER DEFAULT 0; 
ALTER TABLE point_wallets ADD COLUMN spent_pts INTEGER DEFAULT 0;
ALTER TABLE point_wallets ADD COLUMN escrowed_pts INTEGER DEFAULT 0;
-- Create computed view for status points (avoids complex generated column)
CREATE OR REPLACE VIEW v_point_wallets AS
SELECT pw.*,
       (pw.earned_pts - COALESCE(pe.sum_held, 0)) AS status_pts
FROM point_wallets pw
LEFT JOIN (
  SELECT user_id, club_id, SUM(points_escrowed) AS sum_held
  FROM point_escrow WHERE status = 'held' GROUP BY user_id, club_id
) pe USING (user_id, club_id);

-- Enhanced transactions with source tracking
ALTER TABLE point_transactions ADD COLUMN source TEXT CHECK (source IN ('earned', 'purchased', 'spent', 'transferred', 'escrowed', 'refunded'));
ALTER TABLE point_transactions ADD COLUMN affects_status BOOLEAN DEFAULT false;
```

**Core Features:**
- [x] Unified point balance display
- [x] Smart spending logic (purchased points first, then earned)
- [x] Status protection option (don't spend below tier threshold)
- [x] Purchase bundles with bonus points
- [x] Transaction history with source breakdown

**API Routes:**
- `POST /api/points/spend` - Spend points with status protection
- `POST /api/points/transfer` - Transfer points between users
- `GET /api/points/breakdown` - Detailed balance breakdown

---

### **Phase 2: Enhanced Status System** (1 week)  
**Goal**: Sophisticated status mechanics with engagement rewards

**Features:**
- [x] Status calculation based on earned points only
- [x] Status decay system (1%/day after 30 days inactivity)
- [x] Status boosts (double points events, referral bonuses)
- [x] Status-gated features and early access
- [x] Social status display and leaderboards

**Database Changes:**
```sql
-- Status thresholds per club
CREATE TABLE status_thresholds (
  club_id UUID REFERENCES clubs(id),
  status TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  perks JSONB DEFAULT '[]',
  PRIMARY KEY (club_id, status)
);

-- Status history tracking
CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  club_id UUID REFERENCES clubs(id), 
  old_status TEXT,
  new_status TEXT,
  points_at_change INTEGER,
  reason TEXT, -- 'earned', 'decay', 'boost'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### **Phase 3: Pre-Order Escrow System** (3 weeks)
**Goal**: Risk-free demand validation with point commitments

**Database Schema:**
```sql
-- Pre-order campaigns
CREATE TABLE preorder_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  title TEXT NOT NULL,
  description TEXT,
  
  -- Escrow mechanics  
  moq INTEGER NOT NULL, -- Minimum order quantity
  deadline TIMESTAMPTZ NOT NULL,
  point_price INTEGER NOT NULL, -- Base points per unit
  usd_price_cents INTEGER, -- Optional USD for non-members
  
  -- Product variants
  variants JSONB DEFAULT '[]',
  
  -- Instant gratification
  instant_unlock_id UUID REFERENCES unlocks(id),
  
  -- Campaign status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'funded', 'fulfilled', 'cancelled')),
  current_commitments INTEGER DEFAULT 0,
  total_points_committed INTEGER DEFAULT 0,
  funded_at TIMESTAMPTZ,
  
  -- Manufacturing
  manufacturing_csv_generated BOOLEAN DEFAULT false,
  estimated_ship_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User commitments (escrow entries)
CREATE TABLE preorder_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  campaign_id UUID NOT NULL REFERENCES preorder_campaigns(id),
  
  quantity INTEGER NOT NULL DEFAULT 1,
  variant_name TEXT NOT NULL DEFAULT '',
  points_committed INTEGER NOT NULL,
  
  -- Escrow status
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'charged', 'refunded', 'fulfilled')),
  
  -- Payment integration
  stripe_payment_intent_id TEXT,
  
  -- Instant rewards
  instant_unlock_claimed BOOLEAN DEFAULT false,
  
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  charged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, campaign_id, variant_name)
);

-- Point escrow tracking
CREATE TABLE point_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  commitment_id UUID NOT NULL REFERENCES preorder_commitments(id),
  
  points_escrowed INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'charged', 'refunded')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

**Core Features:**
- [x] Campaign creation and management
- [x] Point escrow system (hold points safely)
- [x] MOQ tracking with progress bars
- [x] Automatic refunds if campaign fails
- [x] Instant digital unlocks for backers
- [x] Status-gated early access
- [x] Social proof and viral features

**API Routes:**
- `POST /api/preorders/campaigns` - Create campaign
- `POST /api/preorders/commit` - Commit points to campaign
- `POST /api/preorders/resolve` - Resolve campaign (fund or refund)
- `GET /api/preorders/manufacturing-csv` - Export fulfillment data

---

### **Phase 4: Advanced Escrow Features** (2 weeks)
**Goal**: Sophisticated campaign mechanics and social features

**Features:**
- [x] Mixed payment options (points + USD)
- [x] Tiered rewards based on commitment level
- [x] Referral bonuses for bringing in commitments
- [x] Social milestones (bonus perks at certain thresholds)
- [x] Campaign extensions and MOQ adjustments
- [x] Retail/wholesale tiers for shops

**Database Changes:**
```sql
-- Referral tracking for campaigns
CREATE TABLE campaign_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES users(id),
  referee_id UUID REFERENCES users(id),
  campaign_id UUID REFERENCES preorder_campaigns(id),
  commitment_id UUID REFERENCES preorder_commitments(id),
  bonus_points INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social milestones
CREATE TABLE campaign_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES preorder_campaigns(id),
  threshold INTEGER NOT NULL, -- Commitment count to trigger
  reward_type TEXT NOT NULL, -- 'bonus_unlock', 'extra_perk', 'discount'
  reward_data JSONB,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### **Phase 5: Manufacturing Integration & Analytics** (2 weeks)
**Goal**: Complete fulfillment pipeline with business intelligence

**Features:**
- [x] Automated manufacturing partner integration
- [x] Shipping label generation and tracking
- [x] Campaign analytics and ROI reporting
- [x] Demand forecasting based on historical data
- [x] A/B testing for campaign variants
- [x] Artist revenue dashboard

**Integration Points:**
```typescript
// Manufacturing partner API integration
interface ManufacturingOrder {
  campaignId: string;
  clubName: string;
  artistContact: string;
  products: {
    variant: string;
    quantity: number;
    specifications: any;
  }[];
  shippingList: {
    orderId: string;
    customerName: string;
    address: Address;
    items: OrderItem[];
  }[];
  specialInstructions?: string;
  rushOrder: boolean;
  estimatedShipDate: string;
}

// Analytics tracking
interface CampaignAnalytics {
  conversionRates: {
    viewToCommit: number;
    memberToCommit: number;
    statusTierBreakdown: Record<string, number>;
  };
  revenueMetrics: {
    totalPointsCommitted: number;
    averageCommitmentSize: number;
    pointsPerDollarEquivalent: number;
  };
  socialMetrics: {
    referralRate: number;
    viralCoefficient: number;
    socialShareCTR: number;
  };
}
```

---

## 🏗️ **Technical Architecture**

### **Core Systems Integration**

```typescript
// Unified point wallet with all capabilities
interface UnifiedPointWallet {
  // Balances
  balance_pts: number;        // Spendable points
  escrowed_pts: number;      // Committed to pre-orders
  
  // Breakdown
  earned_pts: number;        // From engagement (affects status)
  purchased_pts: number;     // Bought with USD
  spent_pts: number;         // Historical spending
  
  // Status (earned points only, minus escrowed earned points)
  status_pts: number;        // For tier calculation
  current_status: Status;    // Cadet → Resident → Headliner → Superfan
  
  // Social
  referral_bonus_pts: number; // From bringing friends
  milestone_bonus_pts: number; // From campaign milestones
}
```

### **Smart Spending Logic**
```typescript
async function spendPoints(
  userId: string,
  clubId: string, 
  pointsToSpend: number,
  options: {
    preserveStatus?: boolean;
    allowEscrowedSpending?: boolean;
    prioritySource?: 'purchased' | 'earned';
  } = {}
) {
  const wallet = await getUnifiedWallet(userId, clubId);
  
  // Calculate available points by source
  const availablePurchased = wallet.purchased_pts;
  const availableEarned = options.preserveStatus 
    ? Math.max(0, wallet.earned_pts - getStatusThreshold(wallet.current_status))
    : wallet.earned_pts;
  
  // Determine spending breakdown
  const spendingPlan = calculateOptimalSpending(
    pointsToSpend, 
    availablePurchased, 
    availableEarned, 
    options.prioritySource
  );
  
  // Execute atomic spending transaction
  return await executeSpending(wallet.id, spendingPlan);
}
```

---

## 📊 **Success Metrics**

### **Business KPIs**
- **Revenue Per User**: Points purchased + escrow commitments
- **Engagement Depth**: Earned points per active user  
- **Campaign Success Rate**: % of campaigns that hit MOQ
- **Viral Coefficient**: Referrals per committed user
- **Status Progression**: Users advancing through tiers

### **Product Metrics**
- **Point Velocity**: How quickly points are earned/spent
- **Escrow Conversion**: % of users who commit to campaigns
- **Status Retention**: Users maintaining higher tiers
- **Cross-Campaign Participation**: Users backing multiple campaigns

### **Artist Success Metrics**
- **Demand Validation Accuracy**: Pre-order vs. actual demand correlation
- **Cash Flow Improvement**: Days from campaign to payment
- **Fan LTV**: Lifetime value per committed fan
- **Product Success Rate**: % of launched campaigns that succeed

---

## 🚀 **Migration Strategy**

### **From Current State**
1. **Points System**: Enhance existing points with purchase/spending breakdown
2. **House Accounts**: Migrate USD balances to purchased points
3. **Unlocks**: Update to use unified point spending
4. **Status System**: Enhance with earned-only calculation

### **Data Migration**
```sql
-- Migrate existing house account balances to purchased points
INSERT INTO point_transactions (wallet_id, type, source, pts, usd_gross_cents)
SELECT 
  pw.id,
  'PURCHASE',
  'purchased',
  ROUND((ha.balance_cents::NUMERIC / c.point_sell_cents::NUMERIC))::INTEGER, -- Convert USD to points with safe division
  ha.balance_cents
FROM house_accounts ha
JOIN users u ON ha.user_id = u.id  
JOIN point_wallets pw ON pw.user_id = u.id AND pw.club_id = ha.club_id
JOIN clubs c ON c.id = ha.club_id;

-- Update wallet balances
UPDATE point_wallets pw SET
  purchased_pts = (
    SELECT COALESCE(SUM(pts), 0) 
    FROM point_transactions pt 
    WHERE pt.wallet_id = pw.id AND pt.source = 'purchased'
  ),
  earned_pts = (
    SELECT COALESCE(SUM(pts), 0)
    FROM point_transactions pt
    WHERE pt.wallet_id = pw.id AND pt.source = 'earned'  
  );
```

---

## 🎯 **Launch Strategy**

### **Beta Testing**
1. **Phase 1**: Internal testing with PHAT Club
2. **Phase 2**: Limited beta with 3-5 artists
3. **Phase 3**: Public launch with campaign showcase

### **Feature Rollout**
1. **Week 1**: Unified points system
2. **Week 2**: Enhanced status mechanics  
3. **Week 3**: First escrow campaign (vinyl)
4. **Week 4**: Social features and referrals
5. **Week 5**: Manufacturing integration
6. **Week 6**: Full analytics dashboard

This unified economy transforms Superfan from a membership platform into a complete **artist business platform** - demand validation, funding, community building, and fulfillment all in one seamless experience.

The key insight: **Points become real economic value** that fans can earn through engagement and spend on exclusive products, creating a closed-loop economy that benefits both artists and fans.
