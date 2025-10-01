import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

// USDC contract address on Base mainnet
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

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
    confirmations: 1 // Wait for 1 confirmation (fast on Base)
  });

  const sendUSDC = ({ toAddress, amountUSDC }: SendUSDCParams) => {
    // USDC has 6 decimals
    const amountInSmallestUnit = parseUnits(amountUSDC.toString(), 6);
    
    console.log('[USDC Payment] Sending USDC:', {
      to: toAddress,
      amount: amountUSDC,
      amountRaw: amountInSmallestUnit.toString()
    });
    
    writeContract({
      address: USDC_BASE_ADDRESS,
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [toAddress, amountInSmallestUnit]
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

