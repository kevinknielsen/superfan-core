import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { base } from 'viem/chains';

// USDC contract address on Base mainnet
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const BASE_CHAIN_ID = base.id; // 8453

// Minimal ERC20 ABI for transfer function
const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: 'success', type: 'bool' }]
  }
] as const;

export interface SendUSDCParams {
  toAddress: `0x${string}`;
  amountUSDC: number; // Amount in USDC (e.g., 9 for 9 USDC)
}

/**
 * Hook to send USDC on Base chain
 * For credit purchases: 1 USDC = 1 credit
 */
export function useSendUSDC() {
  const { 
    writeContract, 
    data: hash, 
    isPending: isWriting,
    error: writeError 
  } = useWriteContract();
  
  const { 
    isLoading: isConfirming, 
    isSuccess,
    error: confirmError
  } = useWaitForTransactionReceipt({ 
    hash,
    chainId: BASE_CHAIN_ID, // Force Base mainnet
    confirmations: 1 // Wait for 1 confirmation (fast on Base)
  });

  const sendUSDC = ({ toAddress, amountUSDC }: SendUSDCParams) => {
    // Validate input
    if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
      console.error('[USDC Payment] Invalid amount:', amountUSDC);
      throw new Error('Amount must be a positive number');
    }
    
    // USDC has 6 decimals
    const amountInSmallestUnit = parseUnits(amountUSDC.toString(), 6);
    
    writeContract({
      address: USDC_BASE_ADDRESS,
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [toAddress, amountInSmallestUnit],
      chainId: BASE_CHAIN_ID // Force Base mainnet to prevent cross-chain mis-sends
    });
  };

  return {
    sendUSDC,
    hash,
    isLoading: isWriting || isConfirming,
    isSuccess,
    error: writeError || confirmError
  };
}

