import { AuthTokenClaims, PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export async function verifyPrivyToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.log('[Auth] No Bearer token found in header:', authHeader);
    return null;
  }
  const token = authHeader.split(" ")[1];

  console.log('[Auth] Attempting to verify Privy token:', {
    tokenLength: token?.length,
    tokenPrefix: token?.substring(0, 20) + '...',
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    hasSecret: !!process.env.PRIVY_APP_SECRET
  });

  try {
    const claims = await privy.verifyAuthToken(token);
    console.log('[Auth] Privy token claims:', { userId: claims.userId, appId: claims.appId });
    return claims;
  } catch (error) {
    console.error("[Server]: Error verifying Privy token:", error);
    console.error("[Server]: Token that failed:", token?.substring(0, 50) + '...');
    return null;
  }
}

// New function to verify Farcaster authentication
export async function verifyFarcasterToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Farcaster ")) return null;
  const token = authHeader.split(" ")[1];

  try {
    // For wallet apps, we expect a simple token format: "farcaster:USER_ID"
    // In a real implementation, you might want to verify this token with Farcaster's API
    if (token.startsWith("farcaster:")) {
      const userId = token.replace("farcaster:", "");
      return { userId, type: "farcaster" as const };
    }
    return null;
  } catch (error) {
    console.error("[Server]: Error verifying Farcaster token:", error);
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
