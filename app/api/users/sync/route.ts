import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/app/api/auth';
import { getOrCreateUser } from '@/lib/user-management';

/**
 * Sync user data from Privy to Supabase
 * This endpoint creates or updates the user record in our database
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the Privy token and get user data
    const privyAuth = await verifyPrivyToken(request);
    if (!privyAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user data from the request body
    const body = await request.json();
    const { email, name, walletAddress } = body;

    console.log('[User Sync] Syncing user:', {
      privyId: privyAuth.userId,
      email,
      name,
      walletAddress: walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null
    });

    // Create or update user in Supabase
    const user = await getOrCreateUser({
      privyId: privyAuth.userId,
      email: email || null,
      name: name || null,
      walletAddress: walletAddress || null,
    });

    console.log('[User Sync] User synced successfully:', user.id);

    return NextResponse.json({ 
      success: true, 
      user: {
        id: user.id,
        privy_id: user.privy_id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('[User Sync] Error syncing user:', error);
    return NextResponse.json(
      { error: "Failed to sync user" },
      { status: 500 }
    );
  }
}
