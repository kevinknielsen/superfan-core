import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/api/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const testUserId = 'did:privy:cm9kbrlj900del50mclhziloz';
    
    console.log(`[Debug] Testing admin lookup for: ${testUserId}`);
    
    // Test the exact query we use in the admin check
    const { data: user, error } = await supabase
      .from('users')
      .select('id, privy_id, role, email')
      .eq('privy_id', testUserId)
      .single();
    
    console.log(`[Debug] Query result:`, { user, error });
    
    // Also get all admin users
    const { data: allAdmins, error: adminError } = await supabase
      .from('users')
      .select('id, privy_id, role, email')
      .eq('role', 'admin');
    
    console.log(`[Debug] All admin users:`, { allAdmins, adminError });
    
    return NextResponse.json({
      testUserId,
      user,
      error,
      allAdmins,
      adminError,
      isAdmin: user?.role === 'admin'
    });
    
  } catch (error) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
