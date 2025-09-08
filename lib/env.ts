/**
 * Resolves the application URL based on environment variables and request context.
 * This helper ensures proper URL resolution across different deployment environments.
 */
export function resolveAppUrl(request?: Request): string {
  // First priority: NEXT_PUBLIC_APP_URL (trim trailing slash)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }

  // Second priority: derive from incoming request origin
  if (request) {
    try {
      const url = new URL(request.url);
      return url.origin;
    } catch (error) {
      console.warn('Failed to parse request URL:', error);
    }
  }

  // Third priority: VERCEL_URL for Vercel deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Final fallback: localhost for development
  return 'http://localhost:3000';
}
