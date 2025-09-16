# Campaigns Implementation Plan - MVP Focus
**Earned Tiers = Instant Discounts, Maximum Component Reuse**

## Executive Summary

This revised implementation plan focuses on **reusing existing UI components and infrastructure** while evolving the underlying data model and APIs to support the campaigns-as-tiers concept with **instant discounts for earned tiers**.

### Core Business Model
- **Earned tier holders get instant discounts** (e.g., $25 → $20 for Residents)
- **Campaign progress shows full price value** → real demand validation
- **Artists receive full payout** → no subsidized inventory risk
- **Superfan covers discount difference** from protocol spread

### Core Strategy
- **Keep existing UI components** (`UnlockRedemption`, `TierRewardManagement`, etc.)
- **Evolve existing database tables** instead of creating new ones
- **Extend existing APIs** rather than building from scratch
- **Keep "tier" terminology** throughout - campaigns contain tiers, not bundles

## 🎯 MVP Simplifications

For the **minimum viable product**, we can simplify significantly:

### **MVP Scope (2-3 Weeks)**
1. **Add campaign fields** to existing `tier_rewards` table
2. **Fixed discount rules** per tier (skip complex rules table for MVP)
3. **Enhanced existing components** with discount display
4. **Simple campaign grouping** in existing UI
5. **Basic progress tracking** without complex analytics

### **What to Skip for MVP**
- ❌ **Complex discount rules table** → Use fixed amounts per tier
- ❌ **Advanced analytics dashboard** → Basic metrics only  
- ❌ **Multiple campaign creation** → Start with single-tier campaigns
- ❌ **Subsidy budget tracking** → Monitor manually initially
- ❌ **Email notifications** → Add post-MVP
- ❌ **Inventory management** → Keep existing simple approach

### **MVP Database Changes (Minimal)**
```sql
-- Just add to existing tier_rewards table
ALTER TABLE tier_rewards 
ADD COLUMN campaign_id UUID,
ADD COLUMN campaign_title TEXT,
ADD COLUMN campaign_funding_goal_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_current_funding_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_deadline TIMESTAMPTZ,
ADD COLUMN is_campaign_tier BOOLEAN DEFAULT FALSE,
-- Fixed discount amounts (skip rules table for MVP)
ADD COLUMN resident_discount_cents INTEGER DEFAULT 500, -- $5
ADD COLUMN headliner_discount_cents INTEGER DEFAULT 1000, -- $10  
ADD COLUMN superfan_discount_cents INTEGER DEFAULT 2000; -- $20
```

### **MVP UI Changes (Minimal)**
```typescript
// Just enhance existing UnlockRedemption component
<UnlockCard>
  {/* Existing structure, enhanced pricing */}
  {user_earned_tier === tier && discount > 0 ? (
    <div>
      <span className="line-through">${original_price}</span>
      <span className="text-green-600 font-bold">${discounted_price}</span>
      <div className="text-sm text-green-600">Save ${discount} with your {tier} status</div>
    </div>
  ) : (
    <span className="font-bold">${original_price}</span>
  )}
  
  <Button>Join Tier - ${final_price}</Button>
</UnlockCard>
```

---

## Phase 1: Database Evolution (Week 1)

### 1.1 Rename and Extend Existing Tables

#### `tier_rewards` → Enhanced for Campaigns with Instant Discounts
```sql
-- Add campaign fields to existing tier_rewards table
ALTER TABLE tier_rewards 
ADD COLUMN campaign_id UUID,
ADD COLUMN campaign_title TEXT,
ADD COLUMN campaign_description TEXT,
ADD COLUMN campaign_funding_goal_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_current_funding_cents INTEGER DEFAULT 0,
ADD COLUMN campaign_deadline TIMESTAMPTZ,
ADD COLUMN campaign_status TEXT DEFAULT 'single_reward' CHECK (
  campaign_status IN ('single_reward', 'campaign_draft', 'campaign_active', 'campaign_funded', 'campaign_failed')
),
ADD COLUMN tier_items JSONB DEFAULT '[]', -- For future tier item expansion
ADD COLUMN is_campaign_tier BOOLEAN DEFAULT FALSE,
ADD COLUMN campaign_metadata JSONB DEFAULT '{}',

-- Instant discount system for earned tiers
ADD COLUMN earned_tier_discount_cents INTEGER DEFAULT 0, -- Fixed discount amount (e.g., $5 = 500)
ADD COLUMN earned_tier_discount_percentage DECIMAL(5,2) DEFAULT 0, -- Or percentage-based discount
ADD COLUMN discount_source TEXT DEFAULT 'protocol_spread' CHECK (
  discount_source IN ('protocol_spread', 'artist_funded', 'platform_funded')
);

-- Create campaign grouping view
CREATE VIEW v_campaigns AS
SELECT 
  campaign_id as id,
  campaign_title as title,
  campaign_description as description,
  club_id,
  campaign_funding_goal_cents as funding_goal_cents,
  campaign_current_funding_cents as current_funding_cents,
  campaign_deadline as funding_deadline,
  campaign_status as status,
  MIN(created_at) as created_at,
  MAX(updated_at) as updated_at,
  
  -- Tier aggregation
  JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'tier', tier,
      'title', title,
      'description', description,
      'reward_type', reward_type,
      'upgrade_price_cents', upgrade_price_cents,
      'tier_items', COALESCE(tier_items, '[]'::jsonb),
      'metadata', metadata
    ) ORDER BY 
      CASE tier 
        WHEN 'resident' THEN 1 
        WHEN 'headliner' THEN 2 
        WHEN 'superfan' THEN 3 
        ELSE 4 
      END
  ) as tiers,
  
  -- Progress calculations
  CASE 
    WHEN campaign_funding_goal_cents > 0 THEN 
      (campaign_current_funding_cents::DECIMAL / campaign_funding_goal_cents * 100)
    ELSE 0 
  END as funding_percentage

FROM tier_rewards
WHERE campaign_id IS NOT NULL
GROUP BY campaign_id, campaign_title, campaign_description, club_id, 
         campaign_funding_goal_cents, campaign_current_funding_cents, 
         campaign_deadline, campaign_status;
```

#### `reward_claims` → Enhanced for Campaign Participation with Cashback
```sql
-- Add campaign participation fields
ALTER TABLE reward_claims
ADD COLUMN participation_method TEXT DEFAULT 'tier_qualified' CHECK (
  participation_method IN ('tier_qualified', 'earned_tier', 'tier_purchase')
),
ADD COLUMN campaign_id UUID,
ADD COLUMN tier_claimed BOOLEAN DEFAULT TRUE, -- Existing claims are already claimed
ADD COLUMN tier_claimed_at TIMESTAMPTZ DEFAULT claimed_at,
ADD COLUMN fulfillment_status TEXT DEFAULT 'delivered' CHECK (
  fulfillment_status IN ('pending', 'processing', 'shipped', 'delivered', 'failed')
),

-- Instant discount tracking
ADD COLUMN discount_applied BOOLEAN DEFAULT FALSE,
ADD COLUMN discount_amount_cents INTEGER DEFAULT 0,
ADD COLUMN original_price_cents INTEGER DEFAULT 0, -- Full tier price before discount
ADD COLUMN paid_price_cents INTEGER DEFAULT 0, -- Actual amount paid (after discount)
ADD COLUMN subsidy_amount_cents INTEGER DEFAULT 0; -- Amount Superfan covers (discount)

-- Update existing claims to use new terminology
UPDATE reward_claims 
SET participation_method = CASE 
  WHEN claim_method = 'tier_qualified' THEN 'earned_tier'
  WHEN claim_method = 'upgrade_purchased' THEN 'tier_purchase'
  ELSE 'earned_tier'
END;
```

#### `temporary_tier_boosts` → Campaign Participation Tracking
```sql
-- Rename to be more generic
ALTER TABLE temporary_tier_boosts RENAME TO user_campaign_benefits;

-- Add campaign tracking
ALTER TABLE user_campaign_benefits
ADD COLUMN campaign_id UUID,
ADD COLUMN benefit_type TEXT DEFAULT 'tier_boost' CHECK (
  benefit_type IN ('tier_boost', 'early_access', 'cashback_eligible')
);
```

### 1.2 Instant Discount Configuration System

#### Tier Discount Rules Table
```sql
-- Define instant discount rules per tier per campaign/club
CREATE TABLE tier_discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope (campaign-specific or club-wide default)
  campaign_id UUID REFERENCES tier_rewards(campaign_id),
  club_id UUID NOT NULL REFERENCES clubs(id),
  tier TEXT NOT NULL CHECK (tier IN ('resident', 'headliner', 'superfan')),
  
  -- Discount configuration
  discount_type TEXT DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
  discount_amount_cents INTEGER DEFAULT 0, -- Fixed discount (e.g., $5 = 500)
  discount_percentage DECIMAL(5,2) DEFAULT 0, -- Percentage discount (e.g., 10.5%)
  
  -- Constraints and limits
  min_tier_price_cents INTEGER DEFAULT 0, -- Only apply to tiers above this price
  max_discount_cents INTEGER, -- Cap the discount amount
  
  -- Metadata
  description TEXT, -- e.g., "Resident loyalty discount"
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one rule per tier per scope
  UNIQUE(campaign_id, tier) WHERE campaign_id IS NOT NULL,
  UNIQUE(club_id, tier) WHERE campaign_id IS NULL
);

-- Default discount rules for clubs
INSERT INTO tier_discount_rules (club_id, tier, discount_type, discount_amount_cents, description)
SELECT 
  id as club_id,
  'resident' as tier,
  'fixed' as discount_type,
  500 as discount_amount_cents, -- $5 discount
  'Resident loyalty discount' as description
FROM clubs WHERE is_active = TRUE
UNION ALL
SELECT 
  id as club_id,
  'headliner' as tier,
  'fixed' as discount_type,
  1000 as discount_amount_cents, -- $10 discount
  'Headliner loyalty discount' as description
FROM clubs WHERE is_active = TRUE
UNION ALL
SELECT 
  id as club_id,
  'superfan' as tier,
  'fixed' as discount_type,
  2000 as discount_amount_cents, -- $20 discount
  'Superfan loyalty discount' as description
FROM clubs WHERE is_active = TRUE;

-- Function to calculate instant discount for a user
CREATE OR REPLACE FUNCTION calculate_tier_discount(
  p_user_tier TEXT,
  p_tier_price_cents INTEGER,
  p_campaign_id UUID DEFAULT NULL,
  p_club_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_rule tier_discount_rules;
  v_calculated_discount INTEGER := 0;
BEGIN
  -- Get applicable discount rule (campaign-specific first, then club default)
  SELECT * INTO v_rule
  FROM tier_discount_rules
  WHERE tier = p_user_tier
    AND is_active = TRUE
    AND (
      (p_campaign_id IS NOT NULL AND campaign_id = p_campaign_id) OR
      (campaign_id IS NULL AND club_id = p_club_id)
    )
  ORDER BY 
    CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 2 END -- Campaign-specific rules first
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN 0; -- No discount rule found
  END IF;
  
  -- Check minimum tier price
  IF p_tier_price_cents < v_rule.min_tier_price_cents THEN
    RETURN 0;
  END IF;
  
  -- Calculate discount
  IF v_rule.discount_type = 'fixed' THEN
    v_calculated_discount := v_rule.discount_amount_cents;
  ELSIF v_rule.discount_type = 'percentage' THEN
    v_calculated_discount := ROUND(p_tier_price_cents * v_rule.discount_percentage / 100);
  END IF;
  
  -- Apply maximum cap if set
  IF v_rule.max_discount_cents IS NOT NULL THEN
    v_calculated_discount := LEAST(v_calculated_discount, v_rule.max_discount_cents);
  END IF;
  
  RETURN v_calculated_discount;
END;
$$ LANGUAGE plpgsql;
```

### 1.3 Migration Functions

#### Convert Existing Rewards to Campaign Format
```sql
-- Function to group existing tier rewards into campaigns
CREATE OR REPLACE FUNCTION create_campaigns_from_tier_rewards()
RETURNS INTEGER AS $$
DECLARE
  reward_group RECORD;
  new_campaign_id UUID;
  campaign_count INTEGER := 0;
BEGIN
  -- Group tier rewards by club and time period to create logical campaigns
  FOR reward_group IN 
    SELECT 
      club_id,
      DATE_TRUNC('month', created_at) as month_created,
      STRING_AGG(DISTINCT title, ' + ') as suggested_title,
      COUNT(*) as reward_count,
      SUM(COALESCE(upgrade_price_cents, 0)) as total_value,
      MIN(created_at) as earliest_created,
      MAX(updated_at) as latest_updated
    FROM tier_rewards 
    WHERE is_active = true 
      AND campaign_id IS NULL
      AND created_at >= NOW() - INTERVAL '6 months' -- Only recent rewards
    GROUP BY club_id, DATE_TRUNC('month', created_at)
    HAVING COUNT(*) >= 2 -- Only group if multiple rewards
  LOOP
    -- Generate campaign ID
    new_campaign_id := gen_random_uuid();
    
    -- Update tier rewards to belong to this campaign
    UPDATE tier_rewards 
    SET 
      campaign_id = new_campaign_id,
      campaign_title = COALESCE(reward_group.suggested_title, 'Legacy Campaign'),
      campaign_description = 'Migrated from individual tier rewards',
      campaign_funding_goal_cents = reward_group.total_value,
      campaign_current_funding_cents = reward_group.total_value, -- Assume already successful
      campaign_status = 'campaign_funded',
      campaign_deadline = reward_group.latest_updated,
      is_campaign_bundle = TRUE,
      updated_at = NOW()
    WHERE club_id = reward_group.club_id
      AND DATE_TRUNC('month', created_at) = reward_group.month_created
      AND campaign_id IS NULL;
      
    -- Update associated claims
    UPDATE reward_claims 
    SET campaign_id = new_campaign_id
    WHERE reward_id IN (
      SELECT id FROM tier_rewards WHERE campaign_id = new_campaign_id
    );
    
    campaign_count := campaign_count + 1;
  END LOOP;
  
  RETURN campaign_count;
END;
$$ LANGUAGE plpgsql;
```

---

## Phase 2: API Evolution (Week 1-2)

### 2.1 Extend Existing Endpoints

#### Keep Current Tier Rewards API Structure
```typescript
// /api/admin/tier-rewards - Enhanced to handle campaigns
interface EnhancedTierReward {
  // All existing fields
  id: string;
  club_id: string;
  title: string;
  tier: string;
  reward_type: string;
  upgrade_price_cents: number;
  metadata: Record<string, any>;
  
  // New campaign fields (optional for backward compatibility)
  campaign_id?: string;
  campaign_title?: string;
  campaign_status?: string;
  campaign_funding_goal_cents?: number;
  campaign_current_funding_cents?: number;
  campaign_deadline?: string;
  is_campaign_bundle?: boolean;
  bundle_items?: BundleItem[];
  
  // Computed fields
  is_part_of_campaign?: boolean;
  campaign_progress?: {
    funding_percentage: number;
    total_participants: number;
    days_remaining: number;
  };
}

// Existing API works with enhanced data
GET /api/admin/tier-rewards 
// Returns both individual rewards and campaign bundles

POST /api/admin/tier-rewards
// Can create individual rewards OR campaign bundles
{
  // Existing fields work as before
  title: "Limited Vinyl",
  tier: "headliner",
  
  // New optional campaign fields
  campaign_title?: "Spring 2024 Collection",
  campaign_funding_goal_cents?: 100000,
  campaign_deadline?: "2024-04-30T00:00:00Z",
  is_campaign_tier?: true
}
```

#### Enhance Existing Club Rewards API with Instant Discounts
```typescript
// /api/clubs/[id]/tier-rewards - Enhanced with campaign context and cashback
interface EnhancedClubRewards {
  // Existing structure preserved
  user_earned_tier: string;
  user_effective_tier: string;
  user_rolling_points: number;
  has_active_boost: boolean;
  
  // Enhanced rewards with campaign context and cashback
  available_rewards: Array<{
    // All existing fields
    id: string;
    title: string;
    tier: string;
    upgrade_price_cents: number; // Always full price
    
    // Instant discount for earned tiers
    user_discount_eligible: boolean;
    user_discount_amount_cents: number; // e.g., 500 ($5 off)
    user_discounted_price_cents: number; // price - discount
    discount_description: string; // e.g., "Your Resident status saves you $5"
    
    // New campaign context (optional)
    campaign_id?: string;
    campaign_title?: string;
    campaign_status?: string;
    campaign_progress?: {
      funding_percentage: number;
      participants_count: number;
      days_remaining: number;
    };
    
    // Simplified claim options (everyone pays, some get discounts)
    claim_options: Array<{
      method: 'campaign_support'; // Everyone pays (full or discounted)
      original_price_cents: number; // Full tier price
      final_price_cents: number; // After discount (if applicable)
      discount_cents?: number; // Only for earned tiers
      description: string; // e.g., "Pay $20 (save $5 with your status)"
    }>;
  }>;
}

// Example API response
{
  "user_earned_tier": "resident",
  "available_rewards": [
    {
      "id": "reward_123",
      "title": "Resident Tier",
      "tier": "resident",
      "upgrade_price_cents": 2500, // $25 full price
      "user_discount_eligible": true,
      "user_discount_amount_cents": 500, // $5 off
      "user_discounted_price_cents": 2000, // $20 after discount
      "discount_description": "Your Resident status saves you $5 (20% loyalty discount)",
      "claim_options": [
        {
          "method": "campaign_support",
          "original_price_cents": 2500,
          "final_price_cents": 2000,
          "discount_cents": 500,
          "description": "Pay $20 (save $5 with your status) → Campaign progress $25"
        }
      ]
    }
  ]
}
```

### 2.2 New Campaign-Specific Endpoints

#### Campaign Management (Minimal Addition)
```typescript
// /api/campaigns/[id] - Light wrapper around tier rewards
GET /api/campaigns/[id] 
// Returns data from v_campaigns view

POST /api/campaigns/[id]/participate
// Creates reward_claims with enhanced participation_method and cashback tracking

// /api/campaigns/[id]/progress - Real-time progress
GET /api/campaigns/[id]/progress
// Aggregates data from tier_rewards and reward_claims
```

### 2.3 Instant Discount Processing API

#### Discount Workflow
```typescript
// Enhanced participation endpoint
POST /api/campaigns/[id]/participate
{
  tier: "resident",
  user_tier: "resident" // User's earned tier for cashback calculation
}

// Response includes discount details
{
  success: true,
  participation_id: "uuid",
  original_price_cents: 2500, // Full tier price
  discount_applied: true,
  discount_amount_cents: 500, // $5 discount
  final_price_cents: 2000, // $20 after discount
  campaign_credit_cents: 2500, // Campaign progress gets full $25
  discount_description: "Your Resident status saves you $5",
  stripe_session_url: "https://checkout.stripe.com/...",
  
  // Campaign progress impact
  campaign_impact: {
    user_pays: 2000, // $20
    campaign_gets: 2500, // $25 (full value)
    superfan_covers: 500 // $5 subsidy
  }
}

// Campaign progress tracking (shows real vs credited amounts)
GET /api/campaigns/[id]/progress
{
  funding_goal_cents: 100000, // $1000 goal
  campaign_progress_cents: 75000, // $750 credited to campaign (full tier values)
  actual_payments_cents: 65000, // $650 actually paid by users
  platform_subsidy_cents: 10000, // $100 covered by Superfan (discounts)
  funding_percentage: 75.0, // Based on campaign_progress_cents
  participants: [
    {
      user_id: "uuid",
      tier: "resident", 
      paid_cents: 2000, // User paid $20
      campaign_credit_cents: 2500, // Campaign credited $25
      discount_applied_cents: 500 // Superfan covered $5
    }
  ]
}

// Platform subsidy tracking
GET /api/admin/campaign-subsidies
{
  total_subsidies_cents: 50000, // $500 total subsidies across all campaigns
  monthly_subsidy_budget_cents: 100000, // $1000 monthly budget
  current_month_used_cents: 25000, // $250 used this month
  subsidy_rate_percentage: 8.5, // Average discount rate applied
  by_tier: [
    { tier: "resident", total_subsidies_cents: 15000, avg_discount_cents: 500 },
    { tier: "headliner", total_subsidies_cents: 20000, avg_discount_cents: 1000 },
    { tier: "superfan", total_subsidies_cents: 15000, avg_discount_cents: 2000 }
  ]
}
```

#### Stripe Integration for Instant Discounts
```typescript
// Create Stripe checkout with discounted price, track subsidy
async function createDiscountedCheckout(
  userId: string,
  tierId: string, 
  userTier: string,
  originalPriceCents: number
) {
  // Calculate instant discount
  const discountCents = await calculateTierDiscount(userTier, originalPriceCents, tierId);
  const finalPriceCents = originalPriceCents - discountCents;
  
  // Create Stripe session for discounted amount
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${tierTitle} - ${userTier.toUpperCase()} DISCOUNT`,
          description: discountCents > 0 ? 
            `Original: $${(originalPriceCents/100).toFixed(0)}, You save: $${(discountCents/100).toFixed(0)}` :
            `${tierTitle} participation`,
        },
        unit_amount: finalPriceCents // User pays discounted amount
      },
      quantity: 1
    }],
    metadata: {
      type: 'campaign_tier_purchase',
      user_id: userId,
      tier_id: tierId,
      user_tier: userTier,
      original_price_cents: originalPriceCents.toString(),
      discount_applied_cents: discountCents.toString(),
      final_price_cents: finalPriceCents.toString(),
      campaign_credit_cents: originalPriceCents.toString() // Campaign gets full value
    }
  });
  
  // Store transaction with subsidy tracking
  await supabase.from('reward_claims').insert({
    user_id: userId,
    reward_id: tierId,
    participation_method: 'tier_purchase',
    original_price_cents: originalPriceCents,
    paid_price_cents: finalPriceCents,
    discount_applied: discountCents > 0,
    discount_amount_cents: discountCents,
    subsidy_amount_cents: discountCents, // Platform covers this amount
    stripe_payment_intent_id: session.payment_intent,
    user_tier_at_claim: userTier
  });
  
  return session;
}

// Campaign progress calculation (uses full tier values, not actual payments)
async function updateCampaignProgress(campaignId: string, tierPurchase: TierPurchase) {
  // Campaign progress increases by FULL tier value
  await supabase
    .from('tier_rewards')
    .update({
      campaign_current_funding_cents: supabase.sql`
        campaign_current_funding_cents + ${tierPurchase.original_price_cents}
      `
    })
    .eq('campaign_id', campaignId);
    
  // Track platform subsidy separately
  await supabase
    .from('platform_subsidies')
    .insert({
      campaign_id: campaignId,
      user_id: tierPurchase.user_id,
      subsidy_amount_cents: tierPurchase.discount_amount_cents,
      subsidy_type: 'tier_discount',
      tier: tierPurchase.user_tier
    });
}
```

---

## Phase 3: Component Enhancement (Week 2)

### 3.1 Enhance Existing Components

#### `UnlockRedemption.tsx` → Campaign-Aware with Cashback
```typescript
// Keep existing component structure, add campaign context and cashback display
interface EnhancedUnlockRedemptionProps {
  // All existing props
  clubId: string;
  clubName: string;
  userStatus: string;
  userPoints: number;
  onRedemption?: () => void;
  
  // New optional campaign mode
  campaignMode?: boolean; // Default false for backward compatibility
  showCampaignProgress?: boolean;
  showCashbackRewards?: boolean; // Show loyalty cashback for earned tiers
}

// Enhanced component logic
export default function UnlockRedemption(props: EnhancedUnlockRedemptionProps) {
  // Existing logic preserved
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  
  // Enhanced data loading with campaign context
  useEffect(() => {
    const loadUnlocks = async () => {
      // Same API endpoint, enhanced response
      const response = await fetch(`/api/clubs/${clubId}/tier-rewards`);
      const data = await response.json();
      
      // Group by campaigns if campaign mode
      if (props.campaignMode) {
        const groupedUnlocks = groupUnlocksByCampaign(data.available_rewards);
        setUnlocks(groupedUnlocks);
      } else {
        setUnlocks(data.available_rewards);
      }
    };
    
    loadUnlocks();
  }, [clubId, props.campaignMode]);
  
  // Enhanced rendering with campaign sections and cashback
  return (
    <div className="space-y-6">
      {props.campaignMode ? (
        // Campaign-grouped view with cashback
        renderCampaignGroupsWithCashback(unlocks)
      ) : (
        // Existing individual rewards view enhanced with cashback
        renderIndividualUnlocksWithCashback(unlocks)
      )}
    </div>
  );
}

// Enhanced unlock card rendering with cashback display
function renderUnlockCardWithCashback(unlock: Unlock) {
  return (
    <Card key={unlock.id}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{unlock.title}</span>
          <Badge variant="outline">{unlock.tier}</Badge>
        </CardTitle>
        {unlock.campaign_title && (
          <div className="text-sm text-muted-foreground">
            Part of {unlock.campaign_title}
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {/* Campaign progress if applicable */}
        {unlock.campaign_progress && (
          <CampaignProgressBar 
            current={unlock.campaign_progress.current_funding_cents}
            goal={unlock.campaign_progress.funding_goal_cents}
            showDetails
          />
        )}
        
        {/* Pricing with instant discount display */}
        <div className="space-y-3 mt-4">
          {/* Price display with discount */}
          <div className="space-y-2">
            {unlock.user_discount_eligible ? (
              <>
                {/* Original price (crossed out) */}
                <div className="flex items-center justify-between">
                  <span className="text-lg text-muted-foreground line-through">
                    ${(unlock.upgrade_price_cents / 100).toFixed(0)}
                  </span>
                  <div className="text-sm text-green-600 font-medium">
                    🎉 Save $${(unlock.user_discount_amount_cents / 100).toFixed(0)}
                  </div>
                </div>
                
                {/* Discounted price (prominent) */}
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-green-600">
                    ${(unlock.user_discounted_price_cents / 100).toFixed(0)}
                  </span>
                  <div className="text-sm text-green-600">
                    {unlock.discount_description}
                  </div>
                </div>
              </>
            ) : (
              /* Full price for non-earned users */
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  ${(unlock.upgrade_price_cents / 100).toFixed(0)}
                </span>
              </div>
            )}
          </div>
          
          {/* Purchase button */}
          <Button 
            className="w-full" 
            onClick={() => handlePurchase(unlock)}
          >
            {unlock.user_discount_eligible ? 
              `Join Tier - $${(unlock.user_discounted_price_cents / 100).toFixed(0)}` :
              `Join Tier - $${(unlock.upgrade_price_cents / 100).toFixed(0)}`
            }
          </Button>
          
          {/* Campaign impact context */}
          <div className="text-xs text-muted-foreground text-center">
            {unlock.user_discount_eligible ? 
              `Your $${(unlock.user_discounted_price_cents / 100).toFixed(0)} payment adds $${(unlock.upgrade_price_cents / 100).toFixed(0)} to campaign progress` :
              "Your payment helps reach the campaign goal"
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// New helper functions
function groupUnlocksByCampaign(unlocks: Unlock[]): CampaignGroup[] {
  // Group unlocks by campaign_id, keep individual ones separate
  const campaigns = new Map<string, Unlock[]>();
  const individual: Unlock[] = [];
  
  unlocks.forEach(unlock => {
    if (unlock.campaign_id) {
      if (!campaigns.has(unlock.campaign_id)) {
        campaigns.set(unlock.campaign_id, []);
      }
      campaigns.get(unlock.campaign_id)!.push(unlock);
    } else {
      individual.push(unlock);
    }
  });
  
  return [
    ...Array.from(campaigns.entries()).map(([campaignId, bundles]) => ({
      type: 'campaign',
      campaign_id: campaignId,
      campaign_title: bundles[0].campaign_title,
      campaign_progress: bundles[0].campaign_progress,
      bundles
    })),
    ...individual.map(unlock => ({
      type: 'individual',
      unlock
    }))
  ];
}

function renderCampaignGroups(groups: CampaignGroup[]) {
  return groups.map(group => {
    if (group.type === 'campaign') {
      return (
        <CampaignSection
          key={group.campaign_id}
          title={group.campaign_title}
          progress={group.campaign_progress}
          tiers={group.tiers}
        />
      );
    } else {
      return (
        <IndividualUnlockCard 
          key={group.unlock.id}
          unlock={group.unlock}
        />
      );
    }
  });
}
```

#### `TierRewardManagement.tsx` → Campaign-Aware Admin
```typescript
// Keep existing admin component, add campaign features
export default function TierRewardManagement({ onStatsUpdate }: TierRewardManagementProps) {
  // Existing state and logic preserved
  const [rewards, setRewards] = useState<TierReward[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  
  // Enhanced form with campaign toggle
  const [formData, setFormData] = useState({
    // All existing fields
    club_id: '',
    title: '',
    tier: 'resident',
    reward_type: 'access',
    upgrade_price_cents: 0,
    
    // New campaign fields (optional)
    is_campaign_bundle: false,
    campaign_title: '',
    campaign_funding_goal_cents: 0,
    campaign_deadline: '',
  });
  
  // Enhanced rendering with campaign grouping
  return (
    <div className="space-y-6">
      {/* Existing header and controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tier Rewards Management</h2>
        <Button onClick={handleOpenCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Create Reward
        </Button>
      </div>
      
      {/* Enhanced view toggle */}
      <div className="flex items-center gap-2">
        <Button 
          variant={viewMode === 'individual' ? 'default' : 'outline'}
          onClick={() => setViewMode('individual')}
        >
          Individual Rewards
        </Button>
        <Button 
          variant={viewMode === 'campaigns' ? 'default' : 'outline'}
          onClick={() => setViewMode('campaigns')}
        >
          Campaign View
        </Button>
      </div>
      
      {/* Enhanced rewards list */}
      {viewMode === 'campaigns' ? (
        renderCampaignGroupedRewards(rewards)
      ) : (
        renderIndividualRewards(rewards)
      )}
    </div>
  );
}
```

### 3.2 New Micro-Components (Minimal)

#### `CampaignProgressBar.tsx` - Simple Addition
```typescript
// Small reusable component for campaign progress
interface CampaignProgressBarProps {
  current: number;
  goal: number;
  showDetails?: boolean;
}

export function CampaignProgressBar({ current, goal, showDetails }: CampaignProgressBarProps) {
  const percentage = goal > 0 ? (current / goal) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Campaign Progress</span>
        <span>{Math.round(percentage)}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      {showDetails && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>${(current / 100).toFixed(0)} raised</span>
          <span>${(goal / 100).toFixed(0)} goal</span>
        </div>
      )}
    </div>
  );
}
```

#### `CampaignSection.tsx` - Wrapper for Existing Cards
```typescript
// Simple wrapper that groups existing unlock cards
interface CampaignSectionProps {
  title: string;
  progress?: CampaignProgress;
  tiers: Unlock[];
}

export function CampaignSection({ title, progress, tiers }: CampaignSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary">Campaign</Badge>
        </CardTitle>
        {progress && (
          <CampaignProgressBar 
            current={progress.current_funding_cents}
            goal={progress.funding_goal_cents}
            showDetails
          />
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          {tiers.map(tier => (
            <ExistingUnlockCard key={tier.id} unlock={tier} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Phase 4: Gradual UI Transition (Week 2-3)

### 4.1 Feature Flag Strategy

#### Progressive Campaign Features
```typescript
interface CampaignFeatureFlags {
  // Phase 1: Backend ready
  enableCampaignDataModel: boolean;
  
  // Phase 2: Admin can see campaign view
  showCampaignViewInAdmin: boolean;
  
  // Phase 3: Users see campaign grouping
  showCampaignGroupingInClub: boolean;
  
  // Phase 4: Full campaign creation
  enableCampaignCreation: boolean;
  
  // Phase 5: Hide individual reward creation
  hideIndividualRewardCreation: boolean;
}

// Gradual rollout
// Week 1: enableCampaignDataModel = true
// Week 2: showCampaignViewInAdmin = true  
// Week 3: showCampaignGroupingInClub = true
// Week 4: enableCampaignCreation = true
// Week 5: hideIndividualRewardCreation = true
```

### 4.2 Component Enhancement Strategy

#### Enhanced `ClubDetailsModal.tsx`
```typescript
// Add campaign toggle to existing modal
export default function ClubDetailsModal({ club, membership, onClose }: ClubDetailsModalProps) {
  // Existing logic preserved
  
  // Enhanced rewards section
  {membership && (
    <div className="mb-8" ref={rewardsRef}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Perks and Benefits</h3>
        
        {/* New campaign toggle (feature flagged) */}
        {featureFlags.showCampaignGroupingInClub && (
          <div className="flex items-center gap-2">
            <Button
              variant={rewardsViewMode === 'individual' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setRewardsViewMode('individual')}
            >
              Individual
            </Button>
            <Button
              variant={rewardsViewMode === 'campaigns' ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setRewardsViewMode('campaigns')}
            >
              Campaigns
            </Button>
          </div>
        )}
      </div>
      
      {/* Enhanced UnlockRedemption with campaign mode */}
      <UnlockRedemption
        clubId={club.id}
        clubName={club.name}
        userStatus={currentStatus}
        userPoints={currentPoints}
        campaignMode={rewardsViewMode === 'campaigns'}
        showCampaignProgress={true}
        onRedemption={async () => {
          await refetch();
          toast({
            title: "Perk Redeemed!",
            description: "Wallet and status updated",
          });
        }}
        // Existing handlers preserved
        onShowRedemptionConfirmation={(redemption, unlock) => {
          setRedemptionConfirmation({ redemption, unlock });
        }}
        onShowPerkDetails={(unlock, redemption) => {
          setPerkDetails({ isOpen: true, unlock, redemption });
        }}
      />
    </div>
  )}
```

---

## Phase 5: Semantic Transition (Week 3-4)

### 5.1 Terminology Evolution

#### UI Copy Changes (Gradual)
```typescript
// Phase 1: Introduce campaign terminology alongside existing
const TERMINOLOGY_MAP = {
  // Old → New (both shown initially)
  "Tier Rewards" → "Tier Rewards & Campaigns",
  "Unlock Perk" → "Claim Reward",
  "Boost to Unlock" → "Support Campaign",
  "Individual Reward" → "Campaign Bundle",
};

// Phase 2: Shift to campaign-first language
const EVOLVED_TERMINOLOGY = {
  "Tier Rewards & Campaigns" → "Campaigns",
  "Claim Reward" → "Join Campaign",
  "Support Campaign" → "Back Campaign",
  "Campaign Bundle" → "Tier Bundle",
};
```

#### Button Text Evolution
```typescript
// Existing button logic enhanced
function getClaimButtonText(unlock: Unlock): string {
  // Feature flag determines terminology
  if (featureFlags.useCampaignTerminology) {
    if (unlock.campaign_id) {
      return unlock.user_can_claim_free ? "Join Campaign" : `Back Campaign ($${unlock.upgrade_price_cents / 100})`;
    }
  }
  
  // Fallback to existing logic
  return unlock.user_can_claim_free ? "Claim Free" : `Unlock ($${unlock.upgrade_price_cents / 100})`;
}
```

### 5.2 Data Model Maturity

#### Campaign Creation Flow
```typescript
// Enhanced form in TierRewardManagement
const handleCreateCampaign = async () => {
  if (formData.is_campaign_bundle) {
    // Create campaign with multiple tier bundles
    const campaignId = generateUUID();
    
    // Create bundles for each tier
    const bundles = ['resident', 'headliner', 'superfan'].map(tier => ({
      ...formData,
      tier,
      campaign_id: campaignId,
      campaign_title: formData.campaign_title,
      title: `${formData.campaign_title} - ${tier.charAt(0).toUpperCase() + tier.slice(1)} Bundle`,
    }));
    
    // Use existing API to create multiple rewards
    for (const bundle of bundles) {
      await fetch('/api/admin/tier-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      });
    }
  } else {
    // Create individual reward (existing flow)
    await fetch('/api/admin/tier-rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
  }
};
```

---

## Phase 6: Advanced Campaign Features (Week 4-5)

### 6.1 Campaign Analytics Integration

#### Enhanced Analytics in Existing Components
```typescript
// Extend existing analytics in TierRewardManagement
interface EnhancedAnalytics {
  // Existing metrics
  total_rewards: number;
  total_claims: number;
  total_revenue_cents: number;
  
  // New campaign metrics
  active_campaigns: number;
  campaign_success_rate: number;
  average_campaign_funding: number;
  
  // Enhanced breakdowns
  by_tier: TierAnalytics[];
  by_campaign: CampaignAnalytics[];
}

// Same analytics component, enhanced data
{showAnalytics && (
  <motion.div className="space-y-4">
    {/* Existing summary cards enhanced */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{analyticsData.total_rewards}</div>
          <div className="text-xs text-muted-foreground">
            {analyticsData.active_campaigns} active campaigns
          </div>
        </CardContent>
      </Card>
      
      {/* New campaign success card */}
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">
            {(analyticsData.campaign_success_rate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">
            Campaign success rate
          </div>
        </CardContent>
      </Card>
      
      {/* Existing cards... */}
    </div>
    
    {/* New campaign performance section */}
    <Card>
      <CardHeader>
        <CardTitle>Campaign Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {analyticsData.by_campaign.map(campaign => (
          <div key={campaign.campaign_id} className="flex justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <div className="font-medium">{campaign.title}</div>
              <div className="text-sm text-muted-foreground">
                {campaign.total_participants} participants
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{campaign.funding_percentage}% funded</div>
              <div className="text-sm text-green-600">
                ${(campaign.current_funding_cents / 100).toFixed(0)} raised
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </motion.div>
)}
```

### 6.2 Enhanced User Experience

#### Smart Campaign Recommendations
```typescript
// Enhanced unlock loading with campaign recommendations
const loadUnlocks = async () => {
  const response = await fetch(`/api/clubs/${clubId}/tier-rewards?include_recommendations=true`);
  const data = await response.json();
  
  // Group and prioritize campaigns
  const prioritizedUnlocks = prioritizeCampaigns(data.available_rewards, {
    userTier: userStatus,
    userPoints: userPoints,
    showActiveFirst: true,
    showNearingDeadline: true,
  });
  
  setUnlocks(prioritizedUnlocks);
};

function prioritizeCampaigns(unlocks: Unlock[], context: UserContext): Unlock[] {
  return unlocks.sort((a, b) => {
    // Active campaigns first
    if (a.campaign_status === 'campaign_active' && b.campaign_status !== 'campaign_active') return -1;
    if (b.campaign_status === 'campaign_active' && a.campaign_status !== 'campaign_active') return 1;
    
    // User can claim free
    if (a.user_can_claim_free && !b.user_can_claim_free) return -1;
    if (b.user_can_claim_free && !a.user_can_claim_free) return 1;
    
    // Nearing deadline
    if (a.campaign_deadline && b.campaign_deadline) {
      const aDaysLeft = getDaysUntil(a.campaign_deadline);
      const bDaysLeft = getDaysUntil(b.campaign_deadline);
      if (aDaysLeft < 7 && bDaysLeft >= 7) return -1;
      if (bDaysLeft < 7 && aDaysLeft >= 7) return 1;
    }
    
    return 0;
  });
}
```

---

## Migration Timeline and Rollback Strategy

### Week-by-Week Plan

| Week | Focus | Changes | Rollback Point |
|------|--------|---------|----------------|
| **Week 1** | Database Evolution | Add campaign fields to existing tables, create migration functions | Schema rollback available |
| **Week 2** | API Enhancement | Extend existing endpoints, add campaign context | API versioning allows rollback |
| **Week 3** | Component Enhancement | Add campaign mode to existing components | Feature flags allow instant rollback |
| **Week 4** | UI Transition | Enable campaign views, update terminology | Feature flags control visibility |
| **Week 5** | Full Campaign Mode | Enable campaign creation, hide individual rewards | Complete feature flag control |

### Rollback Strategy

#### Instant Rollback via Feature Flags
```typescript
// Emergency rollback - single config change
const EMERGENCY_ROLLBACK_CONFIG = {
  enableCampaignDataModel: false,
  showCampaignViewInAdmin: false,
  showCampaignGroupingInClub: false,
  enableCampaignCreation: false,
  hideIndividualRewardCreation: false,
  useCampaignTerminology: false,
};

// System immediately reverts to original behavior
// No data loss, no component changes needed
```

#### Database Rollback
```sql
-- Remove campaign fields (if needed)
ALTER TABLE tier_rewards 
DROP COLUMN IF EXISTS campaign_id,
DROP COLUMN IF EXISTS campaign_title,
DROP COLUMN IF EXISTS campaign_description,
DROP COLUMN IF EXISTS campaign_funding_goal_cents,
DROP COLUMN IF EXISTS campaign_current_funding_cents,
DROP COLUMN IF EXISTS campaign_deadline,
DROP COLUMN IF EXISTS campaign_status,
DROP COLUMN IF EXISTS bundle_items,
DROP COLUMN IF EXISTS is_campaign_bundle,
DROP COLUMN IF EXISTS campaign_metadata;

-- Revert reward_claims changes
ALTER TABLE reward_claims
DROP COLUMN IF EXISTS participation_method,
DROP COLUMN IF EXISTS campaign_id,
DROP COLUMN IF EXISTS bundle_claimed,
DROP COLUMN IF EXISTS bundle_claimed_at,
DROP COLUMN IF EXISTS fulfillment_status;
```

---

## Benefits of This Approach

### 🎯 **Minimal Development Overhead**
- **Reuse 90%+ of existing UI components**
- **Extend existing database tables** instead of creating new ones
- **Enhance existing APIs** rather than building from scratch
- **Preserve all existing functionality** during transition

### 🔄 **Zero-Risk Transition**
- **Feature flags** allow instant rollback at any point
- **Existing components** continue to work unchanged
- **Database changes** are purely additive
- **API changes** are backward compatible

### 👥 **Seamless User Experience**
- **Familiar interface** with gradual enhancements
- **Same components** with enhanced functionality
- **Progressive terminology** evolution
- **No learning curve** for existing users

### 💰 **Superior Business Model with Instant Discounts**
- **Artists always get full payout** → no subsidized inventory risk
- **Campaign progress is real** → shows full tier values toward goal
- **Earned tiers see immediate value** → instant discount at checkout
- **Platform controls costs** → discount subsidy from protocol spread
- **Demand validation intact** → campaign progress reflects true tier value

### 🎉 **Instant Discount Model Advantages**

#### **For Fans**
- **Immediate gratification**: "Save $5 instantly with your status"
- **Clear value recognition**: Discount applied at checkout, not later
- **Campaign participation**: Payment helps artist reach goal
- **Status motivation**: Higher tiers = bigger instant savings

#### **For Artists**  
- **Full revenue**: Always receive complete tier price
- **Real demand signals**: Campaign progress shows true tier value
- **Inventory confidence**: Know fans value tiers at full price
- **No subsidy risk**: Platform covers discounts, not artist revenue

#### **For Platform**
- **Simpler accounting**: No deferred cashback obligations to track
- **Predictable costs**: Fixed discount amounts per tier
- **Sustainable model**: Spread-funded discounts don't impact artist payouts
- **Clean UX**: "Save $X with your status" is instantly understandable

---

## Success Metrics

### Technical Metrics
- **Code Reuse**: 90%+ of existing components preserved
- **API Compatibility**: 100% backward compatibility maintained
- **Zero Downtime**: No service interruptions during transition
- **Feature Flag Coverage**: 100% rollback capability

### Business Metrics
- **User Adoption**: 80%+ of users engage with campaign features
- **Artist Satisfaction**: 4.5+ rating on new campaign tools
- **Revenue Growth**: 15%+ increase within 2 months
- **Support Tickets**: <10% increase during transition

### User Experience Metrics
- **Interface Familiarity**: 95%+ of users find interface familiar
- **Feature Discovery**: 60%+ of users discover campaign features naturally
- **Completion Rate**: 85%+ of started campaigns complete successfully
- **User Confusion**: <5% of users report confusion about changes

---

## Conclusion

This revised implementation plan achieves the campaigns-as-tiers vision while **minimizing development effort and risk**. By reusing existing components and enhancing them gradually, we can:

1. **Preserve User Experience**: Familiar interface with enhanced functionality
2. **Minimize Development Time**: Reuse 90%+ of existing code
3. **Eliminate Risk**: Feature flags enable instant rollback
4. **Maintain Quality**: Build on proven, tested components
5. **Accelerate Delivery**: Focus on data model evolution rather than UI rebuilding

The result is a **low-risk, high-impact transformation** that evolves the platform's capabilities while preserving everything that already works well.
