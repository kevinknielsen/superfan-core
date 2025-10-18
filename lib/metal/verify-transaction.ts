import "server-only";
import { metal } from "@/lib/metal/server";

// Type for Metal API transaction objects
export interface MetalTransaction {
  transactionHash?: string;
  amount?: string;
  status?: string;
  from?: string;
  to?: string;
  tokenAddress?: string;
  blockNumber?: number;
  blockHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
}

export interface VerifyTransactionParams {
  metal_holder_id: string;
  tx_hash: string;
  expected_amount_usdc: number;
  tolerance?: number; // Tolerance in USDC, default 0.01
}

export type VerifyTransactionResult = 
  | { success: true }
  | { success: false; error: string; status: number };

/**
 * Verifies a USDC transaction through Metal's server API
 * 
 * This function:
 * - Fetches holder transactions from Metal
 * - Finds the matching transaction by hash
 * - Validates transaction amount (within tolerance)
 * - Verifies transaction status is successful
 * 
 * @param params - Transaction verification parameters
 * @returns Success result or error with HTTP status code
 */
export async function verifyMetalTransaction(
  params: VerifyTransactionParams
): Promise<VerifyTransactionResult> {
  const { metal_holder_id, tx_hash, expected_amount_usdc, tolerance = 0.01 } = params;

  try {
    // Normalize tx_hash to lowercase with 0x prefix
    const normalizedTxHash = (tx_hash.startsWith('0x') ? tx_hash : `0x${tx_hash}`).toLowerCase();

    console.log('[Metal Verification] Verifying transaction:', {
      holder: metal_holder_id,
      txHash: normalizedTxHash,
      expectedAmount: expected_amount_usdc
    });

    // Fetch holder's transactions from Metal
    const holderTransactions = await metal.getTransactions(metal_holder_id) as MetalTransaction[];
    
    if (!holderTransactions || !Array.isArray(holderTransactions)) {
      console.error('[Metal Verification] Failed to fetch holder transactions');
      return {
        success: false,
        error: 'Unable to verify transaction with Metal. Please try again.',
        status: 500
      };
    }

    // Find the transaction matching this tx_hash
    const matchingTransaction = holderTransactions.find((tx: MetalTransaction) => 
      tx.transactionHash?.toLowerCase() === normalizedTxHash
    );

    if (!matchingTransaction) {
      console.error('[Metal Verification] Transaction not found in Metal holder records:', {
        txHash: normalizedTxHash,
        holderTransactionsCount: holderTransactions.length
      });
      return {
        success: false,
        error: 'Transaction not found in Metal records. The transaction may still be processing or was not completed through Metal.',
        status: 400
      };
    }

    // Verify the transaction amount matches expected
    // Use fixed-decimal math (USDC has 6 decimals) for precise comparison
    const actualMicros = Math.round(parseFloat(matchingTransaction.amount || '0') * 1_000_000);
    const expectedMicros = Math.round(expected_amount_usdc * 1_000_000);
    const toleranceMicros = Math.round(tolerance * 1_000_000);
    const actualAmount = actualMicros / 1_000_000; // Compute once for reuse
    
    if (Math.abs(actualMicros - expectedMicros) > toleranceMicros) {
      console.error('[Metal Verification] Amount mismatch:', {
        expected: expected_amount_usdc,
        actual: actualAmount,
        difference: Math.abs(actualMicros - expectedMicros) / 1_000_000,
        tolerance
      });
      return {
        success: false,
        error: `Transaction amount mismatch: expected ${expected_amount_usdc} USDC, got ${actualAmount} USDC`,
        status: 400
      };
    }

    // Verify transaction was successful (require explicit status)
    const okStatuses = new Set(['success', 'completed']);
    if (!okStatuses.has((matchingTransaction.status || '').toLowerCase())) {
      console.error('[Metal Verification] Transaction not successful:', {
        status: matchingTransaction.status || 'undefined'
      });
      return {
        success: false,
        error: `Transaction status is ${matchingTransaction.status || 'undefined'}, not successful`,
        status: 400
      };
    }

    console.log('[Metal Verification] ✅ Transaction verified:', {
      txHash: normalizedTxHash,
      amount: actualAmount,
      status: matchingTransaction.status
    });

    return { success: true };

  } catch (error) {
    console.error('[Metal Verification] Error verifying transaction:', error);
    return {
      success: false,
      error: 'Failed to verify transaction with Metal API. Please try again.',
      status: 500
    };
  }
}

