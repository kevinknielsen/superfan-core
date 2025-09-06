import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security.server';

export async function GET(request: NextRequest) {
  // Only enable in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  // Verify authentication
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin check - can be disabled via environment variable for testing
  if (process.env.SKIP_ADMIN_CHECKS !== 'true' && !(await isAdmin(auth.userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    adminUserIds: process.env.ADMIN_USER_IDS ? '[REDACTED]' : undefined,
    enableAdminPanel: process.env.ENABLE_ADMIN_PANEL,
    hasAdminEnv: !!process.env.ADMIN_USER_IDS,
    envLength: process.env.ADMIN_USER_IDS?.length || 0,
    timestamp: new Date().toISOString()
  });
}