import "server-only";
import { metal } from "@/lib/metal/server";

const TREASURY_HOLDER_ID = 'treasury_superfan';

export interface TreasuryInfo {
  holderId: string;
  address: string;
  isReady: boolean;
}

/**
 * Gets or creates the treasury Metal holder
 * This holder is used to buy presale tokens on behalf of Stripe purchasers
 * 
 * @returns Treasury holder info including deposit address
 */
export async function getOrCreateTreasury(): Promise<TreasuryInfo> {
  try {
    // Try to get existing treasury holder
    let holder = await metal.getHolder(TREASURY_HOLDER_ID);
    
    if (!holder) {
      console.log('[Treasury] Creating new treasury Metal holder...');
      holder = await metal.createUser(TREASURY_HOLDER_ID);
    }
    
    if (!holder || !holder.address) {
      throw new Error('Failed to get treasury holder address');
    }
    
    console.log('[Treasury] Treasury holder ready:', {
      holderId: holder.id,
      address: holder.address
    });
    
    return {
      holderId: holder.id,
      address: holder.address,
      isReady: true
    };
    
  } catch (error) {
    console.error('[Treasury] Error setting up treasury:', error);
    throw new Error(`Treasury setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets treasury holder ID for use in presale purchases
 */
export function getTreasuryHolderId(): string {
  return TREASURY_HOLDER_ID;
}

