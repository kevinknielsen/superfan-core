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

    // Update user in our database - handles both Privy and Farcaster
    // Note: Farcaster users won't typically have email/walletAddress from this endpoint
    const user = await getOrCreateUserFromAuth(auth);

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error in PUT /api/users/me:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
