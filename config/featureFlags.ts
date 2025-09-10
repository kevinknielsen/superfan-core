// Feature flags for Superfan Core → Membership transition
// This file controls the availability of legacy funding features vs new membership features

export interface FeatureFlags {
  // Current membership features
  enableMembership: boolean;
  enableHouseAccounts: boolean;
  enableRedemptionCodes: boolean;
  
  // Admin features
  enableAdminPanel: boolean;
}

const flags: FeatureFlags = {
  // Current features - membership enabled, others gated by env vars
  enableMembership: true,
  enableHouseAccounts: process.env.ENABLE_HOUSE_ACCOUNTS === 'true',
  enableRedemptionCodes: process.env.ENABLE_REDEMPTION_CODES === 'true',
  enableAdminPanel: process.env.ENABLE_ADMIN_PANEL === 'true',
};

export { flags };

// Route guard utility
export function isRouteEnabled(path: string): boolean {
  // Check membership routes
  if (path.startsWith('/membership') && !flags.enableMembership) {
    return false;
  }
  
  // Check admin routes
  if (path.startsWith('/admin') && !flags.enableAdminPanel) {
    return false;
  }
  
  return true;
}

// API route guard utility (simplified - legacy routes already removed)
export function isApiRouteEnabled(path: string): boolean {
  // All current API routes are enabled by default
  // Individual route authorization handled at the route level
  return true;
}

// Component feature guard decorator
export function requireFeature(flag: keyof FeatureFlags) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      if (!flags[flag]) {
        throw new Error(`Feature ${flag} is disabled`);
      }
      return originalMethod.apply(this, args);
    };
  };
}

// React hook for checking features in components
export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  return flags[flag];
}

// Legacy route redirects (no longer needed - routes removed)
export function getLegacyRouteRedirect(path: string): string | null {
  return null;
}
