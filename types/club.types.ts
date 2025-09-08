// Club-based types matching the Superfan memo data model
import { Users, Star, Trophy, Crown } from "lucide-react";

export type ClubStatus = 'cadet' | 'resident' | 'headliner' | 'superfan';
export type UnlockType = 'perk' | 'lottery' | 'allocation';
export type TapInSource = 'qr_code' | 'nfc' | 'link' | 'show_entry' | 'merch_purchase' | 'pre_save' | 'trailer' | 'premiere_chat';

export interface Club {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  city: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  unlocks?: Unlock[]; // Optional array of unlocks for this club
}

export interface ClubMembership {
  id: string;
  user_id: string;
  club_id: string;
  status: 'active' | 'inactive';
  points: number;
  current_status: ClubStatus;
  last_activity_at: string;
  join_date: string;
  created_at: string;
  updated_at: string;
  club?: Club;
}

export interface TapIn {
  id: string;
  user_id: string;
  club_id: string;
  source: TapInSource;
  points_earned: number;
  location: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PointsLedgerEntry {
  id: string;
  user_id: string;
  club_id: string;
  delta: number; // positive for earn, negative for decay/spend
  reason: string;
  reference_id: string | null;
  created_at: string;
}

export interface Unlock {
  id: string;
  club_id: string;
  type: UnlockType;
  title: string;
  description: string | null;
  min_status: ClubStatus;
  requires_accreditation: boolean;
  stock: number | null; // null = unlimited
  window_start: string | null;
  window_end: string | null;
  rules: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Redemption {
  id: string;
  user_id: string;
  unlock_id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  metadata: Record<string, any>;
  redeemed_at: string;
  updated_at: string;
  unlock?: Unlock;
}

export interface HouseAccount {
  id: string;
  user_id: string;
  club_id: string;
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

export interface StatusThreshold {
  id: string;
  status: ClubStatus;
  min_points: number;
  created_at: string;
}

// Utility types
export interface ClubWithMembership extends Club {
  membership?: ClubMembership;
  unlocks?: Unlock[];
  unlock_count?: number;
}

export interface UserClubData {
  membership: ClubMembership;
  club: Club;
  unlocks: Unlock[];
  recent_tap_ins: TapIn[];
  house_account?: HouseAccount;
}

// Status progression helper
// Import unified status thresholds
import { STATUS_THRESHOLDS as UNIFIED_STATUS_THRESHOLDS } from "@/lib/status";

export const STATUS_THRESHOLDS: Record<ClubStatus, number> = UNIFIED_STATUS_THRESHOLDS;

export const STATUS_ORDER: ClubStatus[] = ['cadet', 'resident', 'headliner', 'superfan'];

// Status icon and color mappings
export const STATUS_ICONS = {
  cadet: Users,
  resident: Star,
  headliner: Trophy,
  superfan: Crown,
};

export const STATUS_COLORS = {
  cadet: "text-gray-400",
  resident: "text-blue-400", 
  headliner: "text-purple-400",
  superfan: "text-yellow-400",
};

export function calculateStatus(points: number): ClubStatus {
  if (points >= STATUS_THRESHOLDS.superfan) return 'superfan';
  if (points >= STATUS_THRESHOLDS.headliner) return 'headliner';
  if (points >= STATUS_THRESHOLDS.resident) return 'resident';
  return 'cadet';
}

export function getNextStatus(currentStatus: ClubStatus): ClubStatus | null {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  return currentIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIndex + 1] : null;
}

export function getPointsToNext(currentPoints: number, currentStatus: ClubStatus): number | null {
  const nextStatus = getNextStatus(currentStatus);
  if (!nextStatus) return null;
  return STATUS_THRESHOLDS[nextStatus] - currentPoints;
}

// Example scoring from memo: score = 0.8*log(1+spend)*100 + 40*events + 25*referrals + 10*content
export function calculateTapInPoints(source: TapInSource, metadata?: Record<string, any>): number {
  const POINT_VALUES: Record<TapInSource, number> = {
    trailer: 20,
    premiere_chat: 40,
    show_entry: 100,
    merch_purchase: 50,
    pre_save: 40,
    qr_code: 30,
    nfc: 30,
    link: 10,
  };
  
  return POINT_VALUES[source] || 10;
}
