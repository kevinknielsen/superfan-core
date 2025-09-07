// Unified status thresholds and helpers (unified peg: $1 = 100 pts)

export type StatusKey = 'cadet' | 'resident' | 'headliner' | 'superfan';

export const STATUS_THRESHOLDS: Record<StatusKey, number> = {
  cadet: 0,
  resident: 5000,
  headliner: 15000,
  superfan: 40000,
};

export function computeStatus(statusPoints: number): StatusKey {
  if (statusPoints >= STATUS_THRESHOLDS.superfan) return 'superfan';
  if (statusPoints >= STATUS_THRESHOLDS.headliner) return 'headliner';
  if (statusPoints >= STATUS_THRESHOLDS.resident) return 'resident';
  return 'cadet';
}

export function nextStatus(current: StatusKey): StatusKey | null {
  switch (current) {
    case 'cadet':
      return 'resident';
    case 'resident':
      return 'headliner';
    case 'headliner':
      return 'superfan';
    default:
      return null;
  }
}

