/**
 * Points System Helper Functions
 * 
 * This module contains all the business logic for the community-locked points system,
 * including guardrails, pricing calculations, and reserve management.
 */

import { supabase } from './supabase';

// Constants from the spec
export const PLATFORM_FEE = 0.10; // 10%
export const BREAKAGE = 0.15; // 15% expected breakage
export const BUFFER = 0.10; // 10% additional buffer
export const RESERVE_RATIO = 0.25; // 25% reserve ratio

// Types
export interface Community {
  id: string;
  name: string;
  point_sell_cents: number;
  point_settle_cents: number;
  guardrail_min_sell: number;
  guardrail_max_sell: number;
  guardrail_min_settle: number;
  guardrail_max_settle: number;
}

export interface PointWallet {
  id: string;
  user_id: string;
  club_id: string;
  balance_pts: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface PointTransaction {
  id: string;
  wallet_id: string;
  type: 'PURCHASE' | 'BONUS' | 'SPEND' | 'REFUND';
  pts: number;
  unit_sell_cents?: number;
  unit_settle_cents?: number;
  usd_gross_cents?: number;
  ref?: string;
  created_at: string;
}

export interface Reward {
  id: string;
  club_id: string;
  kind: 'ACCESS' | 'PRESALE_LOCK' | 'VARIANT';
  title: string;
  description?: string;
  points_price: number;
  inventory?: number;
  window_start?: string;
  window_end?: string;
  settle_mode: 'ZERO' | 'PRR';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  club_id: string;
  reward_id: string;
  points_spent: number;
  state: 'HELD' | 'CONFIRMED' | 'FULFILLED' | 'REFUNDED';
  hold_expires_at?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PurchaseBundle {
  points: number;
  usd_cents: number;
  bonus_pts?: number;
  display_name: string;
}

/**
 * Validate pricing guardrails
 * sell ∈ [minSell,maxSell], settle ∈ [minSettle,maxSettle], and sell >= settle / (1 - PLATFORM_FEE - RESERVE_RATIO)
 */
export function validatePricingGuardrails(
  sellCents: number,
  settleCents: number,
  community: Pick<Community, 'guardrail_min_sell' | 'guardrail_max_sell' | 'guardrail_min_settle' | 'guardrail_max_settle'>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check sell cents range
  if (sellCents < community.guardrail_min_sell) {
    errors.push(`Sell price must be at least ${community.guardrail_min_sell} cents`);
  }
  if (sellCents > community.guardrail_max_sell) {
    errors.push(`Sell price cannot exceed ${community.guardrail_max_sell} cents`);
  }

  // Check settle cents range
  if (settleCents < community.guardrail_min_settle) {
    errors.push(`Settle price must be at least ${community.guardrail_min_settle} cents`);
  }
  if (settleCents > community.guardrail_max_settle) {
    errors.push(`Settle price cannot exceed ${community.guardrail_max_settle} cents`);
  }

  // Check minimum sell vs settle ratio
  const minSellForSettle = settleCents / (1 - PLATFORM_FEE - RESERVE_RATIO);
  if (sellCents < minSellForSettle) {
    errors.push(`Sell price must be at least ${Math.ceil(minSellForSettle)} cents given the settle price and platform fees`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate reserve target for a community
 * reserveTarget = outstandingPts * settleCents/100 * (1 - breakage + buffer)
 */
export async function calculateReserveTarget(clubId: string): Promise<number> {
  // Get total outstanding points for this community
  const { data: wallets, error } = await supabase
    .from('point_wallets')
    .select('balance_pts')
    .eq('club_id', clubId);

  if (error) throw error;

  const outstandingPts = wallets?.reduce((sum, wallet) => sum + wallet.balance_pts, 0) || 0;

  // Get community settle rate
  const { data: community, error: communityError } = await supabase
    .from('clubs')
    .select('point_settle_cents')
    .eq('id', clubId)
    .single();

  if (communityError) throw communityError;

  const settleCentsPerPoint = community.point_settle_cents / 100;
  const reserveTarget = outstandingPts * settleCentsPerPoint * (1 - BREAKAGE + BUFFER);

  return Math.ceil(reserveTarget);
}

/**
 * Calculate upfront amount after fees and reserve
 * upfront = gross - platformFee - reserveTopUp
 */
export function calculateUpfrontAmount(
  grossCents: number,
  reserveTopUpCents: number
): number {
  const platformFeeCents = grossCents * PLATFORM_FEE;
  const upfront = grossCents - platformFeeCents - reserveTopUpCents;
  return Math.max(0, upfront);
}

/**
 * Calculate reserve delta for a purchase
 */
export function calculateReserveDelta(
  pointsPurchased: number,
  settleCentsPerPoint: number
): number {
  const reservePerPoint = (settleCentsPerPoint / 100) * (1 - BREAKAGE + BUFFER);
  return Math.ceil(pointsPurchased * reservePerPoint);
}

/**
 * Calculate coverage ratio (simulated NAV / modeled liability)
 * For MVP, this is just reserveTarget vs reserveTarget (always 100%)
 */
export async function calculateCoverageRatio(clubId: string): Promise<number> {
  const reserveTarget = await calculateReserveTarget(clubId);
  // For MVP, simulated NAV equals reserve target
  const simulatedNAV = reserveTarget;
  
  if (reserveTarget === 0) return 1.0; // 100% coverage if no liability
  return simulatedNAV / reserveTarget;
}

/**
 * Generate purchase bundles for a community (LEGACY - use generateUnifiedPurchaseBundles)
 */
export function generatePurchaseBundles(sellCentsPerPoint: number): PurchaseBundle[] {
  const baseSellCents = sellCentsPerPoint / 100; // Convert to dollars

  return [
    {
      points: 1000,
      usd_cents: 1000 * sellCentsPerPoint,
      display_name: `1,000 Points ($${(1000 * baseSellCents).toFixed(2)})`
    },
    {
      points: 5000,
      bonus_pts: 250, // 5% bonus
      usd_cents: 5000 * sellCentsPerPoint,
      display_name: `5,000 Points + 250 Bonus ($${(5000 * baseSellCents).toFixed(2)})`
    },
    {
      points: 10000,
      bonus_pts: 1000, // 10% bonus
      usd_cents: 10000 * sellCentsPerPoint,
      display_name: `10,000 Points + 1,000 Bonus ($${(10000 * baseSellCents).toFixed(2)})`
    }
  ];
}

/**
 * Generate purchase bundles using unified peg (100 points = $1)
 */
export function generateUnifiedPurchaseBundles(): PurchaseBundle[] {
  return [
    {
      points: 1000,
      usd_cents: 1000, // $10 for 1000 points (1 cent per point)
      display_name: `1,000 Points ($10.00)`
    },
    {
      points: 5000,
      bonus_pts: 250, // 5% bonus
      usd_cents: 5000, // $50 for 5000 points
      display_name: `5,000 Points + 250 Bonus ($50.00)`
    },
    {
      points: 10000,
      bonus_pts: 1000, // 10% bonus
      usd_cents: 10000, // $100 for 10000 points
      display_name: `10,000 Points + 1,000 Bonus ($100.00)`
    }
  ];
}

/**
 * Check if a reward is currently available
 */
export function isRewardAvailable(reward: Reward): boolean {
  if (reward.status !== 'active') return false;

  const now = new Date();
  
  if (reward.window_start && new Date(reward.window_start) > now) {
    return false; // Window hasn't started
  }
  
  if (reward.window_end && new Date(reward.window_end) < now) {
    return false; // Window has ended
  }

  if (reward.inventory !== null && reward.inventory <= 0) {
    return false; // Out of stock
  }

  return true;
}

/**
 * Calculate hold expiry time for PRESALE_LOCK redemptions
 */
export function calculateHoldExpiry(hours: number = 24): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry.toISOString();
}

/**
 * Get week start (Monday) for tracking upfront stats
 */
export function getWeekStart(date: Date = new Date()): string {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
  monday.setDate(monday.getDate() + daysToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0]; // Return YYYY-MM-DD
}

/**
 * Record or update weekly upfront stats
 */
export async function updateWeeklyUpfrontStats(
  clubId: string,
  grossCents: number,
  platformFeeCents: number,
  reserveDeltaCents: number,
  upfrontCents: number
): Promise<void> {
  const weekStart = getWeekStart();

  const { error } = await supabase
    .from('weekly_upfront_stats')
    .upsert({
      club_id: clubId,
      week_start: weekStart,
      gross_cents: grossCents,
      platform_fee_cents: platformFeeCents,
      reserve_delta_cents: reserveDeltaCents,
      upfront_cents: upfrontCents
    }, {
      onConflict: 'club_id,week_start',
      // Add to existing values
      ignoreDuplicates: false
    });

  if (error) throw error;
}

/**
 * Get or create point wallet for user in community
 */
export async function getOrCreatePointWallet(userId: string, clubId: string): Promise<PointWallet> {
  // First try to get existing wallet
  const { data: existingWallet, error: getError } = await supabase
    .from('point_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .single();

  if (existingWallet && !getError) {
    return existingWallet;
  }

  // Create new wallet if it doesn't exist
  const { data: newWallet, error: createError } = await supabase
    .from('point_wallets')
    .insert({
      user_id: userId,
      club_id: clubId,
      balance_pts: 0,
      last_activity_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return newWallet!;
}

/**
 * Update wallet balance and record transaction atomically
 */
export async function updateWalletBalance(
  walletId: string,
  deltaPoints: number,
  transactionType: PointTransaction['type'],
  metadata: Partial<Pick<PointTransaction, 'unit_sell_cents' | 'unit_settle_cents' | 'usd_gross_cents' | 'ref'>> = {}
): Promise<{ wallet: PointWallet; transaction: PointTransaction }> {
  // Use the SQL function to safely update balance
  const { data: newBalance, error: balanceError } = await supabase
    .rpc('increment_balance', { 
      wallet_id: walletId, 
      delta: deltaPoints 
    });

  if (balanceError) throw balanceError;

  // Update last activity
  const { data: updatedWallet, error: walletError } = await supabase
    .from('point_wallets')
    .update({
      last_activity_at: new Date().toISOString()
    })
    .eq('id', walletId)
    .select('*')
    .single();

  if (walletError) throw walletError;

  // Record transaction
  const { data: transaction, error: transactionError } = await supabase
    .from('point_transactions')
    .insert({
      wallet_id: walletId,
      type: transactionType,
      pts: Math.abs(deltaPoints),
      ...metadata
    })
    .select('*')
    .single();

  if (transactionError) throw transactionError;

  return {
    wallet: updatedWallet!,
    transaction: transaction!
  };
}

/**
 * Format points for display
 */
export function formatPoints(points: number): string {
  return points.toLocaleString();
}

/**
 * Format currency for display
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
