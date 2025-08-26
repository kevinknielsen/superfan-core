// Environment-based admin checking (server-side only)
export function isAdmin(userId: string | undefined): boolean {
  if (!userId) return false;

  // Only run on server-side to prevent exposing admin IDs to client
  if (typeof window !== "undefined") return false;

  const adminIds =
    process.env.ADMIN_USER_IDS?.split(",")
      .map((id) => id.trim()) // Remove whitespace to avoid mismatches
      .filter(Boolean) || [];
  return adminIds.includes(userId);
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
