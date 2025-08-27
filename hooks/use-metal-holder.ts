import { useQuery } from "@tanstack/react-query";
import { getOrCreateMetalHolder } from "@/app/api/sdk";
import { User } from "@privy-io/react-auth";
import { useFarcaster } from "@/lib/farcaster-context";

// Define proper type for Farcaster user
interface FarcasterUser {
  fid: number;
}

// Helper to get user identifier for both contexts
function getUserIdentifier(
  user: User | null, 
  farcasterUser: FarcasterUser | null, 
  isInWalletApp: boolean
): string | null {
  // In wallet app context, use Farcaster user
  if (isInWalletApp && farcasterUser?.fid) {
    return farcasterUser.fid.toString();
  }
  
  // In wallet app context but no Farcaster user, return null
  if (isInWalletApp) {
    return null;
  }
  
  // In web context, we need a Privy user
  return user?.id || null;
}

export function useMetalHolder({ user }: { user: User | null }) {
  const { isInWalletApp, user: farcasterUser } = useFarcaster();
  const userIdentifier = getUserIdentifier(user, farcasterUser, isInWalletApp);
  
  return useQuery({
    queryKey: ["metal holder", userIdentifier, isInWalletApp],
    queryFn: async () => {
      console.log("[useMetalHolder] Fetching metal holder:", {
        userIdentifier,
        isInWalletApp,
        privyUser: user?.id,
        farcasterUser: farcasterUser?.fid,
      });
      
      console.log("[useMetalHolder] Metal holder functionality disabled in Club platform");
      
      // Return a default holder structure for compatibility
      // This maintains compatibility with existing components that expect Metal holder data
      return {
        id: user?.id || 'unknown',
        address: user?.wallet?.address || '',
        usdcBalance: 0,
        projectTokens: [],
        tokens: [],
      };
    },
    enabled: false, // Disable Metal holder queries entirely
    // Fast cache since data is static
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
