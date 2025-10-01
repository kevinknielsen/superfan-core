import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { getOrCreateUser, getOrCreateFarcasterUser } from '@/lib/user-management';

// Type definition for Farcaster user with farcaster_id field
interface FarcasterUserResponse {
  id: string;
  farcaster_id: string;
  name: string | null;
  email: string | null;
  privy_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Sync user data from Privy or Farcaster to Supabase
 * This endpoint creates or updates the user record in our database
 * Supports both Privy (web) and Farcaster (wallet app) authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication (supports both Privy and Farcaster)
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user data from the request body
    const body = await request.json();
    const { email, name, walletAddress, farcasterUsername, farcasterDisplayName, farcasterPfpUrl } = body;

    if (auth.type === 'farcaster') {
      // Farcaster authentication
      console.log('[User Sync] Syncing Farcaster user:', {
        farcasterFid: auth.userId,
        username: farcasterUsername,
        displayName: farcasterDisplayName
      });

      const farcasterUser = await getOrCreateFarcasterUser({
        farcasterFid: auth.userId,
        username: farcasterUsername || null,
        displayName: farcasterDisplayName || null,
        pfpUrl: farcasterPfpUrl || null,
      }) as FarcasterUserResponse;

      console.log('[User Sync] Farcaster user synced successfully:', farcasterUser.id);

      return NextResponse.json({ 
        success: true, 
        user: {
          id: farcasterUser.id,
          farcaster_id: farcasterUser.farcaster_id,
          name: farcasterUser.name
        }
      });
    } else {
      // Privy authentication
      console.log('[User Sync] Syncing Privy user:', {
        privyId: auth.userId,
        email,
        name,
        walletAddress: walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null
      });

      const privyUser = await getOrCreateUser({
        privyId: auth.userId,
        email: email || null,
        name: name || null,
        walletAddress: walletAddress || null,
      });

      console.log('[User Sync] Privy user synced successfully:', privyUser.id);

      return NextResponse.json({ 
        success: true, 
        user: {
          id: privyUser.id,
          privy_id: privyUser.privy_id,
          email: privyUser.email,
          name: privyUser.name
        }
      });
    }
  } catch (error) {
    console.error('[User Sync] Error syncing user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync user" },
      { status: 500 }
    );
  }
}
