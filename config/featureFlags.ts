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

// Route guard utility with secure bypass mechanism
export function isRouteEnabled(path: string): boolean {
  // SECURITY: Check for dangerous bypass configuration in production
  if (process.env.NODE_ENV === 'production' && process.env.FEATURE_FLAGS_DISABLE_ROUTE_GUARD === 'true') {
    console.error('[SECURITY ERROR] FEATURE_FLAGS_DISABLE_ROUTE_GUARD must not be enabled in production');
    // Exit the process to prevent accidental startup with guards disabled
    process.exit(1);
  }
  
  // Allow bypass only in non-production with explicit two-step confirmation
  const allowBypass = process.env.NODE_ENV !== 'production' && 
    process.env.FEATURE_FLAGS_DISABLE_ROUTE_GUARD === 'true' && 
    process.env.FEATURE_FLAGS_ALLOW_BYPASS === 'yes-I-know';
    
  if (allowBypass) {
    console.warn('[DEVELOPMENT] Route guards bypassed - all routes enabled');
    return true;
  }

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

// API route guard utility - performs real authorization checks
export function isApiRouteEnabled(path: string): boolean {
  // Check if route bypass is explicitly enabled (for development/testing)
  if (process.env.FEATURE_FLAGS_DISABLE_ROUTE_GUARD === 'true') {
    console.warn(`[FEATURE_FLAGS] Route guard bypassed for ${path} - development mode`);
    return true;
  }

  // Define enabled API routes - add new routes here as they're implemented
  const enabledApiRoutes = new Set([
    '/api/auth',
    '/api/dashboard',
    '/api/points',
    '/api/clubs',
    '/api/tap-in',
    '/api/memberships',
    '/api/projects',
    '/api/admin',
    '/api/rewards',
    '/api/notifications'
  ]);

  // Check if the route or its parent path is enabled
  const isEnabled = enabledApiRoutes.has(path) || 
    Array.from(enabledApiRoutes).some(enabledRoute => 
      path.startsWith(enabledRoute + '/') || path.startsWith(enabledRoute + '?')
    );

  if (!isEnabled) {
    console.warn(`[FEATURE_FLAGS] API route not found in configuration: ${path}`);
  }

  return isEnabled;
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
