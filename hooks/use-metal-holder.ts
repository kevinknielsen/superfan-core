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
      
      try {
        const holder = await getOrCreateMetalHolder();
        console.log("[useMetalHolder] Successfully fetched holder:", holder);

        const usdcTokenIndex = holder.tokens.findIndex(
          (t) =>
            t.address.toLowerCase() ===
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase()
        );
        
        // Handle USDC token properly - only remove if found
        let projectTokens = holder.tokens;
        let usdcBalance = 0;
        
        if (usdcTokenIndex !== -1) {
          projectTokens = holder.tokens.toSpliced(usdcTokenIndex, 1);
          usdcBalance = holder.tokens[usdcTokenIndex]?.balance || 0;
        }

        return {
          ...holder,
          usdcBalance,
          projectTokens,
        };
      } catch (error) {
        console.error("[useMetalHolder] Error fetching metal holder:", error);
        console.error("[useMetalHolder] Context debug:", {
          isInWalletApp,
          userIdentifier,
          farcasterUser: farcasterUser?.fid,
          privyUser: user?.id,
        });
        throw error;
      }
    },
    enabled: !!userIdentifier,
    // Balanced for wallet/holder data (balance can change but not too frequently)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
    // Reasonable caching for wallet data
    staleTime: 15 * 1000, // 15 seconds - balance changes occasionally
    gcTime: 3 * 60 * 1000, // 3 minutes garbage collection
    // Balanced refetch strategies
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
