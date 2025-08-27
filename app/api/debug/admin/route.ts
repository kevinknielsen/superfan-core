import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { isAdmin } from '@/lib/security';

/**
 * Debug endpoint to check admin authentication
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    
    const adminIds = process.env.ADMIN_USER_IDS?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) || [];
    
    const debugInfo = {
      auth: auth ? {
        userId: auth.userId,
        type: auth.type
      } : null,
      adminIds: adminIds,
      isMatch: auth ? adminIds.includes(auth.userId) : false,
      isAdminResult: auth ? isAdmin(auth.userId) : false,
      envVar: process.env.ADMIN_USER_IDS || 'NOT_SET'
    };
    
    console.log('[Debug Admin] Authentication debug:', debugInfo);
    
    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('[Debug Admin] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
