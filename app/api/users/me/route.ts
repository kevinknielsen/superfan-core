import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { getOrCreateUser, getUserByPrivyId } from '@/lib/user-management';

/**
 * GET /api/users/me
 * Get or create the current authenticated user
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

    // Get user from our membership database, create if doesn't exist
    const user = await getOrCreateUser({
      privyId: auth.userId,
      // We'll get additional user info from Privy if needed
    });

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

    // Update user in our database
    const user = await getOrCreateUser({
      privyId: auth.userId,
      email,
      name,
      walletAddress,
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error in PUT /api/users/me:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
