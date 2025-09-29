export interface CampaignData {
  campaign_id: string;
  campaign_title: string;
  campaign_status: string;
  campaign_progress: {
    funding_percentage: number;
    current_funding_cents: number;
    goal_funding_cents: number;
    seconds_remaining: number;
  };
}

export interface TierReward {
  id: string;
  title: string;
  description: string;
  reward_type: string;
  tier: string;
  current_status: string;
  metadata?: Record<string, any>;
  campaign_id?: string;
  campaign_title?: string;
  campaign_status?: string;
  is_campaign_tier?: boolean;
  campaign_progress?: {
    funding_percentage: number;
    seconds_remaining: number;
    current_funding_cents: number;
    funding_goal_cents: number;
  };
  user_discount_eligible?: boolean;
  user_discount_amount_cents?: number;
  user_discount_percentage?: number;
  user_final_price_cents?: number;
  discount_description?: string;
  user_can_claim_free?: boolean;
  claim_options?: ClaimOption[];
  tier_boost_price_cents?: number;
  direct_unlock_price_cents?: number;
  inventory_status?: string;
  clubs?: {
    id: string;
    name: string;
    description?: string | null;
    city?: string | null;
    image_url?: string | null;
  };
  // NEW: Ticket campaign fields
  ticket_cost?: number;
  is_ticket_campaign?: boolean;
  cogs_cents?: number;
}

export interface ClaimOption {
  upgrade?: {
    purchase_type: 'tier_boost' | 'direct_unlock';
    price_cents?: number;
  };
}

export interface ClaimedReward {
  id: string;
  reward_id: string;
  access_status: string;
  access_code?: string;
  claimed_at: string;
}

export interface TierRewardsResponse {
  available_rewards: TierReward[];
  claimed_rewards: ClaimedReward[];
  // NEW: User's ticket balances by campaign
  user_ticket_balances?: Record<string, number>;
}

export interface PurchaseResponse {
  stripe_session_url: string;
  final_price_cents: number;
  discount_applied_cents: number;
  discount_percentage: number;
  // NEW: Ticket campaign fields
  is_ticket_campaign?: boolean;
  ticket_cost?: number;
  tickets_purchased?: number;
}
