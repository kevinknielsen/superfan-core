import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import crypto from "node:crypto";
import { metal } from "@/lib/metal/server";

// Proper types for response validation
interface UserRecord {
  id: string;
}

interface TierRewardRecord {
  id: string;
  title: string;
  tier: string;
  reward_type: string;
  ticket_cost: number | null;
  is_ticket_campaign: boolean;
  campaign_id: string | null;
  club_id: string;
}

interface RewardClaimRecord {
  id: string;
  access_code: string;
}

// Type-safe wrapper for newer tables not in base Supabase types
const supabaseAny = supabase as any;

/**
 * POST /api/metal/purchase-item
 * Record a Metal presale item purchase in our database
 * This is for tier rewards/campaign items (not direct credits)
 * Writes to reward_claims table
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as any;
    const { 
      tier_reward_id,
      club_id, 
      campaign_id,
      amount_paid_cents,
      original_price_cents,
      discount_applied_cents,
      tx_hash,
      metal_holder_id,
      metal_holder_address,
      user_tier
    } = body;

    // Validate inputs
    if (!tier_reward_id || typeof tier_reward_id !== 'string') {
      return NextResponse.json({ error: 'tier_reward_id is required' }, { status: 400 });
    }

    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (!amount_paid_cents || !Number.isInteger(amount_paid_cents) || amount_paid_cents <= 0) {
      return NextResponse.json({ error: 'amount_paid_cents must be a positive integer' }, { status: 400 });
    }

    if (!tx_hash || typeof tx_hash !== 'string') {
      return NextResponse.json({ error: 'tx_hash is required for USDC transaction tracking' }, { status: 400 });
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

    if (original_price_cents !== undefined && (!Number.isInteger(original_price_cents) || original_price_cents < 0)) {
      return NextResponse.json({ error: 'original_price_cents must be a non-negative integer' }, { status: 400 });
    }

    if (discount_applied_cents !== undefined && (!Number.isInteger(discount_applied_cents) || discount_applied_cents < 0)) {
      return NextResponse.json({ error: 'discount_applied_cents must be a non-negative integer' }, { status: 400 });
    }

    if (campaign_id !== undefined && typeof campaign_id !== 'string') {
      return NextResponse.json({ error: 'campaign_id must be a string' }, { status: 400 });
    }

    // Get the user from our database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single() as { data: UserRecord | null; error: any };

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = user.id;

    // Get tier reward info
    const { data: tierReward, error: tierRewardError } = await supabaseAny
      .from('tier_rewards')
      .select('id, title, tier, reward_type, ticket_cost, is_ticket_campaign, campaign_id, club_id')
      .eq('id', tier_reward_id)
      .single() as { data: TierRewardRecord | null; error: any };

    if (tierRewardError || !tierReward) {
      return NextResponse.json({ error: 'Tier reward not found' }, { status: 404 });
    }

    // Verify tier reward belongs to the specified club (prevent cross-club claims)
    if (tierReward.club_id !== club_id) {
      return NextResponse.json({ 
        error: 'Tier reward does not belong to the specified club' 
      }, { status: 400 });
    }

    // CRITICAL: Verify the USDC transaction through Metal's server API
    // This ensures the purchase actually happened and prevents fraudulent claims
    if (metal_holder_id) {
      try {
        console.log('[Metal Purchase] Verifying transaction through Metal API:', {
          holder: metal_holder_id,
          txHash: normalizedTxHash
        });

        // Fetch holder's transactions from Metal to verify this purchase
        const holderTransactions = await metal.getTransactions(metal_holder_id);
        
        if (!holderTransactions || !Array.isArray(holderTransactions)) {
          console.error('[Metal Purchase] Failed to fetch holder transactions');
          return NextResponse.json({ 
            error: 'Unable to verify transaction with Metal. Please try again.' 
          }, { status: 500 });
        }

        // Find the transaction matching this tx_hash
        const matchingTransaction = holderTransactions.find((tx: any) => 
          tx.transactionHash?.toLowerCase() === normalizedTxHash.toLowerCase()
        );

        if (!matchingTransaction) {
          console.error('[Metal Purchase] Transaction not found in Metal holder records:', {
            txHash: normalizedTxHash,
            holderTransactionsCount: holderTransactions.length
          });
          return NextResponse.json({ 
            error: 'Transaction not found in Metal records. The transaction may still be processing or was not completed through Metal.' 
          }, { status: 400 });
        }

        // Verify the transaction amount matches expected
        // Metal amounts are typically in the token's native units
        // For USDC (6 decimals), convert cents to USDC
        const expectedUSDC = amount_paid_cents / 100;
        const actualAmount = parseFloat(matchingTransaction.amount || '0');
        
        // Allow for small floating point differences (within 0.01 USDC)
        if (Math.abs(actualAmount - expectedUSDC) > 0.01) {
          console.error('[Metal Purchase] Amount mismatch:', {
            expected: expectedUSDC,
            actual: actualAmount,
            difference: Math.abs(actualAmount - expectedUSDC)
          });
          return NextResponse.json({ 
            error: `Transaction amount mismatch: expected ${expectedUSDC} USDC, got ${actualAmount} USDC` 
          }, { status: 400 });
        }

        // Verify transaction was successful
        if (matchingTransaction.status && matchingTransaction.status !== 'success' && matchingTransaction.status !== 'completed') {
          console.error('[Metal Purchase] Transaction not successful:', {
            status: matchingTransaction.status
          });
          return NextResponse.json({ 
            error: `Transaction status is ${matchingTransaction.status}, not successful` 
          }, { status: 400 });
        }

        console.log('[Metal Purchase] ✅ Transaction verified through Metal:', {
          txHash: normalizedTxHash,
          amount: actualAmount,
          status: matchingTransaction.status
        });

      } catch (error) {
        console.error('[Metal Purchase] Error verifying transaction with Metal:', error);
        return NextResponse.json({ 
          error: 'Failed to verify transaction with Metal API. Please try again.' 
        }, { status: 500 });
      }
    } else {
      // If no metal_holder_id provided, we cannot verify through Metal
      console.warn('[Metal Purchase] No metal_holder_id provided - skipping Metal verification');
      // Note: We could add additional on-chain verification here as a fallback
    }

    // Generate secure access code
    const generateAccessCode = (): string => {
      return 'AC' + crypto.randomBytes(8).toString('hex').toUpperCase();
    };

    // Detect if this is a credit/ticket campaign item
    const isCreditCampaign = tierReward.is_ticket_campaign && tierReward.campaign_id;
    // For ticket campaigns: record ticket_cost as tickets purchased
    // For item purchases: record 1 item purchased (not inflated by ticket_cost)
    const ticketsPurchased = isCreditCampaign ? (tierReward.ticket_cost || 0) : 1;

    // Create reward claim record
    const claimData = {
      user_id: actualUserId,
      club_id: club_id,
      reward_id: tier_reward_id,
      campaign_id: campaign_id || tierReward.campaign_id || null,
      claim_method: 'metal_presale',
      user_tier_at_claim: user_tier || 'cadet',
      user_points_at_claim: 0,
      original_price_cents: original_price_cents || amount_paid_cents,
      paid_price_cents: amount_paid_cents,
      discount_applied_cents: discount_applied_cents || 0,
      usdc_tx_hash: normalizedTxHash,
      payment_method: 'metal_presale',
      upgrade_transaction_id: null,
      upgrade_amount_cents: null,
      refund_status: 'none',
      access_status: 'granted',
      access_code: generateAccessCode(),
      claimed_at: new Date().toISOString(),
      // Credit/ticket tracking
      is_ticket_claim: isCreditCampaign,
      tickets_purchased: ticketsPurchased,
      tickets_available: ticketsPurchased,
      tickets_redeemed: 0,
      metadata: {
        metal_holder_id: metal_holder_id,
        metal_holder_address: metal_holder_address,
        payment_type: 'usdc_base'
      }
    };

    const { data: claim, error: claimError } = await supabaseAny
      .from('reward_claims')
      .insert(claimData)
      .select('id, access_code')
      .single() as { data: RewardClaimRecord | null; error: any };

    if (claimError) {
      // Check if this is a duplicate transaction error (unique constraint violation)
      if ((claimError as any).code === '23505') {
        const { data: existingClaim } = await supabaseAny
          .from('reward_claims')
          .select('id, access_code')
          .eq('usdc_tx_hash', normalizedTxHash)
          .single() as { data: RewardClaimRecord | null; error: any };
        
        if (existingClaim) {
          console.log(`Metal item purchase already recorded for tx: ${normalizedTxHash}`);
          return NextResponse.json({ 
            success: true,
            message: 'Purchase already recorded',
            claim_id: existingClaim.id,
            access_code: existingClaim.access_code,
            tier_reward_title: tierReward.title,
            campaign_updated: false
          });
        }
      }
      
      console.error('Failed to create Metal item claim:', claimError);
      return NextResponse.json({ 
        error: 'Failed to record purchase',
        details: claimError.message 
      }, { status: 500 });
    }

    console.log(`✅ Recorded Metal item purchase: ${tierReward.title} for user ${actualUserId}`);

    // Update campaign progress if campaign_id provided
    let campaignUpdateErrorMessage: string | null = null;
    if (campaign_id) {
      // For campaign items, credit full original price to campaign (not discounted amount)
      const campaignCreditCents = original_price_cents || amount_paid_cents;
      
      const { error: campaignUpdateError } = await supabaseAny
        .rpc('increment_campaigns_ticket_progress', {
          p_campaign_id: campaign_id,
          p_increment_current_funding_cents: campaignCreditCents,
          p_increment_stripe_received_cents: amount_paid_cents,
          p_increment_total_tickets_sold: ticketsPurchased
        });

      if (campaignUpdateError) {
        campaignUpdateErrorMessage = campaignUpdateError.message || 'Unknown error updating campaign';
        console.error('Failed to update campaign progress:', campaignUpdateError);
        // Don't fail the whole operation, purchase was successful
      } else {
        console.log(`✅ Updated campaign ${campaign_id} progress by $${campaignCreditCents/100}`);
        
        // Check if campaign goal reached (only if update succeeded)
        const { data: updatedCampaign } = await supabaseAny
          .from('campaigns')
          .select('funding_goal_cents, current_funding_cents, title')
          .eq('id', campaign_id)
          .single();

        if (updatedCampaign && updatedCampaign.current_funding_cents >= updatedCampaign.funding_goal_cents) {
          console.log(`🎉 Campaign "${updatedCampaign.title}" reached funding goal!`);
          
          // Mark campaign as funded (only if not already funded to avoid unnecessary updates)
          await supabaseAny
            .from('campaigns')
            .update({ status: 'funded' })
            .eq('id', campaign_id)
            .neq('status', 'funded');
        }
      }
    }

    return NextResponse.json({
      success: true,
      claim_id: claim!.id,
      access_code: claim!.access_code,
      tier_reward_title: tierReward.title,
      campaign_updated: !!campaign_id && !campaignUpdateErrorMessage,
      // Include partial failure details
      partial_success: !!campaignUpdateErrorMessage,
      campaign_update_error: campaignUpdateErrorMessage
    });

  } catch (error) {
    console.error('Error recording Metal item purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to record Metal item purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

