// SERVER-ONLY security utilities - never imported on client side

import type { SupabaseClient } from '@supabase/supabase-js';
let cachedServiceClient: SupabaseClient | null = null;

// Safe logging - only logs in development
function debugLog(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

// Structured error logging for better log aggregation
function errorLog(message: string, error?: any): void {
  const logData = {
    level: "error",
    message,
    error: error?.message || error,
    timestamp: new Date().toISOString(),
    ...(error?.stack && { stack: error.stack }),
  };
  console.error(JSON.stringify(logData));
}

// Database-based admin checking (server-side only)
export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;

  // Only run on server-side to prevent exposing admin data to client
  if (typeof window !== "undefined" || process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('isAdmin must only be called from server-side code');
  }
  
  try {
    // Use cached service client to bypass any RLS policies
    if (!cachedServiceClient) {
      const { createServiceClient } = await import('@/app/api/supabase');
      cachedServiceClient = createServiceClient();
    }
    const supabase = cachedServiceClient;
    
    debugLog('[Admin Check] Looking up user');
    
    // Look up user by privy_id (since userId from auth is the Privy DID)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, privy_id, role, email')
      .eq('privy_id', userId)
      .single();
    
    debugLog('[Admin Check] Database query completed', { hasError: !!error, role: user?.role });
    
    if (error) {
      errorLog('Error looking up user for admin check:', error);
      return false;
    }
    
    const isUserAdmin = user?.role === 'admin';
    debugLog(`[Admin Check] Admin status determined: ${isUserAdmin}`);
    
    return isUserAdmin;
  } catch (error) {
    errorLog('Error checking admin status:', error);
    return false;
  }
}

// Production-only logging
export function productionLog(message: string, ...args: any[]): void {
  // Only log in production environments
  if (process.env.NODE_ENV !== 'development') {
    console.log(`[PROD] ${message}`, ...args);
  }
} 