export interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_period: 'monthly' | 'yearly';
  features: string[];
  max_house_account_balance_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'paused';
  current_period_start: string;
  current_period_end: string;
  auto_renew: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  plan?: MembershipPlan;
}

export interface HouseAccount {
  id: string;
  user_id: string;
  balance_cents: number;
  lifetime_topup_cents: number;
  lifetime_spend_cents: number;
  created_at: string;
  updated_at: string;
}

export interface HouseTransaction {
  id: string;
  house_account_id: string;
  type: 'topup' | 'spend' | 'refund' | 'adjustment';
  amount_cents: number;
  description: string;
  reference_id: string | null;
  stripe_payment_intent_id: string | null;
  admin_user_id: string | null;
  created_at: string;
}

export interface RedemptionCode {
  id: string;
  code: string;
  value_cents: number;
  uses_remaining: number;
  max_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  created_at: string;
}

export interface CodeRedemption {
  id: string;
  redemption_code_id: string;
  user_id: string;
  house_transaction_id: string;
  redeemed_at: string;
}

export interface User {
  id: string;
  privy_id: string | null;
  farcaster_id: string | null;
  email: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
}
