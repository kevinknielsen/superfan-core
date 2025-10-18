import "server-only";
import { metal } from "@/lib/metal/server";
import { isAddress, getAddress } from "viem";

export interface CreatePresaleParams {
  campaignId: string;
  tokenAddress: string;
  price: number; // Price in USDC per token
  totalSupply?: number;
  lockDuration?: number; // Lock duration in seconds
}

export type CreatePresaleResult = 
  | { success: true; presaleId: string }
  | { success: false; error: string };

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
    // Validate inputs
    if (!campaignId?.trim()) {
      return { success: false, error: 'Invalid campaignId' };
    }
    if (!isAddress(tokenAddress)) {
      return { success: false, error: 'Invalid tokenAddress' };
    }
    if (!(Number.isFinite(price) && price > 0)) {
      return { success: false, error: 'Invalid price' };
    }
    if (totalSupply !== undefined && (!Number.isInteger(totalSupply) || totalSupply <= 0)) {
      return { success: false, error: 'Invalid totalSupply' };
    }
    if (lockDuration !== undefined && (!Number.isInteger(lockDuration) || lockDuration < 0)) {
      return { success: false, error: 'Invalid lockDuration' };
    }
    
    const checksummedToken = getAddress(tokenAddress);
    // Use canonical decimal string to avoid float artifacts
    const stablePrice = price.toFixed(2);

    console.log('[Metal Presale] Creating presale:', {
      campaignId,
      tokenAddress: checksummedToken,
      price: stablePrice,
      totalSupply,
      lockDuration
    });

    // Create presale via Metal's Merchant API
    const presale = await metal.createPresale({
      id: campaignId, // Use campaign ID as presale ID for consistency
      tokenAddress: checksummedToken,
      price: stablePrice,
      ...(totalSupply !== undefined && { totalSupply }),
      ...(lockDuration !== undefined && { lockDuration }),
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

