/**
 * Centralized user display name utilities
 * Ensures consistent display name derivation across components
 */

export const getDisplayName = (user: any): string => {
  return user?.google?.name 
    || user?.twitter?.name 
    || user?.email?.address 
    || user?.phone?.number 
    || "User";
};

export const getDisplayEmail = (user: any): string => {
  return user?.email?.address || "";
};

export const getDisplayPhone = (user: any): string => {
  return user?.phone?.number || "";
};
