import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security';

/**
 * Check if the current user has admin access
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    const userIsAdmin = isAdmin(auth.userId);
    
    return NextResponse.json({ isAdmin: userIsAdmin });
  } catch (error) {
    console.error('[Admin Status] Error checking admin status:', error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}