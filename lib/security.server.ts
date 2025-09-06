// SERVER-ONLY security utilities - never imported on client side
// Environment-based admin checking (server-side only)
export function isAdmin(userId: string | undefined): boolean {
  if (!userId) return false;
  
  const adminIds = process.env.ADMIN_USER_IDS?.split(',')
    .map(id => id.trim()) // Remove whitespace to avoid mismatches
    .filter(Boolean) || [];
  return adminIds.includes(userId);
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