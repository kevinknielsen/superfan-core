/**
 * Centralized user display name utilities
 * Ensures consistent display name derivation across components
 * Supports both Privy (web) and Farcaster (wallet app) users
 */

export const getDisplayName = (user: any): string => {
  // Farcaster user (wallet app) - check for Farcaster-specific fields first
  if (user?.displayName) return user.displayName;
  if (user?.username) return user.username;
  if (user?.fid) return `FC User #${user.fid}`;
  
  // Privy user (web) - check Privy-specific fields
  return user?.google?.name 
    || user?.twitter?.name 
    || user?.email?.address 
    || user?.phone?.number 
    || "User";
};

export const getDisplayEmail = (user: any): string => {
  // Farcaster users don't have email in the SDK user object
  return user?.email?.address || "";
};

export const getDisplayPhone = (user: any): string => {
  // Farcaster users don't have phone in the SDK user object
  return user?.phone?.number || "";
};
