import "server-only";

export type ResolvePresaleResult = 
  | { success: true; presaleId: string; status: string }
  | { success: false; error: string };

/**
 * Resolves (cancels/refunds) a Metal presale
 * 
 * This is used as a compensating action when presale creation succeeds
 * but database updates fail, to prevent orphaned presales.
 * 
 * See: https://docs.metal.build/resolve-presale
 * 
 * @param presaleId - The Metal presale ID to resolve
 * @returns Success result or error
 */
export async function resolveMetalPresale(
  presaleId: string
): Promise<ResolvePresaleResult> {
  try {
    const secretKey = process.env.METAL_SECRET_KEY;
    if (!secretKey) {
      throw new Error('METAL_SECRET_KEY environment variable is required');
    }

    console.log('[Metal Presale] Resolving presale:', presaleId);

    const response = await fetch('https://api.metal.build/merchant/presale/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secretKey,
      },
      body: JSON.stringify({
        presaleId
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to resolve presale' }));
      throw new Error(error.message || 'Failed to resolve presale');
    }

    const result = await response.json();
    
    console.log('[Metal Presale] ✅ Presale resolved:', {
      presaleId: result.id,
      status: result.status
    });

    return {
      success: true,
      presaleId: result.id,
      status: result.status
    };

  } catch (error) {
    console.error('[Metal Presale] Error resolving presale:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve presale'
    };
  }
}

