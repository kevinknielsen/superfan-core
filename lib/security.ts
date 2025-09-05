// Database-based admin checking (server-side only)
export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;

  // Only run on server-side to prevent exposing admin data to client
  if (typeof window !== "undefined") return false;

  try {
    // Use service client to bypass any RLS policies
    const { createServiceClient } = await import('@/app/api/supabase');
    const supabase = createServiceClient();
    
    console.log(`[Admin Check] Looking up user with privy_id: ${userId}`);
    
    // Look up user by privy_id (since userId from auth is the Privy DID)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, privy_id, role, email')
      .eq('privy_id', userId)
      .single();
    
    console.log(`[Admin Check] Database query result:`, { user, error });
    
    if (error) {
      console.error('Error looking up user for admin check:', error);
      console.error('Error details:', error);
      return false;
    }
    
    const isUserAdmin = user?.role === 'admin';
    console.log(`[Admin Check] User ${userId} found with role: ${user?.role}, isAdmin: ${isUserAdmin}`);
    
    return isUserAdmin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Synchronous version for compatibility (will be deprecated)
export function isAdminSync(userId: string | undefined): boolean {
  // Fallback to false for now - components should use the async version
  console.warn('isAdminSync is deprecated, use isAdmin instead');
  return false;
}

// Text truncation (React handles XSS protection automatically)
export function truncateText(
  input: string | null | undefined,
  maxLength: number = 500
): string {
  if (!input) return "";
  if (maxLength <= 0) return "";
  return input.trim().slice(0, maxLength);
}

export function validateEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Safe logging - only logs in development
export function debugLog(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

// Production-only logging
export function productionLog(message: string, ...args: any[]): void {
  // Only log in production environments
  if (process.env.NODE_ENV !== "development") {
    console.log(`[PROD] ${message}`, ...args);
  }
}

// Structured error logging for better log aggregation
export function errorLog(message: string, error?: any): void {
  const logData = {
    level: "error",
    message,
    error: error?.message || error,
    timestamp: new Date().toISOString(),
    ...(error?.stack && { stack: error.stack }),
  };
  console.error(JSON.stringify(logData));
}
