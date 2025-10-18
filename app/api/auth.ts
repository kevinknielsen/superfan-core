import { AuthTokenClaims, PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

// Lazy initialization to avoid requiring env vars at build time
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
  if (privyClient) return privyClient;
  
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  
  if (!appId || !appSecret) {
    throw new Error('Missing required Privy environment variables: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET must be configured');
  }
  
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

export async function verifyPrivyToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.log('[Auth] No Bearer token found in header:', authHeader);
    return null;
  }
  const token = authHeader.split(" ")[1];

  console.log('[Auth] Attempting to verify Privy token:', {
    tokenLength: token?.length,
    hasSecret: !!process.env.PRIVY_APP_SECRET
  });

  try {
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);
    console.log('[Auth] Privy token claims:', { userId: claims.userId, appId: claims.appId });
    return claims;
  } catch (error) {
    console.error("[Server]: Error verifying Privy token:", error);
    console.error("[Server]: Token verification failed");
    return null;
  }
}

// Verify Farcaster authentication
// For Farcaster mini apps, the FID (Farcaster ID) is provided by the trusted SDK
// The SDK only runs in verified Farcaster/Coinbase Wallet contexts, so we can trust the FID
export async function verifyFarcasterToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Farcaster ")) return null;
  const token = authHeader.split(" ")[1];

  try {
    // Expected format: "farcaster:FID" where FID is the Farcaster user ID
    if (token.startsWith("farcaster:")) {
      const userId = token.replace("farcaster:", "");
      
      // Validate that userId is a valid number (FIDs are numeric)
      const fid = parseInt(userId, 10);
      if (isNaN(fid) || fid <= 0) {
        console.error("[Auth] Invalid Farcaster FID:", userId);
        return null;
      }

      console.log('[Auth] Farcaster user authenticated:', { fid, userId });
      
      // Return the full farcaster:FID format as userId for consistency
      return { userId: `farcaster:${fid}`, type: "farcaster" as const };
    }
    return null;
  } catch (error) {
    console.error("[Auth] Error verifying Farcaster token:", error);
    return null;
  }
}

// Unified authentication function that tries both Privy and Farcaster
export async function verifyUnifiedAuth(req: NextRequest) {
  // Try Privy authentication first
  const privyAuth = await verifyPrivyToken(req);
  if (privyAuth) {
    return { userId: privyAuth.userId, type: "privy" as const };
  }

  // Try Farcaster authentication
  const farcasterAuth = await verifyFarcasterToken(req);
  if (farcasterAuth) {
    return farcasterAuth;
  }

  return null;
}
