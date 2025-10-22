import { useMutation, useQuery } from "@tanstack/react-query";
import { User } from "@privy-io/react-auth";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { metal } from "@/lib/metal/client";
import { isAddress } from "viem";

async function getOrCreateMetalHolder(id: string) {
  if (!id) {
    throw new Error("User ID is required to create or fetch metal holder");
  }
  
  try {
    const holder = await metal.getHolder(id);
    if (holder) return holder;
  } catch (error: unknown) {
    // If holder doesn't exist (404), create it
    // Check for 404 status or "not found" error
    const isNotFound = 
      (error as any)?.status === 404 ||
      (error as any)?.statusCode === 404 ||
      (error as any)?.code === 404 ||
      /not found|404/i.test((error as any)?.message || '');
    
    if (isNotFound) {
      console.log('[Metal Holder] Holder not found, creating new holder for:', id);
      return metal.createUser(id);
    }
    
    // For other errors, rethrow
    throw error;
  }
  
  // Fallback: if getHolder returned falsy but didn't throw, create holder
  return metal.createUser(id);
}

export function useMetalHolder() {
  const { user } = useUnifiedAuth();

  return useQuery({
    queryKey: ["metal holder", user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("User ID required");
      return getOrCreateMetalHolder(user.id);
    },
    enabled: !!user?.id,
    staleTime: 60_000, // Cache for 1 minute
    refetchOnWindowFocus: false, // Avoid hammering Metal API
  });
}

export function useBuyPresale() {
  const metalHolder = useMetalHolder();

  return useMutation({
    mutationKey: ["buy presale", metalHolder.data?.id],
    mutationFn: async (data: {
      user: User;
      campaignId: string;
      amount: number;
    }): Promise<any> => {
      if (!data.user.id) {
        throw new Error("User ID is required for presale purchase");
      }
      if (!metalHolder.data?.id) {
        throw new Error("Metal holder not initialized");
      }
      if (!(Number.isFinite(data.amount) && data.amount > 0)) {
        throw new Error("amount must be > 0");
      }
      
      try {
        return await metal.buyPresale(data.user.id, data.campaignId, data.amount);
      } catch (error: any) {
        // Log error structure to debug
        console.log('[Metal] buyPresale error structure:', {
          statusCode: error?.statusCode,
          code: error?.code,
          status: error?.status,
          message: error?.message,
          hasDetails: !!error?.details,
          hasData: !!error?.data
        });
        
        // Metal returns 202 Accepted for async processing - treat as success
        if (error?.statusCode === 202 || error?.code === 202 || error?.status === 202) {
          console.log('[Metal] 202 Accepted - async processing, treating as success', error.details);
          // Return the error details as response (contains transaction info)
          const response = error.details || error.data || error;
          
          // Validate expected structure
          if (!response || typeof response !== 'object') {
            throw new Error('Invalid 202 response structure from Metal API');
          }
          
          return response;
        }
        throw error;
      }
    },
  });
}

export type MetalBuyResponse = {
  transactionHash: string;
  sellAmount: number; // USDC spent
  buyAmount: number;  // tokens received
};

/**
 * Hook for buying tokens directly from Metal (not a presale)
 * Uses Metal's token trading API: POST /holder/:holderId/buy
 * See: https://docs.metal.build/buy-sell-tokens
 */
export function useBuyTokens() {
  const metalHolder = useMetalHolder();

  return useMutation<MetalBuyResponse, Error, {
    tokenAddress: string;
    usdcAmount: number;
    swapFeeBps?: number;
  }>({
    mutationKey: ["buy tokens", metalHolder.data?.id],
    mutationFn: async (data) => {
      if (!metalHolder.data?.id) {
        throw new Error("Metal holder not initialized");
      }
      
      // Client-side validation
      if (!data.tokenAddress || typeof data.tokenAddress !== 'string' || !isAddress(data.tokenAddress)) {
        throw new Error('Valid tokenAddress is required');
      }
      if (!(Number.isFinite(data.usdcAmount) && data.usdcAmount > 0)) {
        throw new Error('usdcAmount must be > 0');
      }
      
      const apiKey = process.env.NEXT_PUBLIC_METAL_PUBLIC_KEY;
      if (!apiKey) {
        throw new Error('Metal public API key is not configured');
      }
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      
      const response = await fetch(
        `https://api.metal.build/holder/${metalHolder.data.id}/buy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            tokenAddress: data.tokenAddress,
            usdcAmount: Number(data.usdcAmount.toFixed(2)), // Stable decimal
            swapFeeBps: data.swapFeeBps,
          }),
          signal: controller.signal,
        }
      ).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to buy tokens' })) as { message?: string };
        throw new Error(errorData.message || 'Failed to buy tokens');
      }

      const result = await response.json();
      return result as MetalBuyResponse;
    },
  });
}
