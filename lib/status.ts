/**
 * @deprecated Use the consolidated functions from lib/points.ts instead
 * This file is kept for backwards compatibility
 */

// Re-export from the consolidated points system
export {
  type StatusKey,
  STATUS_THRESHOLDS,
  STATUS_ORDER,
  computeStatus,
  getNextStatus as nextStatus,
  calculateStatusProgress,
  getStatusInfo,
  getAllStatusInfo,
  STATUS_CONFIG
} from './points';

