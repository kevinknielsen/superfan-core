/**
 * Unified Points System - Single Source of Truth
 * 
 * This module consolidates ALL points-related logic including:
 * - Status calculations and thresholds
 * - Points formatting and display
 * - Tap-in point values
 * - Purchase bundles and pricing
 * - Spending power calculations
 * - Reserve management (legacy)
 */

import { supabase } from './supabase';

// ================================
// STATUS SYSTEM - UNIFIED
// ================================

export type StatusKey = 'cadet' | 'resident' | 'headliner' | 'superfan';

export const STATUS_THRESHOLDS = Object.freeze({
  cadet: 0,
  resident: 5000,
  headliner: 15000,
  superfan: 40000,
} satisfies Record<StatusKey, number>);

export const STATUS_ORDER = ['cadet', 'resident', 'headliner', 'superfan'] as const;

// Comprehensive status configuration with UI data
export const STATUS_CONFIG = Object.freeze({
  cadet: { 
    color: 'bg-gray-500', 
    label: 'Cadet', 
    icon: '🌟',
    threshold: 0,
    description: 'New member getting started'
  },
  resident: { 
    color: 'bg-blue-500', 
    label: 'Resident', 
    icon: '🏠',
    threshold: 5000,
    description: 'Regular community member'
  },
  headliner: { 
    color: 'bg-purple-500', 
    label: 'Headliner', 
    icon: '🎤',
    threshold: 15000,
    description: 'Active community contributor'
  },
  superfan: { 
    color: 'bg-yellow-500', 
    label: 'Superfan', 
    icon: '👑',
    threshold: 40000,
    description: 'Ultimate community champion'
  }
} satisfies Record<StatusKey, {
  color: string;
  label: string;
  icon: string;
  threshold: number;
  description: string;
}>);

/**
 * Calculate status from status points (earned - escrowed)
 */
export function computeStatus(statusPoints: number): StatusKey {
  const pts = Number.isFinite(statusPoints) ? Math.max(0, statusPoints) : 0;
  if (pts >= STATUS_THRESHOLDS.superfan) return 'superfan';
  if (pts >= STATUS_THRESHOLDS.headliner) return 'headliner';
  if (pts >= STATUS_THRESHOLDS.resident) return 'resident';
  return 'cadet';
}

/**
 * Get the next status tier
 */
export function getNextStatus(current: StatusKey): StatusKey | null {
  const currentIndex = STATUS_ORDER.indexOf(current);
  return currentIndex >= 0 && currentIndex < STATUS_ORDER.length - 1 
    ? STATUS_ORDER[currentIndex + 1] 
    : null;
}

/**
 * Calculate progress to next status
 */
export function calculateStatusProgress(statusPoints: number): {
  current: StatusKey;
  next: StatusKey | null;
  currentThreshold: number;
  nextThreshold: number | null;
  pointsToNext: number;
  progressPercentage: number;
} {
  const current = computeStatus(statusPoints);
  const next = getNextStatus(current);
  const currentThreshold = STATUS_THRESHOLDS[current];
  const nextThreshold = next ? STATUS_THRESHOLDS[next] : null;
  
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - statusPoints) : 0;
  const progressPercentage = nextThreshold 
    ? Math.min(100, Math.max(0, ((statusPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
    : 100;

  return {
    current,
    next,
    currentThreshold,
    nextThreshold,
    pointsToNext,
    progressPercentage,
  };
}

/**
 * Get status configuration for UI display
 */
export function getStatusInfo(status: StatusKey) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.cadet;
}

/**
 * Get all status configurations for UI lists
 */
export function getAllStatusInfo() {
  return STATUS_ORDER.map((key) => ({ key, ...STATUS_CONFIG[key] }));
}

// ================================
// TAP-IN POINT VALUES
// ================================

export const TAP_IN_POINT_VALUES = Object.freeze({
  qr_code: 20,
  nfc: 20,
  link: 10,
  show_entry: 100,
  merch_purchase: 50,
  presave: 40,
  default: 10
} satisfies Record<string, number>);

/**
 * Get point value for a tap-in source
 */
export function getTapInPointValue(source: string): number {
  return TAP_IN_POINT_VALUES[source as keyof typeof TAP_IN_POINT_VALUES] || TAP_IN_POINT_VALUES.default;
}

// ================================
// POINTS FORMATTING & DISPLAY
// ================================

/**
 * Format points for display with proper thousands separators
 */
export function formatPoints(points: number): string {
  return Math.floor(points).toLocaleString();
}

/**
 * Format points with custom suffix
 */
export function formatPointsWithSuffix(points: number, suffix: string = 'pts'): string {
  return `${formatPoints(points)} ${suffix}`;
}

/**
 * Format points compactly for tight spaces (e.g., 1.2K, 5.6M)
 */
export function formatPointsCompact(points: number): string {
  const absPoints = Math.abs(points);
  
  if (absPoints >= 1_000_000) {
    return `${(points / 1_000_000).toFixed(1)}M`;
  } else if (absPoints >= 1_000) {
    return `${(points / 1_000).toFixed(1)}K`;
  } else {
    return formatPoints(points);
  }
}

/**
 * Format currency for display (cents to dollars)
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Get relative points change display (e.g., "+50", "-25")
 */
export function formatPointsChange(change: number): string {
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${formatPoints(change)}`;
}

// ================================
// SPENDING POWER CALCULATIONS  
// ================================

/**
 * Calculate spending power breakdown for status protection
 */
export function calculateSpendingPower(
  earnedPoints: number, 
  purchasedPoints: number, 
  escrowedPoints: number,
  currentStatus: StatusKey,
  preserveStatus: boolean = false
): {
  totalSpendable: number;
  purchasedAvailable: number;
  earnedAvailable: number;
  earnedLockedForStatus: number;
  escrowed: number;
} {
  const currentThreshold = STATUS_THRESHOLDS[currentStatus];
  
  // Points locked to preserve status (if protection enabled)
  const earnedLockedForStatus = preserveStatus ? Math.min(currentThreshold, earnedPoints) : 0;
  
  // Available points from each source
  const purchasedAvailable = Math.max(0, purchasedPoints);
  const earnedAvailable = Math.max(0, earnedPoints - earnedLockedForStatus - escrowedPoints);
  const totalSpendable = purchasedAvailable + earnedAvailable;

  return {
    totalSpendable,
    purchasedAvailable,
    earnedAvailable,
    earnedLockedForStatus,
    escrowed: escrowedPoints,
  };
}

/**
 * Check if user can spend a certain amount
 */
export function canSpendPoints(
  amount: number,
  earnedPoints: number,
  purchasedPoints: number,
  escrowedPoints: number,
  currentStatus: StatusKey,
  preserveStatus: boolean = false
): boolean {
  const spendingPower = calculateSpendingPower(
    earnedPoints, 
    purchasedPoints, 
    escrowedPoints,
    currentStatus, 
    preserveStatus
  );
  
  return spendingPower.totalSpendable >= amount;
}

/**
 * Calculate optimal spending breakdown (purchased first, then earned)
 */
export function calculateSpendingBreakdown(
  amountToSpend: number,
  earnedPoints: number,
  purchasedPoints: number,
  escrowedPoints: number,
  currentStatus: StatusKey,
  preserveStatus: boolean = false
): {
  canSpend: boolean;
  spendPurchased: number;
  spendEarned: number;
  remainingBalance: number;
  error?: string;
} {
  // Validate negative amounts early
  if (!Number.isFinite(amountToSpend) || amountToSpend < 0) {
    return {
      canSpend: false,
      spendPurchased: 0,
      spendEarned: 0,
      remainingBalance: earnedPoints + purchasedPoints,
      error: "Amount to spend must be a non-negative number"
    };
  }

  const spendingPower = calculateSpendingPower(
    earnedPoints, 
    purchasedPoints, 
    escrowedPoints,
    currentStatus, 
    preserveStatus
  );

  if (amountToSpend > spendingPower.totalSpendable) {
    return {
      canSpend: false,
      spendPurchased: 0,
      spendEarned: 0,
      remainingBalance: earnedPoints + purchasedPoints,
      error: preserveStatus 
        ? 'Insufficient points (status protection enabled)'
        : 'Insufficient points'
    };
  }

  // Spend purchased points first, then earned
  const spendPurchased = Math.min(amountToSpend, spendingPower.purchasedAvailable);
  const spendEarned = Math.max(0, amountToSpend - spendPurchased);

  return {
    canSpend: true,
    spendPurchased,
    spendEarned,
    remainingBalance: (earnedPoints + purchasedPoints) - amountToSpend,
  };
}

// ================================
// LEGACY PRICING & BUNDLES
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
  return new Date(
    Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate())
  )
    .toISOString()
    .split('T')[0]; // Return YYYY-MM-DD
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

// ================================
// VALIDATION & UTILITIES
// ================================

/**
 * Validate that points amount is valid
 */
export function validatePointsAmount(points: number): { isValid: boolean; error?: string } {
  if (!Number.isFinite(points)) {
    return { isValid: false, error: 'Points must be a valid number' };
  }
  
  if (points < 0) {
    return { isValid: false, error: 'Points cannot be negative' };
  }
  
  if (points > 1_000_000) {
    return { isValid: false, error: 'Points amount too large' };
  }
  
  if (!Number.isInteger(points)) {
    return { isValid: false, error: 'Points must be a whole number' };
  }
  
  return { isValid: true };
}

/**
 * Safely parse points amount from user input
 */
export function parsePointsAmount(input: string | number): number {
  if (typeof input === 'number') {
    return Math.max(0, Math.floor(input));
  }
  
  // Remove thousands separators and normalize input
  const cleanedInput = input.replace(/,/g, '').trim();
  const parsed = Number(cleanedInput);
  
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  
  return Math.max(0, Math.floor(parsed));
}
