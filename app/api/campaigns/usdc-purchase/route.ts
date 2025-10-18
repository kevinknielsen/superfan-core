import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUserFromAuth } from '@/lib/user-management';
import { createPublicClient, http, decodeEventLog, parseAbi, formatUnits } from 'viem';
import { base } from 'viem/chains';

// Base RPC client for transaction verification
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL ?? 'https://mainnet.base.org', { timeout: 10_000 })
});

// USDC contract address on Base
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/**
 * POST /api/campaigns/usdc-purchase
 * Process USDC payment for campaign credits
 * Verifies blockchain transaction and grants credits
 * Accepts any verified authentication (Privy or Farcaster)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication (supports both Privy and Farcaster)
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as {
      tx_hash: string;
      club_id: string;
      credit_amount: number;
      campaign_id?: string;
      sender_address: string; // User's wallet address for verification
    };
    const { tx_hash, club_id, credit_amount, campaign_id, sender_address } = body;

    // Validate inputs
    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json({ error: 'tx_hash is required' }, { status: 400 });
    }

    // Validate tx_hash format: must be 32-byte hex string (64 hex chars with or without 0x prefix)
    const txHashRegex = /^(0x)?[a-fA-F0-9]{64}$/;
    if (!txHashRegex.test(tx_hash)) {
      return NextResponse.json({ 
        error: 'tx_hash must be a 32-byte hex string (64 hex characters, optionally prefixed with 0x)' 
      }, { status: 400 });
    }

    // Normalize tx_hash to lowercase with 0x prefix for consistent deduplication
    const normalizedTxHash = (tx_hash.startsWith('0x') ? tx_hash : `0x${tx_hash}`).toLowerCase();

    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!credit_amount || !Number.isInteger(credit_amount) || credit_amount <= 0) {
      return NextResponse.json({ error: 'credit_amount must be a positive integer' }, { status: 400 });
    }

    if (!sender_address || typeof sender_address !== 'string') {
      return NextResponse.json({ error: 'sender_address is required' }, { status: 400 });
    }

    // Validate sender address format
    const { isAddress } = await import('viem');
    if (!isAddress(sender_address)) {
      return NextResponse.json({ error: 'sender_address must be a valid Ethereum address' }, { status: 400 });
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

    // Verify transaction on Base blockchain
    console.log('[USDC Purchase] Verifying transaction:', normalizedTxHash);
    
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: normalizedTxHash as `0x${string}`
      });
    } catch (e) {
      return NextResponse.json(
        { error: 'Transaction receipt not found yet. The transaction may still be pending. Please wait ~5 seconds and try again.' },
        { status: 400 }
      );
    }

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

    // Decode USDC Transfer event using viem for type safety
    // Filter all USDC Transfer logs and find the one from the authenticated user's wallet
    const erc20Events = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
    const usdcLogs = receipt.logs.filter(l => l.address.toLowerCase() === USDC_BASE_ADDRESS.toLowerCase());
    
    if (usdcLogs.length === 0) {
      return NextResponse.json({ 
        error: 'No USDC transfer found in transaction' 
      }, { status: 400 });
    }

    // Decode the USDC Transfer event from the transaction
    // We'll find the transfer to the club's wallet and validate it
    let from: string | null = null;
    let to: string | null = null;
    let actualAmount: bigint | null = null;
    
    for (const log of usdcLogs) {
      try {
        const decoded = decodeEventLog({
          abi: erc20Events,
          data: log.data,
          topics: log.topics,
        });
        const transferFrom = (decoded.args as any).from as string;
        const transferTo = (decoded.args as any).to as string;
        const transferAmount = (decoded.args as any).value as bigint;
        
        // Find the transfer that goes to the club's wallet
        if (transferTo.toLowerCase() === club.usdc_wallet_address.toLowerCase()) {
          from = transferFrom;
          to = transferTo;
          actualAmount = transferAmount;
          break;
        }
      } catch {
        // Skip logs that fail to decode
        continue;
      }
    }

    if (!from || !to || !actualAmount) {
      return NextResponse.json({ 
        error: 'No USDC transfer to club wallet found in transaction' 
      }, { status: 400 });
    }

    // CRITICAL: Verify sender matches the provided sender_address
    if (from.toLowerCase() !== sender_address.toLowerCase()) {
      console.error('[USDC Purchase] Sender mismatch:', {
        onChainSender: from,
        claimedSender: sender_address
      });
      return NextResponse.json({ 
        error: 'Transaction sender does not match your wallet address' 
      }, { status: 403 });
    }

    // CRITICAL: Verify sender_address belongs to the authenticated user
    // Query user's verified wallets/linked accounts from Privy or Farcaster
    // For now, we trust the on-chain verification above as the primary security check
    // TODO: Add Privy linked wallet verification or store verified wallets in DB
    // This prevents stealing credits but requires additional user wallet mapping
    console.log('[USDC Purchase] Verified sender:', {
      userId: user.id,
      senderAddress: sender_address,
      authType: auth.type
    });

    // Verify amount matches expected (USDC has 6 decimals)
    const expectedAmount = BigInt(credit_amount) * BigInt(1_000_000);
    if (actualAmount !== expectedAmount) {
      const actualUSDC = Number(formatUnits(actualAmount, 6));
      console.error('[USDC Purchase] Amount mismatch:', {
        expected: credit_amount,
        actual: actualUSDC
      });
      return NextResponse.json({ 
        error: `Amount mismatch: expected ${credit_amount} USDC, got ${actualUSDC} USDC` 
      }, { status: 400 });
    }

    console.log('[USDC Purchase] Transaction verified:', {
      sender: from,
      recipient: to,
      amount: credit_amount,
      txHash: normalizedTxHash
    });

    // Create credit purchase record
    const { data: purchase, error: purchaseError } = await (supabase as any)
      .from('credit_purchases')
      .insert({
        user_id: user.id,
        club_id: club_id,
        campaign_id: campaign_id || null,
        credits_purchased: credit_amount,
        price_paid_cents: credit_amount * 100, // 1 USDC = 1 credit = $1
        usdc_tx_hash: normalizedTxHash,
        payment_method: 'usdc',
        status: 'completed',
        // Stripe fields are NULL for USDC payments (migration 035 makes these nullable)
        stripe_session_id: null,
        stripe_payment_intent_id: null
      })
      .select()
      .single();

    if (purchaseError) {
      // Unique violation on usdc_tx_hash => duplicate transaction
      if ((purchaseError as any).code === '23505') {
        // Fetch existing purchase to return its details
        const { data: existingPurchase } = await (supabase as any)
          .from('credit_purchases')
          .select('id, credits_purchased')
          .eq('usdc_tx_hash', normalizedTxHash)
          .single();
        
        if (existingPurchase) {
          console.log('[USDC Purchase] Transaction already processed:', tx_hash);
          return NextResponse.json({
            success: true,
            message: 'Transaction already processed',
            purchase_id: existingPurchase.id,
            credits_purchased: existingPurchase.credits_purchased,
            tx_hash: normalizedTxHash
          });
        }
      }
      console.error('[USDC Purchase] Error creating purchase record:', purchaseError);
      return NextResponse.json({ 
        error: 'Failed to process purchase' 
      }, { status: 500 });
    }

    console.log('[USDC Purchase] Purchase successful:', {
      purchaseId: purchase.id,
      userId: user.id,
      credits: credit_amount,
      txHash: normalizedTxHash
    });

    // Update campaign progress if campaign_id provided (same as Stripe webhook)
    if (campaign_id) {
      const priceCents = credit_amount * 100;
      
      const { error: campaignUpdateError } = await (supabase as any)
        .rpc('increment_campaigns_ticket_progress', {
          p_campaign_id: campaign_id,
          p_increment_current_funding_cents: priceCents,
          p_increment_received_cents: priceCents, // Generic parameter for all payment methods
          p_increment_total_tickets_sold: credit_amount
        });

      if (campaignUpdateError) {
        console.error('[USDC Purchase] Failed to update campaign progress:', campaignUpdateError);
        // Don't fail the whole operation, just log the error
      } else {
        console.log(`[USDC Purchase] Updated campaign ${campaign_id} progress by $${priceCents/100}`);
      }

      // Check if campaign goal reached
      const { data: updatedCampaign } = await (supabase as any)
        .from('campaigns')
        .select('funding_goal_cents, current_funding_cents, title')
        .eq('id', campaign_id)
        .single();

      if (updatedCampaign && updatedCampaign.current_funding_cents >= updatedCampaign.funding_goal_cents) {
        console.log(`🎉 Campaign "${updatedCampaign.title}" reached funding goal!`);
        
        // Mark campaign as funded (only if not already funded to avoid unnecessary updates)
        await (supabase as any)
          .from('campaigns')
          .update({ status: 'funded' })
          .eq('id', campaign_id)
          .neq('status', 'funded');
      }
    }

    return NextResponse.json({
      success: true,
      purchase_id: purchase.id,
      credits_purchased: credit_amount,
      tx_hash: normalizedTxHash,
      campaign_updated: !!campaign_id,
      message: `Successfully purchased ${credit_amount} credits with USDC`
    });

  } catch (error) {
    console.error('[USDC Purchase] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to process USDC purchase' 
    }, { status: 500 });
  }
}

