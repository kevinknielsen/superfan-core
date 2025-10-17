import "server-only";
import { metal } from "@/lib/metal/server";

export interface CreatePresaleParams {
  campaignId: string;
  tokenAddress: string;
  price: number; // Price in USDC per token
  totalSupply?: number;
  lockDuration?: number; // Lock duration in seconds
}

export interface CreatePresaleResult {
  success: true;
  presaleId: string;
} | {
  success: false;
  error: string;
}

/**
 * Creates a Metal presale for a campaign
 * 
 * Uses Metal's Merchant API to create a presale
 * See: https://docs.metal.build/merchant-api/create-presale
 * 
 * @param params - Presale creation parameters
 * @returns Success with presale ID or error
 */
export async function createMetalPresale(
  params: CreatePresaleParams
): Promise<CreatePresaleResult> {
  const { campaignId, tokenAddress, price, totalSupply, lockDuration } = params;

  try {
    console.log('[Metal Presale] Creating presale:', {
      campaignId,
      tokenAddress,
      price,
      totalSupply,
      lockDuration
    });

    // Create presale via Metal's Merchant API
    const presale = await metal.createPresale({
      id: campaignId, // Use campaign ID as presale ID for consistency
      tokenAddress,
      price,
      ...(totalSupply && { totalSupply }),
      ...(lockDuration && { lockDuration }),
    });

    if (!presale || !presale.id) {
      console.error('[Metal Presale] Failed to create presale - no ID returned');
      return {
        success: false,
        error: 'Failed to create Metal presale - no presale ID returned'
      };
    }

    console.log('[Metal Presale] ✅ Presale created:', {
      presaleId: presale.id,
      campaignId
    });

    return {
      success: true,
      presaleId: presale.id
    };

  } catch (error) {
    console.error('[Metal Presale] Error creating presale:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Metal presale'
    };
  }
}

