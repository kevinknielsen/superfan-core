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
    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    const adminIds = process.env.ADMIN_USER_IDS?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) || [];
    
    const debugInfo = {
      auth: {
        userId: auth.userId,
        type: auth.type
      },
      adminIds: adminIds,
      isMatch: adminIds.includes(auth.userId),
      isAdminResult: isAdmin(auth.userId),
      envVar: process.env.ADMIN_USER_IDS || 'NOT_SET'
    };
    
    console.log('[Debug Admin] Authentication debug:', debugInfo);
    
    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('[Debug Admin] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
