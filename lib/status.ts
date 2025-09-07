// Unified status thresholds and helpers (unified peg: $1 = 100 pts)

export type StatusKey = 'cadet' | 'resident' | 'headliner' | 'superfan';

export const STATUS_THRESHOLDS = Object.freeze({
  cadet: 0,
  resident: 5000,
  headliner: 15000,
  superfan: 40000,
} satisfies Record<StatusKey, number>);

export function computeStatus(statusPoints: number): StatusKey {
  const pts = Number.isFinite(statusPoints) ? Math.max(0, statusPoints) : 0;
  if (pts >= STATUS_THRESHOLDS.superfan) return 'superfan';
  if (pts >= STATUS_THRESHOLDS.headliner) return 'headliner';
  if (pts >= STATUS_THRESHOLDS.resident) return 'resident';
  return 'cadet';
}

export const STATUS_ORDER = ['cadet', 'resident', 'headliner', 'superfan'] as const;

export function nextStatus(current: StatusKey): StatusKey | null {
  const i = STATUS_ORDER.indexOf(current);
  return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

