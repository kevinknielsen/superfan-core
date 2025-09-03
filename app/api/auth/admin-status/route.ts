import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security.server';

/**
 * Check if the current user has admin access
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    // Now ADMIN_USER_IDS contains Privy DIDs, so we can check directly
    const userIsAdmin = isAdmin(auth.userId);
    
    console.log('[Admin Status] Admin check:', {
      userId: auth.userId,
      isAdmin: userIsAdmin,
      authType: auth.type
    });
    
    return NextResponse.json({ isAdmin: userIsAdmin });
  } catch (error) {
    console.error('[Admin Status] Error checking admin status:', error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}