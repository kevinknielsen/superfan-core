import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if the current user has admin access
 * TEMPORARY: Open to everyone for testing
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Admin Status] TESTING MODE - Admin access open to everyone');
    
    // Always return true for testing
    return NextResponse.json({ 
      isAdmin: true,
      testingMode: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Admin Status] Error:', error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}
