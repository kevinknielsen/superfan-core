// Feature flags for Superfan Core → Membership transition
// This file controls the availability of legacy funding features vs new membership features

export interface FeatureFlags {
  // Legacy funding features (ALL DISABLED during transition)
  enableFunding: boolean;
  enableTokens: boolean;
  enablePresales: boolean;
  enableRevenueSplits: boolean;
  enableCapTable: boolean;
  enableProjectReview: boolean;
  enableMetal: boolean;
  enableContributions: boolean;
  
  // New membership features
  enableMembership: boolean;
  enableHouseAccounts: boolean;
  enableRedemptionCodes: boolean;
  
  // Admin features
  enableAdminPanel: boolean;
}

const flags: FeatureFlags = {
  // Legacy features - ALL DISABLED
  enableFunding: false,
  enableTokens: false,
  enablePresales: false,
  enableRevenueSplits: false,
  enableCapTable: false,
  enableProjectReview: false,
  enableMetal: false,
  enableContributions: false,
  
  // New features - membership enabled, others gated by env vars
  enableMembership: true,
  enableHouseAccounts: process.env.ENABLE_HOUSE_ACCOUNTS === 'true',
  enableRedemptionCodes: process.env.ENABLE_REDEMPTION_CODES === 'true',
  enableAdminPanel: process.env.ENABLE_ADMIN_PANEL === 'true',
};

export { flags };

// Route guard utility
export function isRouteEnabled(path: string): boolean {
  // Legacy funding routes that should be blocked
  const legacyRoutes = [
    '/launch',
    '/your-projects', 
    '/review',
    '/moonpay-test'
  ];
  
  // Block specific project sub-routes
  const legacyProjectRoutes = [
    '/projects/[id]/cap-table',
    '/projects/[id]/collaborators' // Will be simplified later
  ];
  
  // Check for exact legacy route matches
  if (legacyRoutes.includes(path)) {
    return false;
  }
  
  // Check for legacy project sub-routes
  if (legacyProjectRoutes.some(route => {
    const pattern = route.replace('[id]', '\\w+');
    return new RegExp(`^${pattern}$`).test(path);
  })) {
    return false;
  }
  
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

// API route guard utility
export function isApiRouteEnabled(path: string): boolean {
  const legacyApiRoutes = [
    '/api/contributions',
    '/api/funded-projects',
    '/api/presales',
    '/api/metal',
    '/api/project/[projectId]/financing'
  ];
  
  return !legacyApiRoutes.some(route => {
    if (route.includes('[projectId]')) {
      const pattern = route.replace('[projectId]', '\\w+');
      return new RegExp(`^${pattern}$`).test(path);
    }
    return path === route;
  });
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

// Legacy route redirects
export function getLegacyRouteRedirect(path: string): string | null {
  const redirectMap: Record<string, string> = {
    '/launch': '/membership',
    '/your-projects': '/',
    '/review': '/',
    '/moonpay-test': '/',
  };
  
  return redirectMap[path] || null;
}
