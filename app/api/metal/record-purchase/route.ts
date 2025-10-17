import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { metal } from "@/lib/metal/server";

// Proper types for response validation
interface UserRecord {
  id: string;
}

interface CampaignRecord {
  title: string;
}

interface ClubRecord {
  name: string;
}

interface CreditPurchaseRecord {
  id: string;
}

// Type-safe wrapper for newer tables not in base Supabase types
const supabaseAny = supabase as any;

/**
 * Record a Metal presale purchase in our database
 * This endpoint is called after a successful Metal buyPresale() call
 * to keep our database in sync with Metal's system
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
      club_id, 
      campaign_id, // Optional: wallet direct-credit flow may omit this
      credit_amount, 
      tx_hash,
      metal_holder_id,
      metal_holder_address 
    } = body;

    // Validate inputs
    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    // campaign_id is optional - validate type if provided
    if (campaign_id !== undefined && campaign_id !== null && typeof campaign_id !== 'string') {
      return NextResponse.json({ error: 'campaign_id must be a string when provided' }, { status: 400 });
    }

    if (!credit_amount || !Number.isInteger(credit_amount) || credit_amount <= 0) {
      return NextResponse.json({ error: 'credit_amount must be a positive integer' }, { status: 400 });
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

    // Get campaign info for metadata (only if campaign_id provided)
    let campaign: CampaignRecord | null = null;
    if (campaign_id) {
      const { data: campaignData, error: campaignError } = await supabaseAny
        .from('campaigns')
        .select('title')
        .eq('id', campaign_id)
        .single() as { data: CampaignRecord | null; error: any };

      if (campaignError || !campaignData) {
        console.warn(`Campaign ${campaign_id} not found, treating as direct credit purchase`);
        // Don't fail - this might be a direct credit purchase without a campaign
      } else {
        campaign = campaignData;
      }
    }

    // Get club info for metadata
    const { data: club } = await supabaseAny
      .from('clubs')
      .select('name')
      .eq('id', club_id)
      .single() as { data: ClubRecord | null; error: any };

    if (!club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Calculate price in cents (1 credit = $1 = 100 cents)
    const priceCents = credit_amount * 100;

    // CRITICAL: Verify the USDC transaction through Metal's server API
    // This ensures the purchase actually happened and prevents fraudulent claims
    if (metal_holder_id) {
      try {
        console.log('[Metal Credit Purchase] Verifying transaction through Metal API:', {
          holder: metal_holder_id,
          txHash: normalizedTxHash,
          expectedAmount: credit_amount
        });

        // Fetch holder's transactions from Metal to verify this purchase
        const holderTransactions = await metal.getTransactions(metal_holder_id);
        
        if (!holderTransactions || !Array.isArray(holderTransactions)) {
          console.error('[Metal Credit Purchase] Failed to fetch holder transactions');
          return NextResponse.json({ 
            error: 'Unable to verify transaction with Metal. Please try again.' 
          }, { status: 500 });
        }

        // Find the transaction matching this tx_hash
        const matchingTransaction: any = holderTransactions.find((tx: any) => 
          tx.transactionHash?.toLowerCase() === normalizedTxHash.toLowerCase()
        );

        if (!matchingTransaction) {
          console.error('[Metal Credit Purchase] Transaction not found in Metal holder records:', {
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
        const expectedUSDC = credit_amount; // 1 credit = 1 USDC
        const actualAmount = parseFloat(matchingTransaction.amount || '0');
        
        // Allow for small floating point differences (within 0.01 USDC)
        if (Math.abs(actualAmount - expectedUSDC) > 0.01) {
          console.error('[Metal Credit Purchase] Amount mismatch:', {
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
          console.error('[Metal Credit Purchase] Transaction not successful:', {
            status: matchingTransaction.status
          });
          return NextResponse.json({ 
            error: `Transaction status is ${matchingTransaction.status}, not successful` 
          }, { status: 400 });
        }

        console.log('[Metal Credit Purchase] ✅ Transaction verified through Metal:', {
          txHash: normalizedTxHash,
          amount: actualAmount,
          status: matchingTransaction.status
        });

      } catch (error) {
        console.error('[Metal Credit Purchase] Error verifying transaction with Metal:', error);
        return NextResponse.json({ 
          error: 'Failed to verify transaction with Metal API. Please try again.' 
        }, { status: 500 });
      }
    } else {
      // If no metal_holder_id provided, we cannot verify through Metal
      console.warn('[Metal Credit Purchase] No metal_holder_id provided - skipping Metal verification');
      // Note: We could add additional on-chain verification here as a fallback
    }

    // Insert Metal purchase into credit_purchases table
    // Using same schema as Stripe purchases for consistency
    const creditPurchaseData = {
      user_id: actualUserId,
      club_id: club_id,
      campaign_id: campaign_id || null, // Null for direct credit purchases
      credits_purchased: credit_amount,
      price_paid_cents: priceCents,
      // Metal-specific fields
      usdc_tx_hash: normalizedTxHash,
      payment_method: 'metal_presale',
      status: 'completed',
      purchased_at: new Date().toISOString(),
      metadata: {
        campaign_title: campaign?.title,
        club_name: club?.name,
        metal_holder_id: metal_holder_id,
        metal_holder_address: metal_holder_address,
        payment_type: 'usdc_base'
      }
    };

    const { data: purchase, error: insertError } = await supabaseAny
      .from('credit_purchases')
      .insert(creditPurchaseData)
      .select('id')
      .single() as { data: CreditPurchaseRecord | null; error: any };

    if (insertError) {
      // Check if this is a duplicate transaction error (unique constraint violation)
      if ((insertError as any).code === '23505') {
        const { data: existingPurchase } = await supabaseAny
          .from('credit_purchases')
          .select('id')
          .eq('usdc_tx_hash', normalizedTxHash)
          .single() as { data: CreditPurchaseRecord | null; error: any };
        
        if (existingPurchase) {
          console.log(`Metal purchase already recorded for tx: ${normalizedTxHash}`);
          return NextResponse.json({ 
            success: true,
            message: 'Purchase already recorded',
            purchase_id: existingPurchase.id,
            credits_purchased: credit_amount,
            campaign_updated: false
          });
        }
      }
      
      console.error('Failed to create Metal credit purchase:', insertError);
      return NextResponse.json({ 
        error: 'Failed to record purchase',
        details: insertError.message 
      }, { status: 500 });
    }

    console.log(`✅ Recorded Metal purchase: ${credit_amount} credits for user ${actualUserId}`);

    // Update campaign progress (only if campaign_id provided)
    let campaignUpdateErrorMessage: string | null = null;
    if (campaign_id && campaign) {
      const { error: campaignUpdateError } = await supabaseAny
        .rpc('increment_campaigns_ticket_progress', {
          p_campaign_id: campaign_id,
          p_increment_current_funding_cents: priceCents,
          p_increment_stripe_received_cents: priceCents, // Metal purchases count toward goal
          p_increment_total_tickets_sold: credit_amount
        });

      if (campaignUpdateError) {
        campaignUpdateErrorMessage = campaignUpdateError.message || 'Unknown error updating campaign';
        console.error('Failed to update campaign progress:', campaignUpdateError);
        // Don't fail the whole operation, purchase was successful
      } else {
        console.log(`✅ Updated campaign ${campaign_id} progress by $${priceCents/100}`);
        
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
    } else {
      console.log(`✅ Direct credit purchase (no campaign) - ${credit_amount} credits for user ${actualUserId}`);
    }

    return NextResponse.json({
      success: true,
      purchase_id: purchase!.id,
      credits_purchased: credit_amount,
      campaign_updated: !!campaign_id && !campaignUpdateErrorMessage,
      // Include partial failure details
      partial_success: !!campaignUpdateErrorMessage,
      campaign_update_error: campaignUpdateErrorMessage
    });

  } catch (error) {
    console.error('Error recording Metal purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to record Metal purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

