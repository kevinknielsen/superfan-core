import "server-only";
import { metal } from "@/lib/metal/server";

const TREASURY_HOLDER_ID = 'treasury_superfan';

// In-flight promise to prevent concurrent treasury creation
let treasuryInFlight: Promise<TreasuryInfo> | null = null;

const TREASURY_TIMEOUT_MS = 15_000;

export interface TreasuryInfo {
  holderId: string;
  address: string;
}

// Helper to add timeout to async operations
// Note: This uses Promise.race which does not cancel the underlying operation.
// The Metal API client does not currently support AbortSignal, so the underlying
// request may continue running even after timeout. Application-level code should
// monitor and log hung requests.
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Gets or creates the treasury Metal holder
 * This holder is used to buy presale tokens on behalf of Stripe purchasers
 * 
 * @returns Treasury holder info including deposit address
 */
export async function getOrCreateTreasury(): Promise<TreasuryInfo> {
  // Return in-flight promise if already creating
  if (treasuryInFlight) return treasuryInFlight;
  
  treasuryInFlight = (async () => {
    try {
      // Try to get existing treasury holder (with timeout)
      let holder = await withTimeout(
        metal.getHolder(TREASURY_HOLDER_ID),
        TREASURY_TIMEOUT_MS
      );
      
      if (!holder) {
        console.log('[Treasury] Creating new treasury Metal holder...');
        try {
          holder = await withTimeout(
            metal.createUser(TREASURY_HOLDER_ID),
            TREASURY_TIMEOUT_MS
          );
        } catch (e: unknown) {
          // If concurrently created, re-fetch
          // Metal API returns 409 status code for conflicts
          const errorObj = e as any; // Type assertion for error object inspection
          const isConflict = errorObj?.code === 409 || 
                           errorObj?.status === 409 || 
                           errorObj?.statusCode === 409 ||
                           // Fallback to message parsing (less reliable)
                           /exists|conflict|duplicate/i.test(String(errorObj?.message || ''));
          
          if (isConflict) {
            console.log('[Treasury] Holder created concurrently (409 or exists), re-fetching...', {
              errorCode: errorObj?.code,
              errorStatus: errorObj?.status,
              errorMessage: errorObj?.message
            });
            holder = await withTimeout(
              metal.getHolder(TREASURY_HOLDER_ID),
              TREASURY_TIMEOUT_MS
            );
          } else {
            // Unknown error - log and rethrow
            console.error('[Treasury] Unexpected error creating holder:', {
              error: e,
              code: errorObj?.code,
              status: errorObj?.status,
              message: errorObj?.message
            });
            throw e;
          }
        }
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
        address: holder.address
      };
      
    } catch (error) {
      console.error('[Treasury] Error setting up treasury:', error);
      throw new Error(`Treasury setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      treasuryInFlight = null;
    }
  })();
  
  return treasuryInFlight;
}

/**
 * Gets treasury holder ID for use in presale purchases
 */
export function getTreasuryHolderId(): string {
  return TREASURY_HOLDER_ID;
}

