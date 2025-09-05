import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { createServiceClient } from '@/app/api/supabase';

/**
 * Check if the current user has admin access
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      console.log('[Admin Status] No auth found');
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    console.log(`[Admin Status] Checking admin for user: ${auth.userId} (type: ${auth.type})`);
    
    // Check if this is your admin user (temporary for testing)
    if (auth.userId === 'did:privy:cm9kbrlj900del50mclhziloz') {
      console.log(`[Admin Status] Recognized admin user: ${auth.userId}`);
      return NextResponse.json({ isAdmin: true });
    }
    
    // Direct database check (same as debug test that worked)
    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('privy_id', auth.userId)
      .single();
    
    if (error) {
      console.error('[Admin Status] Database error:', error);
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }
    
    const userIsAdmin = user?.role === 'admin';
    console.log(`[Admin Status] Final result - User: ${auth.userId}, role: ${user?.role}, isAdmin: ${userIsAdmin}`);
    
    return NextResponse.json({ isAdmin: userIsAdmin });
  } catch (error) {
    console.error('[Admin Status] Error checking admin status:', error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}