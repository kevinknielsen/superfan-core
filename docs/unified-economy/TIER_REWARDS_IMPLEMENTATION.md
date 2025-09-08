# Tier Rewards System Implementation

## Overview

This document outlines the complete implementation of the unified tier rewards system that combines status-based perks with quarterly product campaigns into a single, elegant solution. The system allows artists to offer rewards at different tiers while generating sustainable revenue through upgrade packs.

## Core Concept

**Everything is a tier-based reward.** Whether it's presale access (free) or exclusive vinyl (artist fulfills), the user experience is identical: qualify through engagement or pay to upgrade. The system automatically handles pricing and provides access instructions - **no logistics or fulfillment by platform**.

## Key Clarifications

### **Upgrade Packs: Temporary Tier Boosts + Direct Unlock**
- **Upgrade Packs** grant temporary tier boost for current quarter + one free claim
- **Direct unlock** option always available for immediate access (no boost needed)
- **Quarterly claim limit**: One free claim per club per quarter (earned status OR boost)
- **Boost expiry**: Quarter end or after being used, whichever comes first

### **No Platform Fulfillment**
- Platform provides **access and instructions only**
- Artists handle all logistics (shipping, manufacturing, etc.)
- Instructions include URLs to unlisted Shopify items, private download links, etc.
- Same model as current perks system but with upgrade purchase option

### **Tier Calculation: Earned Points + Temporary Boosts**
- **Status tiers** calculated from **earned points only** (tap-ins, engagement) within rolling window
- **Purchased upgrades** don't add points - they grant **temporary tier boosts**
- **Rolling window** (default 60 days) for earned points to create urgency
- **Temporary boosts** valid only for current quarter, enable one free claim per club per quarter

### **Simple Revenue Flow**
- Artists receive upgrade revenue immediately via Stripe
- No money held in escrow for fulfillment
- Platform takes standard payment processing fee only
- No balance management or credit systems

## Business Model

### Revenue Formula
For rewards that artists want to monetize via upgrades, the upgrade price is calculated as:

```
U = ceil((K / m) * S)

Where:
K = artist's cost estimate (COGS, shipping, etc.) - artist sets this
m = net margin after payment processing (~0.96)
S = dynamic safety factor (1.10-1.50, auto-tuned based on demand/scarcity)
```

### Dynamic Safety Factor (S)
Instead of fixed 1.25, auto-tune S based on:
- **High demand/low stock**: S = 1.40-1.50 (premium pricing)
- **Normal demand**: S = 1.25 (standard)
- **Low demand/overstock**: S = 1.10-1.15 (accessible pricing)
- **Historical conversion rates**: Adjust S to optimize revenue vs access

#### Auto-tuning Algorithm
```typescript
function calculateDynamicSafetyFactor(reward: TierReward): number {
  const baseS = 1.25;
  
  // Scarcity multiplier
  let scarcityMultiplier = 1.0;
  if (reward.inventory_limit) {
    const stockRatio = (reward.inventory_limit - reward.inventory_claimed) / reward.inventory_limit;
    if (stockRatio < 0.1) scarcityMultiplier = 1.2; // Very low stock
    else if (stockRatio < 0.3) scarcityMultiplier = 1.1; // Low stock
    else if (stockRatio > 0.8) scarcityMultiplier = 0.9; // High stock
  }
  
  // Demand multiplier (based on recent upgrade purchases)
  const recentUpgrades = getRecentUpgradeCount(reward.id, 7); // Last 7 days
  let demandMultiplier = 1.0;
  if (recentUpgrades > 10) demandMultiplier = 1.15; // High demand
  else if (recentUpgrades < 2) demandMultiplier = 0.95; // Low demand
  
  // Historical conversion multiplier
  const conversionRate = getUpgradeConversionRate(reward.id);
  let conversionMultiplier = 1.0;
  if (conversionRate < 0.05) conversionMultiplier = 0.9; // Low conversion, reduce price
  else if (conversionRate > 0.25) conversionMultiplier = 1.1; // High conversion, can charge more
  
  const dynamicS = baseS * scarcityMultiplier * demandMultiplier * conversionMultiplier;
  return Math.max(1.1, Math.min(1.5, dynamicS)); // Clamp between 1.1 and 1.5
}
```

### Example Calculations
```
Limited Vinyl (100 units, high demand):
- Artist cost estimate: K = $12
- Stripe fees: m = 0.96
- Dynamic safety factor: S = 1.45 (high demand)
- Upgrade price: ceil(12 / 0.96 × 1.45) = ceil(18.125) = $19

Meet & Greet (normal demand):
- Artist cost estimate: K = $25/person
- Dynamic safety factor: S = 1.25 (standard)
- Upgrade price: ceil(25 / 0.96 × 1.25) = ceil(32.55) = $33
```

## Database Schema

### Core Tables

#### `tier_rewards`
```sql
CREATE TABLE tier_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Basic info
  title TEXT NOT NULL,
  description TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('cadet', 'resident', 'headliner', 'superfan')),
  reward_type TEXT NOT NULL CHECK (reward_type IN ('access', 'digital_product', 'physical_product', 'experience')),
  
  -- Cost structure (artist estimates for pricing only)
  artist_cost_estimate_cents INTEGER NOT NULL DEFAULT 0, -- Artist's cost estimate for upgrade pricing
  upgrade_price_cents INTEGER, -- Auto-calculated on save
  safety_factor DECIMAL(3,2) DEFAULT 1.25, -- Dynamic, auto-tuned based on demand
  
  -- Availability settings
  availability_type TEXT DEFAULT 'permanent' CHECK (availability_type IN ('permanent', 'seasonal', 'limited_time')),
  available_start TIMESTAMPTZ,
  available_end TIMESTAMPTZ,
  inventory_limit INTEGER,
  inventory_claimed INTEGER DEFAULT 0,
  
  -- Rolling status configuration
  rolling_window_days INTEGER DEFAULT 60,
  
  -- Metadata for different reward types
  metadata JSONB DEFAULT '{}',
  /*
  For access rewards:
  {
    "instructions": "Check your email for presale code",
    "redemption_url": "https://tickets.example.com"
  }
  
  For digital products:
  {
    "instructions": "Download link will be sent to your email",
    "redemption_url": "https://artist.com/exclusive-download?code=XYZ",
    "details": "320kbps MP3, exclusive remix"
  }
  
  For physical products:
  {
    "instructions": "Use this link to claim your vinyl with free shipping",
    "redemption_url": "https://artist-shop.com/exclusive-vinyl?access_code=ABC123",
    "details": "180g vinyl, gatefold sleeve, limited to 100 units",
    "estimated_shipping": "2-3 weeks"
  }
  
  For experiences:
  {
    "instructions": "Email us at booking@artist.com with this access code",
    "redemption_url": "mailto:booking@artist.com?subject=Meet%20%26%20Greet%20Booking&body=Access%20code:%20XYZ123",
    "details": "30-minute meet & greet, photo opportunity",
    "location": "Studio A, Nashville",
    "requirements": "Must be 18+, valid ID required"
  }
  */
  
  -- Admin settings
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_tier_rewards_dates CHECK (
    availability_type = 'permanent' OR 
    (available_start IS NOT NULL AND available_end IS NOT NULL AND available_start < available_end)
  ),
  CONSTRAINT chk_tier_rewards_inventory CHECK (
    inventory_limit IS NULL OR 
    (inventory_limit > 0 AND inventory_claimed <= inventory_limit)
  )
);

-- Indexes
CREATE INDEX idx_tier_rewards_club_active ON tier_rewards(club_id, is_active);
CREATE INDEX idx_tier_rewards_availability ON tier_rewards(availability_type, available_start, available_end);
CREATE INDEX idx_tier_rewards_tier ON tier_rewards(tier, is_active);

-- Trigger for auto-calculating upgrade price
CREATE OR REPLACE FUNCTION calculate_upgrade_price()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate upgrade price if artist sets a cost estimate
  IF NEW.artist_cost_estimate_cents > 0 THEN
    -- U = ceil((K / m) * S) where m = 0.96 (Stripe fees), S = dynamic safety_factor
    NEW.upgrade_price_cents := CEIL((NEW.artist_cost_estimate_cents / 0.96) * NEW.safety_factor);
  ELSE
    NEW.upgrade_price_cents := NULL;
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_tier_rewards_calculate_price
  BEFORE INSERT OR UPDATE ON tier_rewards
  FOR EACH ROW EXECUTE FUNCTION calculate_upgrade_price();
```

#### `reward_claims`
```sql
CREATE TABLE reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  reward_id UUID NOT NULL REFERENCES tier_rewards(id),
  club_id UUID NOT NULL REFERENCES clubs(id), -- Denormalized for easier queries
  
  -- Claim method
  claim_method TEXT NOT NULL CHECK (claim_method IN ('tier_qualified', 'upgrade_purchased')),
  user_tier_at_claim TEXT NOT NULL,
  user_points_at_claim INTEGER NOT NULL,
  
  -- Payment info (for upgrades)
  upgrade_transaction_id TEXT, -- Stripe payment intent ID
  upgrade_amount_cents INTEGER,
  
  -- Access tracking (no fulfillment - just access granted)
  access_status TEXT DEFAULT 'granted' CHECK (access_status IN ('granted', 'revoked')),
  access_code TEXT, -- Unique code for redemption URLs
  
  -- Timestamps
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  UNIQUE(user_id, reward_id), -- One claim per reward per user
  
  CONSTRAINT chk_reward_claims_upgrade CHECK (
    (claim_method = 'upgrade_purchased' AND upgrade_transaction_id IS NOT NULL AND upgrade_amount_cents > 0) OR
    (claim_method = 'tier_qualified' AND upgrade_transaction_id IS NULL AND upgrade_amount_cents IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_reward_claims_user ON reward_claims(user_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_reward ON reward_claims(reward_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_access ON reward_claims(access_status, claimed_at);
CREATE INDEX idx_reward_claims_club ON reward_claims(club_id, claimed_at DESC);
CREATE INDEX idx_reward_claims_access_code ON reward_claims(access_code) WHERE access_code IS NOT NULL;

-- Trigger to update inventory count
CREATE OR REPLACE FUNCTION update_reward_inventory()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tier_rewards 
    SET inventory_claimed = inventory_claimed + 1
    WHERE id = NEW.reward_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tier_rewards 
    SET inventory_claimed = GREATEST(0, inventory_claimed - 1)
    WHERE id = OLD.reward_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_reward_claims_inventory
  AFTER INSERT OR DELETE ON reward_claims
  FOR EACH ROW EXECUTE FUNCTION update_reward_inventory();
```

#### `temporary_tier_boosts`
```sql
CREATE TABLE temporary_tier_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Boost details
  boosted_tier TEXT NOT NULL CHECK (boosted_tier IN ('resident', 'headliner', 'superfan')),
  quarter_year INTEGER NOT NULL, -- e.g., 2024
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  
  -- Usage tracking
  is_consumed BOOLEAN DEFAULT false,
  consumed_at TIMESTAMPTZ,
  consumed_by_reward_id UUID REFERENCES tier_rewards(id),
  
  -- Purchase context
  upgrade_transaction_id TEXT NOT NULL REFERENCES upgrade_transactions(stripe_payment_intent_id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Constraints
  UNIQUE(user_id, club_id, quarter_year, quarter_number), -- One boost per club per quarter
  
  CONSTRAINT chk_tier_boosts_consumption CHECK (
    (is_consumed = true AND consumed_at IS NOT NULL AND consumed_by_reward_id IS NOT NULL) OR
    (is_consumed = false AND consumed_at IS NULL AND consumed_by_reward_id IS NULL)
  )
);

-- Indexes
CREATE INDEX idx_tier_boosts_user_club ON temporary_tier_boosts(user_id, club_id, quarter_year, quarter_number);
CREATE INDEX idx_tier_boosts_active ON temporary_tier_boosts(user_id, club_id, expires_at) WHERE NOT is_consumed;
CREATE INDEX idx_tier_boosts_quarter ON temporary_tier_boosts(quarter_year, quarter_number, expires_at);

-- Function to get current quarter
CREATE OR REPLACE FUNCTION get_current_quarter()
RETURNS TABLE(year INTEGER, quarter INTEGER, start_date DATE, end_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(YEAR FROM NOW())::INTEGER as year,
    EXTRACT(QUARTER FROM NOW())::INTEGER as quarter,
    DATE_TRUNC('quarter', NOW())::DATE as start_date,
    (DATE_TRUNC('quarter', NOW()) + INTERVAL '3 months - 1 day')::DATE as end_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate quarter end date
CREATE OR REPLACE FUNCTION calculate_quarter_end(year INTEGER, quarter INTEGER)
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN (DATE_TRUNC('year', MAKE_DATE(year, 1, 1)) + 
          INTERVAL '3 months' * quarter - 
          INTERVAL '1 second')::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

#### `quarterly_claim_tracking`
```sql
CREATE TABLE quarterly_claim_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  
  -- Quarter identification
  quarter_year INTEGER NOT NULL,
  quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
  
  -- Claim details
  reward_claim_id UUID NOT NULL REFERENCES reward_claims(id),
  claim_method TEXT NOT NULL CHECK (claim_method IN ('earned_status', 'temporary_boost')),
  tier_at_claim TEXT NOT NULL,
  
  -- Timestamps
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints - one free claim per user per club per quarter
  UNIQUE(user_id, club_id, quarter_year, quarter_number)
);

-- Indexes
CREATE INDEX idx_quarterly_claims_user_club ON quarterly_claim_tracking(user_id, club_id, quarter_year, quarter_number);
CREATE INDEX idx_quarterly_claims_quarter ON quarterly_claim_tracking(quarter_year, quarter_number, claimed_at);
```

#### `upgrade_transactions`
```sql
CREATE TABLE upgrade_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  reward_id UUID NOT NULL REFERENCES tier_rewards(id),
  
  -- Stripe integration
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_session_id TEXT,
  
  -- Transaction details
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Purchase type and context
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('tier_boost', 'direct_unlock')),
  user_tier_at_purchase TEXT NOT NULL,
  user_points_at_purchase INTEGER NOT NULL,
  target_tier TEXT NOT NULL, -- For tier_boost purchases
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT chk_upgrade_transactions_amounts CHECK (amount_cents > 0)
);

-- Indexes
CREATE INDEX idx_upgrade_transactions_user ON upgrade_transactions(user_id, created_at DESC);
CREATE INDEX idx_upgrade_transactions_stripe ON upgrade_transactions(stripe_payment_intent_id);
CREATE INDEX idx_upgrade_transactions_status ON upgrade_transactions(status, created_at);
```

### Views

#### `v_tier_rewards_with_stats`
```sql
CREATE VIEW v_tier_rewards_with_stats AS
SELECT 
  tr.*,
  c.name as club_name,
  
  -- Claim statistics
  COALESCE(claim_stats.total_claims, 0) as total_claims,
  COALESCE(claim_stats.tier_qualified_claims, 0) as tier_qualified_claims,
  COALESCE(claim_stats.upgrade_claims, 0) as upgrade_claims,
  COALESCE(claim_stats.total_upgrade_revenue_cents, 0) as total_upgrade_revenue_cents,
  
  -- Availability status
  CASE 
    WHEN NOT tr.is_active THEN 'inactive'
    WHEN tr.availability_type = 'permanent' THEN 'available'
    WHEN tr.availability_type = 'limited_time' AND NOW() < tr.available_start THEN 'upcoming'
    WHEN tr.availability_type = 'limited_time' AND NOW() > tr.available_end THEN 'expired'
    WHEN tr.availability_type = 'seasonal' AND NOW() BETWEEN tr.available_start AND tr.available_end THEN 'available'
    WHEN tr.availability_type = 'seasonal' THEN 'out_of_season'
    ELSE 'available'
  END as current_status,
  
  -- Inventory status
  CASE 
    WHEN tr.inventory_limit IS NULL THEN 'unlimited'
    WHEN tr.inventory_claimed >= tr.inventory_limit THEN 'sold_out'
    WHEN tr.inventory_claimed >= (tr.inventory_limit * 0.9) THEN 'low_stock'
    ELSE 'available'
  END as inventory_status

FROM tier_rewards tr
LEFT JOIN clubs c ON tr.club_id = c.id
LEFT JOIN (
  SELECT 
    reward_id,
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE claim_method = 'tier_qualified') as tier_qualified_claims,
    COUNT(*) FILTER (WHERE claim_method = 'upgrade_purchased') as upgrade_claims,
    SUM(upgrade_amount_cents) FILTER (WHERE claim_method = 'upgrade_purchased') as total_upgrade_revenue_cents
  FROM reward_claims
  GROUP BY reward_id
) claim_stats ON tr.id = claim_stats.reward_id;
```

## API Endpoints

### Admin APIs

#### `POST /api/admin/tier-rewards`
Create a new tier reward.

```typescript
interface CreateTierRewardRequest {
  club_id: string;
  title: string;
  description: string;
  tier: 'cadet' | 'resident' | 'headliner' | 'superfan';
  reward_type: 'access' | 'digital_product' | 'physical_product' | 'experience';
  artist_cost_estimate_cents: number; // Artist's cost estimate for upgrade pricing (0 = free access only)
  safety_factor?: number; // Default 1.25, will be dynamically adjusted
  availability_type?: 'permanent' | 'seasonal' | 'limited_time';
  available_start?: string; // ISO date
  available_end?: string; // ISO date
  inventory_limit?: number;
  rolling_window_days?: number; // Default 60
  metadata?: {
    instructions: string; // How to redeem (required)
    redemption_url?: string; // Link to unlisted item, download, etc.
    details?: string; // Additional details about the reward
    estimated_shipping?: string; // For physical products
    location?: string; // For experiences
    requirements?: string; // Age limits, etc.
  };
}

// Auto-calculates upgrade_price_cents using the formula
// Returns created reward with calculated pricing
```

#### `GET /api/admin/tier-rewards`
List all tier rewards with filtering and stats.

```typescript
interface TierRewardsQuery {
  club_id?: string;
  tier?: string;
  reward_type?: string;
  availability_type?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

interface TierRewardWithStats {
  // All tier_reward fields plus:
  club_name: string;
  total_claims: number;
  tier_qualified_claims: number;
  upgrade_claims: number;
  total_upgrade_revenue_cents: number;
  current_status: 'inactive' | 'available' | 'upcoming' | 'expired' | 'out_of_season';
  inventory_status: 'unlimited' | 'available' | 'low_stock' | 'sold_out';
}
```

#### `PUT /api/admin/tier-rewards/[id]`
Update an existing tier reward. Recalculates upgrade pricing automatically.

#### `POST /api/admin/tier-rewards/[id]/toggle`
Toggle active status of a reward.

#### `GET /api/admin/tier-rewards/analytics`
Revenue and performance analytics.

```typescript
interface TierRewardsAnalytics {
  summary: {
    total_rewards: number;
    active_rewards: number;
    total_claims: number;
    total_upgrade_revenue_cents: number;
    average_upgrade_conversion_rate: number;
  };
  
  by_tier: Array<{
    tier: string;
    reward_count: number;
    total_claims: number;
    upgrade_revenue_cents: number;
    conversion_rate: number;
  }>;
  
  by_reward_type: Array<{
    reward_type: string;
    reward_count: number;
    total_claims: number;
    upgrade_revenue_cents: number;
    average_fulfillment_cost_cents: number;
    average_margin_percent: number;
  }>;
  
  recent_activity: Array<{
    date: string;
    claims: number;
    upgrade_revenue_cents: number;
    new_rewards_created: number;
  }>;
}
```

### User APIs

#### `GET /api/clubs/[id]/tier-rewards`
Get available rewards for a user in a club.

```typescript
interface UserTierRewardsResponse {
  user_earned_tier: string;
  user_effective_tier: string; // Including temporary boosts
  user_rolling_points: number;
  rolling_window_days: number;
  has_active_boost: boolean;
  quarterly_free_used: boolean;
  current_quarter: { year: number; quarter: number };
  
  available_rewards: Array<{
    id: string;
    title: string;
    description: string;
    reward_type: string;
    tier: string;
    user_can_claim_free: boolean;
    claim_options: Array<'free_claim' | 'tier_boost' | 'direct_unlock'>;
    tier_boost_price_cents?: number; // For tier boost purchases
    direct_unlock_price_cents?: number; // For direct unlock purchases
    inventory_status: string;
    current_status: string;
    metadata: Record<string, any>;
  }>;
  
  claimed_rewards: Array<{
    id: string;
    title: string;
    claim_method: string;
    claimed_at: string;
    access_status: string;
    access_code: string;
  }>;
}
```

#### `POST /api/clubs/[id]/tier-rewards/[reward_id]/claim`
Claim a reward (if tier qualified).

```typescript
interface ClaimRewardRequest {
  // No shipping address needed - artist handles fulfillment
}

interface ClaimRewardResponse {
  success: boolean;
  claim_id: string;
  access_code: string; // Unique code for redemption
  instructions: string; // How to redeem
  redemption_url?: string; // Direct link to unlisted item/download
  message: string;
}
```

#### `POST /api/clubs/[id]/tier-rewards/[reward_id]/upgrade`
Purchase upgrade pack to unlock reward.

```typescript
interface UpgradeRewardRequest {
  purchase_type: 'tier_boost' | 'direct_unlock';
  success_url: string;
  cancel_url: string;
  // No shipping address - artist handles fulfillment via instructions
}

interface UpgradeRewardResponse {
  stripe_session_id: string;
  stripe_session_url: string;
  upgrade_amount_cents: number;
  purchase_type: 'tier_boost' | 'direct_unlock';
  boost_details?: {
    boosted_tier: string;
    expires_at: string;
    quarter: { year: number; quarter: number };
  };
}
```

### Webhook Handlers

#### `POST /api/webhooks/stripe/tier-rewards`
Process Stripe webhook events for upgrade transactions.

```typescript
// Handles:
// - payment_intent.succeeded -> Complete upgrade transaction, create reward claim
// - payment_intent.payment_failed -> Mark transaction as failed
// - checkout.session.completed -> Additional verification
```

## Frontend Components

### Admin Interface

#### `TierRewardManagement.tsx`
Main admin interface replacing the current `UnlockManagement`.

```typescript
interface TierRewardManagementProps {
  onStatsUpdate?: () => void;
}

// Features:
// - Unified reward creation form with conditional fields
// - Real-time upgrade price calculation
// - Inventory and availability management
// - Claim tracking and fulfillment status
// - Revenue analytics dashboard
```

**Form Fields by Reward Type:**

```typescript
// Base fields (all types)
const baseFields = {
  club_id: string;
  title: string;
  description: string;
  tier: 'cadet' | 'resident' | 'headliner' | 'superfan';
  reward_type: 'access' | 'digital_product' | 'physical_product' | 'experience';
  rolling_window_days: number;
  availability_type: 'permanent' | 'seasonal' | 'limited_time';
};

// Conditional fields
const conditionalFields = {
  access: {
    // No additional cost fields
    metadata: {
      instructions: string;
      redemption_url?: string;
    }
  },
  
  digital_product: {
    fulfillment_cost_cents: number; // Usually 0 or small processing fee
    metadata: {
      download_url: string;
      file_size_mb?: number;
      format?: string;
    }
  },
  
  physical_product: {
    artist_cost_estimate_cents: number; // Artist's cost estimate for pricing
    inventory_limit?: number;
    safety_factor: number; // Default 1.25
    metadata: {
      instructions: string;
      redemption_url?: string;
      details: string;
      estimated_shipping?: string;
    }
  },
  
  experience: {
    artist_cost_estimate_cents: number; // Per-person cost estimate
    inventory_limit: number; // Capacity
    safety_factor: number;
    metadata: {
      instructions: string;
      redemption_url?: string;
      details: string;
      location: string;
      requirements?: string;
    }
  }
};
```

#### `RewardAnalyticsDashboard.tsx`
Revenue and performance tracking component.

```typescript
// Key metrics:
// - Total upgrade revenue by time period
// - Conversion rates by tier and reward type
// - Inventory turnover and restocking alerts
// - Profit margins and cost optimization suggestions
// - User tier progression tracking
```

### User Interface

#### `ClubTierRewards.tsx`
Unified rewards display in club details modal.

```typescript
interface ClubTierRewardsProps {
  clubId: string;
  userTier: string;
  userRollingPoints: number;
}

// Features:
// - Tiered reward display (available vs locked)
// - One-click claiming for qualified rewards
// - Upgrade pack purchase flow for locked rewards
// - Claim history and fulfillment tracking
// - Progress indicators for next tier
```

**Component Structure:**
```typescript
<div className="tier-rewards">
  {/* User's current tier and progress */}
  <TierStatusCard 
    currentTier={userTier}
    currentPoints={userRollingPoints}
    nextTierPoints={getNextTierThreshold(userTier)}
    rollingWindowDays={60}
  />
  
  {/* Available rewards for current tier */}
  <RewardSection 
    title="Available to You"
    rewards={availableRewards}
    canClaim={true}
  />
  
  {/* Higher tier rewards with upgrade options */}
  <RewardSection
    title="Unlock with Upgrade Pack"
    rewards={upgradeableRewards}
    canClaim={false}
    showUpgradeOptions={true}
  />
  
  {/* Claimed rewards tracking */}
  <ClaimedRewardsSection
    claims={userClaims}
  />
</div>
```

#### `RewardClaimModal.tsx`
Modal for claiming rewards or purchasing upgrades.

```typescript
interface RewardClaimModalProps {
  reward: TierReward;
  userTier: string;
  claimMethod: 'tier_qualified' | 'upgrade_required';
  onClaim: (claimData: ClaimData) => void;
}

// Handles:
// - Stripe checkout for upgrade purchases
// - Confirmation and next steps display
// - Error handling and retry logic
// - Display of access instructions and redemption URLs

### UX Copy Examples

#### Club Details Modal - Rewards/Perks List

**Before Claiming (Qualified by Earned Tier):**
- Primary Button: "Claim Free"

**Before Claiming (Below Required Tier):**
- Primary Button: "Upgrade for $16"
- Subtext: "Instant access to claim free"

**After Free Already Taken:**
- Only Button: "Unlock for $16" 
- Helper text: "You've already claimed this drop."

**Additional State Messaging:**

**After Upgrade Success (tier boost):**
- Success message: "Boost active for this quarter. Claim your free drop now."
- Button: "Claim Free" (now available)

**Quarter Boundary Messaging:**
- Warning (last week of quarter): "Boost expires Dec 31st - claim soon!"
- New quarter: "New quarter, new opportunities! Earn your way to rewards."
```

## Business Logic Functions

### Tier Qualification

```typescript
// Check if user qualifies for a specific tier (earned points + temporary boosts)
export async function checkTierQualification(
  userId: string,
  clubId: string,
  targetTier: string,
  rollingWindowDays: number = 60
): Promise<{
  qualified: boolean;
  earnedTier: string;
  effectiveTier: string;
  currentPoints: number;
  requiredPoints: number;
  pointsNeeded: number;
  hasActiveBoost: boolean;
  quarterlyFreeUsed: boolean;
}> {
  // Get earned points in rolling window
  const rollingPoints = await getRollingEarnedPoints(userId, clubId, rollingWindowDays);
  
  // Determine earned tier from points only
  const earnedTier = computeTierFromPoints(rollingPoints);
  
  // Check for active temporary boost for current quarter
  const currentQuarter = getCurrentQuarter();
  const activeBoost = await getActiveTemporaryBoost(userId, clubId, currentQuarter.year, currentQuarter.quarter);
  
  // Determine effective tier (max of earned tier and boost tier)
  const effectiveTier = activeBoost && !activeBoost.is_consumed 
    ? getHigherTier(earnedTier, activeBoost.boosted_tier)
    : earnedTier;
  
  // Check if qualifies for target tier
  const requiredPoints = TIER_THRESHOLDS[targetTier];
  const qualified = getTierRank(effectiveTier) >= getTierRank(targetTier);
  
  // Check if quarterly free claim already used
  const quarterlyFreeUsed = await hasUsedQuarterlyFree(userId, clubId, currentQuarter.year, currentQuarter.quarter);
  
  return {
    qualified,
    earnedTier,
    effectiveTier,
    currentPoints: rollingPoints,
    requiredPoints,
    pointsNeeded: Math.max(0, requiredPoints - rollingPoints),
    hasActiveBoost: Boolean(activeBoost && !activeBoost.is_consumed),
    quarterlyFreeUsed
  };
}

// Get earned points in rolling window (excludes purchased points)
async function getRollingEarnedPoints(
  userId: string,
  clubId: string,
  windowDays: number
): Promise<number> {
  const { data } = await supabase
    .from('tap_ins')
    .select('points_earned')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .gte('created_at', new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString());
  
  return data?.reduce((sum, tapIn) => sum + tapIn.points_earned, 0) || 0;
}

// Compute tier from points using current thresholds
function computeTierFromPoints(points: number): string {
  if (points >= 40000) return 'superfan';
  if (points >= 15000) return 'headliner';
  if (points >= 5000) return 'resident';
  return 'cadet';
}

// Helper functions for tier boost system
function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.ceil((now.getMonth() + 1) / 3)
  };
}

function getTierRank(tier: string): number {
  const ranks = { cadet: 0, resident: 1, headliner: 2, superfan: 3 };
  return ranks[tier as keyof typeof ranks] || 0;
}

function getHigherTier(tier1: string, tier2: string): string {
  return getTierRank(tier1) >= getTierRank(tier2) ? tier1 : tier2;
}

async function getActiveTemporaryBoost(
  userId: string, 
  clubId: string, 
  year: number, 
  quarter: number
): Promise<TemporaryBoost | null> {
  const { data } = await supabase
    .from('temporary_tier_boosts')
    .select('*')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .eq('quarter_year', year)
    .eq('quarter_number', quarter)
    .eq('is_consumed', false)
    .gte('expires_at', new Date().toISOString())
    .single();
  
  return data;
}

async function hasUsedQuarterlyFree(
  userId: string,
  clubId: string, 
  year: number,
  quarter: number
): Promise<boolean> {
  const { data } = await supabase
    .from('quarterly_claim_tracking')
    .select('id')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .eq('quarter_year', year)
    .eq('quarter_number', quarter)
    .single();
  
  return Boolean(data);
}

// Free claim eligibility logic
export async function checkFreeClaimEligibility(
  userId: string,
  clubId: string,
  rewardTier: string
): Promise<{
  canClaimFree: boolean;
  reason?: string;
  effectiveTier: string;
  quarterlyFreeUsed: boolean;
}> {
  const currentQuarter = getCurrentQuarter();
  
  // Check if quarterly free already used
  const quarterlyFreeUsed = await hasUsedQuarterlyFree(
    userId, 
    clubId, 
    currentQuarter.year, 
    currentQuarter.quarter
  );
  
  if (quarterlyFreeUsed) {
    return {
      canClaimFree: false,
      reason: 'Quarterly free claim already used',
      effectiveTier: 'unknown',
      quarterlyFreeUsed: true
    };
  }
  
  // Check tier qualification (earned + boost)
  const qualification = await checkTierQualification(userId, clubId, rewardTier);
  
  return {
    canClaimFree: qualification.qualified,
    reason: qualification.qualified ? undefined : 'Insufficient tier',
    effectiveTier: qualification.effectiveTier,
    quarterlyFreeUsed: false
  };
}

// Atomic free claim processing with concurrency protection
export async function processFreeClaim(
  userId: string,
  rewardId: string,
  clubId: string
): Promise<{ success: boolean; claimId?: string; error?: string }> {
  const currentQuarter = getCurrentQuarter();
  
  // Use transaction to prevent race conditions
  const { data, error } = await supabase.rpc('atomic_free_claim', {
    p_user_id: userId,
    p_reward_id: rewardId,
    p_club_id: clubId,
    p_quarter_year: currentQuarter.year,
    p_quarter_number: currentQuarter.quarter
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, claimId: data.claim_id };
}
```

### Reward Availability

```typescript
export function checkRewardAvailability(reward: TierReward): {
  available: boolean;
  reason?: string;
  availableAt?: Date;
} {
  // Check if reward is active
  if (!reward.is_active) {
    return { available: false, reason: 'Reward is inactive' };
  }
  
  // Check inventory
  if (reward.inventory_limit && reward.inventory_claimed >= reward.inventory_limit) {
    return { available: false, reason: 'Sold out' };
  }
  
  // Check availability window
  const now = new Date();
  
  if (reward.availability_type === 'limited_time') {
    if (reward.available_start && now < new Date(reward.available_start)) {
      return { 
        available: false, 
        reason: 'Not yet available',
        availableAt: new Date(reward.available_start)
      };
    }
    
    if (reward.available_end && now > new Date(reward.available_end)) {
      return { available: false, reason: 'Expired' };
    }
  }
  
  if (reward.availability_type === 'seasonal') {
    if (reward.available_start && reward.available_end) {
      const start = new Date(reward.available_start);
      const end = new Date(reward.available_end);
      
      if (now < start || now > end) {
        return { 
          available: false, 
          reason: 'Out of season',
          availableAt: start > now ? start : undefined
        };
      }
    }
  }
  
  return { available: true };
}
```

### Upgrade Pricing

```typescript
export function calculateUpgradePrice(
  fulfillmentCostCents: number,
  safetyFactor: number = 1.25,
  paymentProcessorRate: number = 0.96
): number {
  if (fulfillmentCostCents <= 0) return 0;
  
  // U = ceil((K / m) * S)
  const basePrice = (fulfillmentCostCents / paymentProcessorRate) * safetyFactor;
  return Math.ceil(basePrice);
}

export function calculateProfitMargin(
  upgradePriceCents: number,
  fulfillmentCostCents: number,
  paymentProcessorRate: number = 0.96
): {
  grossRevenueCents: number;
  netRevenueCents: number;
  fulfillmentCostCents: number;
  profitCents: number;
  marginPercent: number;
} {
  const netRevenueCents = Math.floor(upgradePriceCents * paymentProcessorRate);
  const profitCents = netRevenueCents - fulfillmentCostCents;
  const marginPercent = fulfillmentCostCents > 0 ? (profitCents / netRevenueCents) * 100 : 100;
  
  return {
    grossRevenueCents: upgradePriceCents,
    netRevenueCents,
    fulfillmentCostCents,
    profitCents,
    marginPercent
  };
}
```

## Integration Points

### Stripe Integration

#### Upgrade Pack Checkout
```typescript
export async function createUpgradeCheckoutSession({
  userId,
  rewardId,
  clubId,
  userTier,
  userPoints,
  targetTier,
  upgradePriceCents,
  purchaseType,
  successUrl,
  cancelUrl
}: UpgradeCheckoutParams): Promise<Stripe.Checkout.Session> {
  
  const reward = await getTierReward(rewardId);
  const currentQuarter = getCurrentQuarter();
  
  const productName = purchaseType === 'tier_boost' 
    ? `${targetTier} Boost (Q${currentQuarter.quarter} ${currentQuarter.year}) - ${reward.title}`
    : `Direct Unlock - ${reward.title}`;
    
  const productDescription = purchaseType === 'tier_boost'
    ? `Temporary ${targetTier} access for one free claim this quarter`
    : `Unlock ${reward.title}`;
  
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: productName,
          description: productDescription,
          metadata: {
            type: 'tier_upgrade',
            reward_id: rewardId,
            club_id: clubId,
            purchase_type: purchaseType
          }
        },
        unit_amount: upgradePriceCents
      },
      quantity: 1
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: 'tier_upgrade',
      user_id: userId,
      reward_id: rewardId,
      club_id: clubId,
      user_tier: userTier,
      user_points: userPoints.toString(),
      target_tier: targetTier,
      purchase_type: purchaseType,
      quarter_year: currentQuarter.year.toString(),
      quarter_number: currentQuarter.quarter.toString()
    }
  });
  
  // Store pending transaction
  await supabase.from('upgrade_transactions').insert({
    user_id: userId,
    club_id: clubId,
    reward_id: rewardId,
    stripe_payment_intent_id: session.payment_intent as string,
    stripe_session_id: session.id,
    amount_cents: upgradePriceCents,
    purchase_type: purchaseType,
    user_tier_at_purchase: userTier,
    user_points_at_purchase: userPoints,
    target_tier: targetTier,
    status: 'pending'
  });
  
  return session;
}
```

#### Webhook Processing
```typescript
export async function processUpgradeWebhook(event: Stripe.Event) {
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    // Find the upgrade transaction
    const { data: transaction } = await supabase
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .single();
    
    if (!transaction) {
      console.error('Upgrade transaction not found:', paymentIntent.id);
      return;
    }
    
    // Complete the transaction
    await supabase
      .from('upgrade_transactions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', transaction.id);
    
    if (transaction.purchase_type === 'tier_boost') {
      // Create temporary tier boost for current quarter
      const currentQuarter = getCurrentQuarter();
      const quarterEnd = new Date(currentQuarter.year, currentQuarter.quarter * 3, 0, 23, 59, 59);
      
      await supabase.from('temporary_tier_boosts').insert({
        user_id: transaction.user_id,
        club_id: transaction.club_id,
        boosted_tier: transaction.target_tier,
        quarter_year: currentQuarter.year,
        quarter_number: currentQuarter.quarter,
        upgrade_transaction_id: paymentIntent.id,
        expires_at: quarterEnd.toISOString()
      });
      
      console.log(`Tier boost created: User ${transaction.user_id} boosted to ${transaction.target_tier} for Q${currentQuarter.quarter} ${currentQuarter.year}`);
    } else {
      // Direct unlock - create immediate reward claim
      await supabase.from('reward_claims').insert({
        user_id: transaction.user_id,
        reward_id: transaction.reward_id,
        club_id: transaction.club_id,
        claim_method: 'upgrade_purchased',
        user_tier_at_claim: transaction.user_tier_at_purchase,
        user_points_at_claim: transaction.user_points_at_purchase,
        upgrade_transaction_id: paymentIntent.id,
        upgrade_amount_cents: transaction.amount_cents,
        access_code: generateAccessCode()
      });
      
      console.log(`Direct unlock completed: User ${transaction.user_id} unlocked reward ${transaction.reward_id}`);
    }
  }
}
```

### Email Notifications

```typescript
// Send confirmation emails for different reward types
export async function sendRewardClaimConfirmation(claimId: string) {
  const claim = await getRewardClaimWithDetails(claimId);
  
  const emailTemplate = {
    access: 'reward-access-claimed',
    digital_product: 'reward-digital-claimed', 
    physical_product: 'reward-physical-claimed',
    experience: 'reward-experience-claimed'
  }[claim.reward.reward_type];
  
  await sendEmail({
    to: claim.user.email,
    template: emailTemplate,
    data: {
      userName: claim.user.name,
      rewardTitle: claim.reward.title,
      claimMethod: claim.claim_method,
      fulfillmentInstructions: claim.reward.metadata.instructions,
      trackingInfo: claim.tracking_number,
      clubName: claim.club.name
    }
  });
}

// Send upgrade pack purchase confirmation
export async function sendUpgradeConfirmation(transactionId: string) {
  const transaction = await getUpgradeTransactionWithDetails(transactionId);
  
  await sendEmail({
    to: transaction.user.email,
    template: 'upgrade-pack-purchased',
    data: {
      userName: transaction.user.name,
      rewardTitle: transaction.reward.title,
      upgradeCost: formatCurrency(transaction.amount_cents),
      clubName: transaction.club.name,
      accessInstructions: transaction.reward.metadata.instructions,
      redemptionUrl: transaction.reward.metadata.redemption_url
    }
  });
}
```

## Testing Strategy

### Unit Tests

```typescript
// Test upgrade price calculation
describe('calculateUpgradePrice', () => {
  test('calculates correct price for vinyl', () => {
    const price = calculateUpgradePrice(1200, 1.25, 0.96); // $12 cost
    expect(price).toBe(1563); // $15.63 -> $16.00
  });
  
  test('returns 0 for free rewards', () => {
    const price = calculateUpgradePrice(0, 1.25, 0.96);
    expect(price).toBe(0);
  });
});

// Test tier qualification logic
describe('checkTierQualification', () => {
  test('correctly identifies qualified user', async () => {
    // Mock user with 20,000 rolling points
    const result = await checkTierQualification('user1', 'club1', 'headliner');
    expect(result.qualified).toBe(true);
    expect(result.currentTier).toBe('headliner');
  });
  
  test('calculates points needed for upgrade', async () => {
    // Mock user with 8,000 rolling points
    const result = await checkTierQualification('user1', 'club1', 'headliner');
    expect(result.qualified).toBe(false);
    expect(result.pointsNeeded).toBe(7000); // 15,000 - 8,000
  });
});
```

### Integration Tests

```typescript
// Test complete reward claim flow
describe('Reward Claim Flow', () => {
  test('qualified user can claim physical reward', async () => {
    // Setup: Create reward, user with sufficient points
    const reward = await createTestReward({
      reward_type: 'physical_product',
      tier: 'headliner',
      fulfillment_cost_cents: 1200
    });
    
    const user = await createTestUser({ rollingPoints: 20000 });
    
    // Test claim
    const response = await request(app)
      .post(`/api/clubs/${clubId}/tier-rewards/${reward.id}/claim`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ shipping_address: testAddress });
    
    expect(response.status).toBe(200);
    expect(response.body.claim_id).toBeDefined();
    
    // Verify database state
    const claim = await supabase
      .from('reward_claims')
      .select('*')
      .eq('id', response.body.claim_id)
      .single();
    
    expect(claim.data.claim_method).toBe('tier_qualified');
    expect(claim.data.access_status).toBe('granted');
  });
  
  test('unqualified user can purchase upgrade', async () => {
    // Setup: Create reward, user with insufficient points
    const reward = await createTestReward({
      reward_type: 'physical_product',
      tier: 'headliner',
      fulfillment_cost_cents: 1200,
      upgrade_price_cents: 1600
    });
    
    const user = await createTestUser({ rollingPoints: 8000 }); // Not qualified
    
    // Test upgrade purchase
    const response = await request(app)
      .post(`/api/clubs/${clubId}/tier-rewards/${reward.id}/upgrade`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        success_url: 'https://app.com/success',
        cancel_url: 'https://app.com/cancel'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.stripe_session_url).toBeDefined();
    expect(response.body.upgrade_amount_cents).toBe(1600);
  });
});
```

### End-to-End Tests

```typescript
// Test complete user journey
describe('Tier Rewards E2E', () => {
  test('user progresses from cadet to claiming headliner reward', async () => {
    // 1. Create user and club
    const user = await createTestUser();
    const club = await createTestClub();
    
    // 2. User joins club (cadet status)
    await joinClub(user.id, club.id);
    
    // 3. User earns points through tap-ins
    await simulateTapIns(user.id, club.id, 20); // 20,000 points
    
    // 4. Admin creates headliner reward
    const reward = await createRewardAsAdmin({
      club_id: club.id,
      tier: 'headliner',
      reward_type: 'physical_product',
      title: 'Limited Edition Vinyl',
      fulfillment_cost_cents: 1200
    });
    
    // 5. User views available rewards
    const rewardsResponse = await getUserTierRewards(user.id, club.id);
    expect(rewardsResponse.available_rewards).toHaveLength(1);
    expect(rewardsResponse.available_rewards[0].user_can_claim).toBe(true);
    
    // 6. User claims reward
    const claimResponse = await claimReward(user.id, reward.id, {
      shipping_address: testAddress
    });
    
    expect(claimResponse.success).toBe(true);
    
    // 7. User accesses reward via provided instructions
    
    // 8. Verify final state
    const finalClaim = await getRewardClaim(claimResponse.claim_id);
    expect(finalClaim.access_status).toBe('granted');
    expect(finalClaim.access_code).toBeDefined();
  });
});
```

## Migration Plan

### Phase 1: Database Setup (Week 1)
1. Create new tables: `tier_rewards`, `reward_claims`, `upgrade_transactions`
2. Create database functions and triggers
3. Create views for analytics
4. Run data migration from existing `unlocks` table

### Phase 2: Backend APIs (Week 2)
1. Implement admin APIs for tier reward management
2. Build user APIs for reward browsing and claiming
3. Integrate Stripe for upgrade purchases
4. Set up webhook handlers
5. Add email notification system

### Phase 3: Admin Interface (Week 2)
1. Replace `UnlockManagement` with `TierRewardManagement`
2. Build reward creation/editing forms
3. Add analytics dashboard
4. Implement fulfillment tracking interface

### Phase 4: User Interface (Week 1)
1. Replace unlock display with tier rewards in club modal
2. Build reward claiming flow
3. Add upgrade purchase integration
4. Implement claim tracking

### Phase 5: Testing & Launch (Week 1)
1. Run comprehensive test suite
2. Conduct user acceptance testing
3. Gradual rollout to select clubs
4. Monitor performance and fix issues
5. Full production launch

## Monitoring & Analytics

### Key Metrics to Track

#### Business Metrics
- **Upgrade Conversion Rate**: % of users who purchase upgrades when not qualified
- **Revenue per Reward**: Average upgrade revenue generated per reward
- **Profit Margins**: Actual vs projected margins on physical rewards
- **Inventory Turnover**: How quickly limited rewards sell out
- **Tier Progression**: Rate at which users advance through tiers

#### Technical Metrics  
- **API Response Times**: Reward loading and claim processing speed
- **Webhook Success Rate**: Stripe event processing reliability
- **Database Performance**: Query optimization for reward availability checks
- **Error Rates**: Failed claims, payment issues, fulfillment problems

#### User Experience Metrics
- **Claim Success Rate**: % of attempted claims that complete successfully
- **User Satisfaction**: Feedback on reward quality and access experience
- **Engagement Impact**: Effect of tier rewards on overall platform engagement
- **Support Ticket Volume**: Issues related to rewards and access redemption

### Alerting System

```typescript
// Set up alerts for critical business events
const alerts = {
  // High-value upgrade purchases
  highValueUpgrade: {
    threshold: 5000, // $50+
    notification: 'slack-admin-channel'
  },
  
  // Inventory running low
  lowInventory: {
    threshold: 0.1, // 10% remaining
    notification: 'email-admin-team'
  },
  
  // Failed webhook processing
  webhookFailure: {
    threshold: 1, // Any failure
    notification: 'pager-duty'
  },
  
  // Unusual upgrade conversion rates
  conversionAnomaly: {
    threshold: 0.5, // 50% deviation from baseline
    notification: 'slack-analytics-channel'
  }
};
```

## Security Considerations

### Data Protection
- **PII Encryption**: Encrypt shipping addresses and user data
- **Payment Security**: Never store payment details, rely on Stripe
- **Access Controls**: Role-based permissions for admin functions
- **Audit Logging**: Track all reward claims and admin actions

### Fraud Prevention
- **Rate Limiting**: Prevent rapid-fire claim attempts
- **Duplicate Detection**: Prevent double-claiming through database constraints
- **Webhook Verification**: Validate all Stripe webhook signatures
- **Inventory Protection**: Atomic operations for inventory management

### Business Logic Security
- **Tier Verification**: Always re-verify user tier at claim time
- **Price Tampering**: Server-side price calculation only
- **Availability Checks**: Real-time inventory and date validation
- **Idempotency**: Prevent duplicate transactions and claims

## Implementation Progress

### ✅ Completed Tasks
- [x] **Requirements Analysis** - Clarified business model, no platform fulfillment
- [x] **Architecture Design** - Unified tier rewards system design  
- [x] **Database Schema** - Complete schema with dynamic pricing and access tracking
- [x] **API Specification** - Full REST API documentation
- [x] **Business Logic** - Pricing formulas, tier qualification, dynamic safety factor
- [x] **Integration Planning** - Stripe, email notifications, webhook handling

### 🚧 In Progress Tasks
- [ ] **Phase 1: Database Setup** (Week 1)
  - [ ] Create new tables: `tier_rewards`, `reward_claims`, `upgrade_transactions`
  - [ ] Create database functions and triggers for dynamic pricing
  - [ ] Create views for analytics
  - [ ] Run data migration from existing `unlocks` table

### 📋 Upcoming Tasks
- [ ] **Phase 2: Backend APIs** (Week 2)
- [ ] **Phase 3: Admin Interface** (Week 2) 
- [ ] **Phase 4: User Interface** (Week 1)
- [ ] **Phase 5: Testing & Launch** (Week 1)

### 🔄 Recent Updates
- **2024-01-XX**: **MAJOR UPDATE: Temporary Tier Boost System** - Quarterly free claim limits with boost mechanics
- **2024-01-XX**: **REMOVED ALL HOUSE ACCOUNT FUNCTIONALITY** - Pure pay-to-unlock model
- **2024-01-XX**: Added temporary tier boost tables and quarterly claim tracking
- **2024-01-XX**: Updated tier qualification logic to include earned points + temporary boosts
- **2024-01-XX**: Implemented two purchase types: tier_boost (quarterly free) vs direct_unlock (immediate)
- **2024-01-XX**: Added UX copy examples for boost states and quarterly messaging
- **2024-01-XX**: Enhanced webhook processing to handle boost creation vs direct unlocks
- **2024-01-XX**: Added atomic free claim processing with concurrency protection

---

This implementation provides a complete, production-ready tier rewards system that unifies status perks with revenue-generating upgrade packs while maintaining a clean, intuitive user experience and robust admin controls. **Key insight**: Platform provides access and instructions only - artists handle all fulfillment via their own systems (Shopify, email, etc.).
