import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUserFromAuth } from '@/lib/user-management';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Base RPC client for transaction verification
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org')
});

// USDC contract address on Base
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/**
 * POST /api/campaigns/usdc-purchase
 * Process USDC payment for campaign credits
 * Verifies blockchain transaction and grants credits
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication (Farcaster users only for this flow)
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { tx_hash, club_id, credit_amount, campaign_id } = body;

    // Validate inputs
    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json({ error: 'tx_hash is required' }, { status: 400 });
    }

    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!credit_amount || !Number.isInteger(credit_amount) || credit_amount <= 0) {
      return NextResponse.json({ error: 'credit_amount must be a positive integer' }, { status: 400 });
    }

    // Get user
    const user = await getOrCreateUserFromAuth(auth);

    // Get club and verify it has a USDC wallet
    const { data: club, error: clubError } = await (supabase as any)
      .from('clubs')
      .select('id, name, usdc_wallet_address')
      .eq('id', club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    if (!club.usdc_wallet_address) {
      return NextResponse.json({ 
        error: 'This club does not accept USDC payments yet' 
      }, { status: 400 });
    }

    // Check if transaction was already processed
    const { data: existingPurchase } = await (supabase as any)
      .from('credit_purchases')
      .select('id')
      .eq('tx_hash', tx_hash)
      .single();

    if (existingPurchase) {
      return NextResponse.json({ 
        error: 'Transaction already processed' 
      }, { status: 409 });
    }

    // Verify transaction on Base blockchain
    console.log('[USDC Purchase] Verifying transaction:', tx_hash);
    
    const receipt = await publicClient.getTransactionReceipt({ 
      hash: tx_hash as `0x${string}` 
    });

    // Verify transaction succeeded
    if (receipt.status !== 'success') {
      return NextResponse.json({ 
        error: 'Transaction failed on blockchain' 
      }, { status: 400 });
    }

    // Verify transaction is to the USDC contract
    if (receipt.to?.toLowerCase() !== USDC_BASE_ADDRESS.toLowerCase()) {
      return NextResponse.json({ 
        error: 'Transaction not sent to USDC contract' 
      }, { status: 400 });
    }

    // Parse Transfer event from logs to verify recipient and amount
    // Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
    const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    
    const transferEvent = receipt.logs.find(log => 
      log.address.toLowerCase() === USDC_BASE_ADDRESS.toLowerCase() &&
      log.topics[0] === TRANSFER_EVENT_SIGNATURE
    );

    if (!transferEvent || !transferEvent.topics || transferEvent.topics.length < 3) {
      return NextResponse.json({ 
        error: 'No USDC transfer found in transaction' 
      }, { status: 400 });
    }

    // Decode Transfer event: topics[1] = from, topics[2] = to, data = amount
    const to = ('0x' + transferEvent.topics[2].slice(26)) as string; // Remove padding from indexed address
    const amountHex = transferEvent.data;
    const actualAmount = BigInt(amountHex);

    // Verify recipient is the club's wallet
    if (to.toLowerCase() !== club.usdc_wallet_address.toLowerCase()) {
      console.error('[USDC Purchase] Recipient mismatch:', {
        expected: club.usdc_wallet_address,
        actual: to
      });
      return NextResponse.json({ 
        error: 'Transaction not sent to club wallet' 
      }, { status: 400 });
    }

    // Verify amount matches expected (USDC has 6 decimals)
    const expectedAmount = BigInt(credit_amount) * BigInt(1_000_000);
    if (actualAmount !== expectedAmount) {
      const actualUSDC = Number(actualAmount) / 1_000_000;
      console.error('[USDC Purchase] Amount mismatch:', {
        expected: credit_amount,
        actual: actualUSDC
      });
      return NextResponse.json({ 
        error: `Amount mismatch: expected ${credit_amount} USDC, got ${actualUSDC} USDC` 
      }, { status: 400 });
    }

    console.log('[USDC Purchase] Transaction verified:', {
      recipient: to,
      amount: credit_amount,
      txHash: tx_hash
    });

    // Create credit purchase record
    const { data: purchase, error: purchaseError } = await (supabase as any)
      .from('credit_purchases')
      .insert({
        user_id: user.id,
        club_id: club_id,
        campaign_id: campaign_id || null,
        credits_purchased: credit_amount,
        price_cents: credit_amount * 100, // 1 USDC = 1 credit = $1
        tx_hash: tx_hash,
        payment_method: 'usdc',
        status: 'completed',
        stripe_session_id: null, // Not applicable for USDC
        stripe_payment_intent_id: null
      })
      .select()
      .single();

    if (purchaseError) {
      console.error('[USDC Purchase] Error creating purchase record:', purchaseError);
      return NextResponse.json({ 
        error: 'Failed to process purchase' 
      }, { status: 500 });
    }

    console.log('[USDC Purchase] Purchase successful:', {
      purchaseId: purchase.id,
      userId: user.id,
      credits: credit_amount,
      txHash: tx_hash
    });

    return NextResponse.json({
      success: true,
      purchase_id: purchase.id,
      credits_purchased: credit_amount,
      tx_hash: tx_hash,
      message: `Successfully purchased ${credit_amount} credits with USDC`
    });

  } catch (error) {
    console.error('[USDC Purchase] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to process USDC purchase' 
    }, { status: 500 });
  }
}

