/**
 * Centralized status color system
 * Ensures consistent tier colors across all components
 */

import type { ClubStatus } from "@/types/club.types";

// Primary gradient colors for tier progression (matches club-card design)
export const STATUS_GRADIENT_COLORS = {
  cadet: ["#ec4899", "#be185d"], // Pink gradient - matches primary brand
  resident: ["#3b82f6", "#1d4ed8"], // Blue gradient
  headliner: ["#8b5cf6", "#7c3aed"], // Purple gradient  
  superfan: ["#f59e0b", "#d97706"], // Gold/amber gradient for max tier
} as const;

// Text colors derived from gradient colors
export const STATUS_TEXT_COLORS = {
  cadet: "text-pink-400",
  resident: "text-blue-400", 
  headliner: "text-purple-400",
  superfan: "text-amber-400",
} as const;

// Background colors for badges and containers
export const STATUS_BG_COLORS = {
  cadet: "bg-pink-900/30",
  resident: "bg-blue-900/30",
  headliner: "bg-purple-900/30",
  superfan: "bg-amber-900/30",
} as const;

// Border colors for badges
export const STATUS_BORDER_COLORS = {
  cadet: "border-pink-500/30",
  resident: "border-blue-500/30",
  headliner: "border-purple-500/30",
  superfan: "border-amber-500/30",
} as const;

// Gradient classes for CSS
export const STATUS_GRADIENT_CLASSES = {
  cadet: "from-pink-500 to-pink-400",
  resident: "from-blue-500 to-blue-400",
  headliner: "from-purple-500 to-purple-400",
  superfan: "from-amber-500 to-amber-400",
} as const;

// Helper functions
export const getStatusGradientColors = (status: ClubStatus) => {
  return STATUS_GRADIENT_COLORS[status] ?? STATUS_GRADIENT_COLORS.cadet;
};

export const getStatusTextColor = (status: ClubStatus) => {
  return STATUS_TEXT_COLORS[status] ?? STATUS_TEXT_COLORS.cadet;
};

export const getStatusBgColor = (status: ClubStatus) => {
  return STATUS_BG_COLORS[status] ?? STATUS_BG_COLORS.cadet;
};

export const getStatusBorderColor = (status: ClubStatus) => {
  return STATUS_BORDER_COLORS[status] ?? STATUS_BORDER_COLORS.cadet;
};

export const getStatusGradientClass = (status: ClubStatus) => {
  return STATUS_GRADIENT_CLASSES[status] ?? STATUS_GRADIENT_CLASSES.cadet;
};
