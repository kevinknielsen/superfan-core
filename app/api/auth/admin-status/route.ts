import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security.server';

/**
 * Check if the current user has admin access
 */
export async function GET(request: NextRequest) {
  try {
    // If in testing mode, return test response
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
      console.log('[Admin Status] TESTING MODE - Admin access open to everyone');
      return NextResponse.json({ 
        isAdmin: true,
        testingMode: true,
        timestamp: new Date().toISOString()
      });
    }

    // Real auth check
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      console.log('[Admin Status] No auth found');
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    console.log(`[Admin Status] Checking admin for user: ${auth.userId} (type: ${auth.type})`);
    
    const userIsAdmin = isAdmin(auth.userId);
    console.log(`[Admin Status] Final result - User: ${auth.userId}, isAdmin: ${userIsAdmin}`);
    
    return NextResponse.json({ 
      isAdmin: userIsAdmin,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Status] Error:', error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}