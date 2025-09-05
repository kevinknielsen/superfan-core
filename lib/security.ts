// Client-safe security utilities only
// Import isAdmin from './security.server' in server-only files

/** @deprecated Use the async isAdmin() instead. */
export function isAdminSync(userId: string | undefined): boolean {
  throw new Error('isAdminSync is deprecated and no longer functional. Use the async isAdmin() function instead.');
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
