import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security.server';

/**
 * Debug endpoint to check admin authentication
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Admin guard - check before exposing any sensitive information
    const isAdminUser = isAdmin(auth.userId);
    if (!isAdminUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const debugInfo = {
      auth: {
        userId: auth.userId,
        type: auth.type
      },
      isAdminUser: isAdminUser,
      timestamp: new Date().toISOString()
    };
    
    console.log('[Debug Admin] Authentication debug:', { userId: auth.userId, isAdmin: isAdminUser });
    
    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('[Debug Admin] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
