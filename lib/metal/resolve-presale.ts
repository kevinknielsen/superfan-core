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
  const startTime = Date.now();
  
  try {
    // Validate input
    if (!presaleId?.trim()) {
      return { success: false, error: 'presaleId is required' };
    }

    const secretKey = process.env.METAL_SECRET_KEY;
    if (!secretKey) {
      throw new Error('METAL_SECRET_KEY environment variable is required');
    }

    console.log('[Metal Presale] Resolving presale', { 
      presaleId, 
      timestamp: new Date().toISOString() 
    });

    // Add timeout to prevent hanging requests (15 seconds)
    const controller = new AbortController();
    const TIMEOUT_MS = 15_000;
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    let response;
    try {
      response = await fetch('https://api.metal.build/merchant/presale/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': secretKey,
        },
        body: JSON.stringify({
          presaleId
        }),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      // Handle abort errors specifically
      if (fetchError?.name === 'AbortError') {
        console.error('[Metal Presale] Request timeout', {
          presaleId,
          timeout: TIMEOUT_MS,
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          error: `Request timed out after ${TIMEOUT_MS}ms`
        };
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to resolve presale' })) as { message?: string };
      console.error('[Metal Presale] API error', {
        presaleId,
        status: response.status,
        error: errorData.message,
        timestamp: new Date().toISOString()
      });
      throw new Error(errorData.message || 'Failed to resolve presale');
    }

    const result = await response.json();
    
    // Validate response structure
    if (!result || typeof result !== 'object') {
      console.error('[Metal Presale] Invalid response structure', {
        presaleId,
        response: result,
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        error: 'Invalid response structure from Metal API'
      };
    }

    if (!result.id || typeof result.id !== 'string') {
      console.error('[Metal Presale] Missing or invalid presale ID in response', {
        presaleId,
        response: result,
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        error: 'Invalid response: missing presale ID'
      };
    }

    if (!result.status || typeof result.status !== 'string') {
      console.error('[Metal Presale] Missing or invalid status in response', {
        presaleId,
        response: result,
        timestamp: new Date().toISOString()
      });
      return {
        success: false,
        error: 'Invalid response: missing status'
      };
    }
    
    const durationMs = Date.now() - startTime;
    console.log('[Metal Presale] ✅ Presale resolved', {
      presaleId: result.id,
      status: result.status,
      durationMs,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      presaleId: result.id,
      status: result.status
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error('[Metal Presale] Error resolving presale', {
      presaleId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
      timestamp: new Date().toISOString()
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve presale'
    };
  }
}

