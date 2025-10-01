import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { getOrCreateUserFromAuth, getUserByPrivyId } from '@/lib/user-management';

/**
 * GET /api/users/me
 * Get or create the current authenticated user
 * Supports both Privy (web) and Farcaster (wallet app) users
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from our database, create if doesn't exist - handles both Privy and Farcaster
    const user = await getOrCreateUserFromAuth(auth);

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error in /api/users/me:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/me
 * Update current user profile
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, name, walletAddress } = body;

    // Ensure user exists first - handles both Privy and Farcaster
    const existingUser = await getOrCreateUserFromAuth(auth);
    
    // Import updateUser function
    const { updateUser } = await import('@/lib/user-management');
    
    // Update user with provided data
    // Note: Farcaster users won't typically have email/walletAddress, but we allow updates
    const updates: any = {};
    if (email !== undefined) updates.email = email;
    if (name !== undefined) updates.name = name;
    if (walletAddress !== undefined) updates.wallet_address = walletAddress;
    
    // Only update if there are changes
    const user = Object.keys(updates).length > 0 
      ? await updateUser(existingUser.id, updates)
      : existingUser;

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error in PUT /api/users/me:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
