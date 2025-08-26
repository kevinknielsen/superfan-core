// Feature flagging utilities for subdomain-specific features
// This file is separate from utils.ts to avoid Edge Runtime issues in middleware

export const MANAGER_ROUTES = ["/launch", "/projects", "/review"] as const;

export const getAppType = (hostname?: string) => {
  const host =
    hostname || (typeof window !== "undefined" ? window.location.hostname : "");
  if (host.startsWith("manager.")) return "manager";
  if (host.startsWith("app.")) return "main";
  // SSR fallback - default to main for localhost/development
  return "main";
};

export const isManagerApp = (hostname?: string) => {
  return getAppType(hostname) === "manager";
};

export const isMainApp = (hostname?: string) => {
  return getAppType(hostname) === "main";
};

// Check if a route should be accessible on current app type
export const isRouteAllowed = (pathname: string, hostname?: string) => {
  if (isManagerApp(hostname)) {
    return (
      MANAGER_ROUTES.some((route) => {
        if (route === '/projects') {
          // Only allow /projects (exact match), not /projects/[id] on manager
          return pathname === '/projects';
        }
        return pathname === route || pathname.startsWith(`${route}/`);
      }) ||
      pathname === "/" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/profile")
    );
  }

  if (isMainApp(hostname)) {
    return !MANAGER_ROUTES.some((route) => {
      if (route === '/projects') {
        // Only disallow /projects (exact match), not /projects/[id]
        return pathname === '/projects';
      }
      return pathname === route || pathname.startsWith(`${route}/`);
    });
  }

  return true;
};

// Get redirect URL for cross-subdomain navigation
export const getRedirectUrl = (pathname: string, currentDomain?: string) => {
  const isManager = MANAGER_ROUTES.some((route) => {
    if (route === '/projects') {
      // Only redirect /projects (exact match), not /projects/[id]
      return pathname === '/projects';
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  });

  if (isManager) {
    return currentDomain
      ? `https://${currentDomain.replace("app.", "manager.")}${pathname}`
      : `https://manager.superfan.one${pathname}`;
  } else {
    return currentDomain
      ? `https://${currentDomain.replace("manager.", "app.")}${pathname}`
      : `https://app.superfan.one${pathname}`;
  }
};
