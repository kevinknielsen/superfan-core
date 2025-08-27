"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isRouteAllowed, MANAGER_ROUTES } from "@/lib/feature-flags";
import { ManagerBetaWarning } from "./ManagerBetaWarning";

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showBetaWarning, setShowBetaWarning] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isAllowed = isRouteAllowed(pathname);
    
    if (!isAllowed) {
      // Check if this is a manager route being accessed from main app
      const isManagerRoute = MANAGER_ROUTES.some((route) => {
        if (route === '/projects') {
          // Only redirect /projects (exact match), not /projects/[id]
          return pathname === '/projects';
        }
        return pathname === route || pathname.startsWith(`${route}/`);
      });
      
      if (isManagerRoute && window.location.hostname.startsWith('app.')) {
        // Show beta warning instead of immediate redirect in development
        if (process.env.NODE_ENV === 'development') {
          setShowBetaWarning(true);
          return;
        }
        
        // In production, redirect to manager subdomain
        window.location.href = `https://manager.superfan.one${pathname}`;
        return;
      }
      
      // For other cases, redirect to main app
      window.location.href = `https://superfan.one${pathname}`;
    }
  }, [pathname, router]);

  // Don't render children if route is not allowed and we're redirecting
  if (!isRouteAllowed(pathname)) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Redirecting...</h1>
            <p className="text-muted-foreground">
              Taking you to the right place
            </p>
          </div>
        </div>
        
        {/* Beta Warning Modal */}
        <ManagerBetaWarning
          isOpen={showBetaWarning}
          onOpenChange={setShowBetaWarning}
        />
      </>
    );
  }

  return <>{children}</>;
} 