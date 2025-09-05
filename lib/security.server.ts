// SERVER-ONLY security utilities - never imported on client side
// Database-based admin checking (server-side only)
export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  
  try {
    // Use service client to bypass any RLS policies
    const { createServiceClient } = await import('@/app/api/supabase');
    const supabase = createServiceClient();
    
    // Look up user by privy_id (since userId from auth is the Privy DID)
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('privy_id', userId)
      .single();
    
    if (error) {
      console.error('Error looking up user for admin check:', error);
      return false;
    }
    
    return user?.role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Structured error logging for better log aggregation
export function errorLog(message: string, error?: any): void {
  const logData = {
    level: 'error',
    message,
    error: error?.message || error,
    timestamp: new Date().toISOString(),
    ...(error?.stack && { stack: error.stack })
  };
  console.error(JSON.stringify(logData));
}

// Production-only logging
export function productionLog(message: string, ...args: any[]): void {
  // Only log in production environments
  if (process.env.NODE_ENV !== 'development') {
    console.log(`[PROD] ${message}`, ...args);
  }
} 