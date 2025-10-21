import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { createServiceClient } from "../../supabase";

// Use service client to bypass RLS for Metal purchases
const supabase = createServiceClient();
import { verifyMetalTransaction } from "@/lib/metal/verify-transaction";

// Proper types for response validation
interface UserRecord {
  id: string;
}

interface CampaignRecord {
  title: string;
}

interface ClubRecord {
  name: string;
  treasury_wallet_address?: string;
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

    if (!metal_holder_id || typeof metal_holder_id !== 'string') {
      return NextResponse.json({ 
        error: 'metal_holder_id is required for Metal transaction verification' 
      }, { status: 400 });
    }

    // Validate metal_holder_address if provided
    if (metal_holder_address !== undefined && metal_holder_address !== null) {
      if (typeof metal_holder_address !== 'string' || metal_holder_address.trim() === '') {
        return NextResponse.json({ 
          error: 'metal_holder_address must be a non-empty string when provided' 
        }, { status: 400 });
      }
      
      // Validate Ethereum address format (0x + 40 hex chars)
      const addressRegex = /^0x[a-fA-F0-9]{40}$/i;
      if (!addressRegex.test(metal_holder_address)) {
        return NextResponse.json({ 
          error: 'metal_holder_address must be a valid Ethereum address (0x followed by 40 hex characters)' 
        }, { status: 400 });
      }
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
      console.error('[Metal Credit Purchase] User not found:', {
        error: userError,
        authUserId: auth.userId,
        authType: auth.type,
        userColumn
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = user.id;
    console.log('[Metal Credit Purchase] Found user:', {
      actualUserId,
      authUserId: auth.userId,
      authType: auth.type
    });

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
      .select('name, treasury_wallet_address')
      .eq('id', club_id)
      .single() as { data: ClubRecord | null; error: any };

    if (!club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Calculate price in cents (1 credit = $1 = 100 cents)
    const priceCents = credit_amount * 100;

    // NO verification needed for presale purchases
    // buyPresale() only succeeds if Metal verified and processed the purchase
    // Metal is the source of truth - if buyPresale() succeeded, we trust it
    console.log('[Metal Credit Purchase] Presale purchase - Metal already verified via buyPresale()');

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

    // TREASURY EXCLUSION: Purchases from treasury wallet don't count toward campaign progress
    // They represent existing Stripe purchases, so counting them would be double-counting
    const isTreasuryPurchase = !!(club?.treasury_wallet_address && 
                                   metal_holder_address &&
                                   metal_holder_address.toLowerCase() === club.treasury_wallet_address.toLowerCase());

    if (isTreasuryPurchase) {
      console.log('ℹ️ Treasury purchase - not counting toward campaign (already counted via Stripe)');
    }

    // Update campaign progress (only if campaign_id provided AND not treasury purchase)
    let campaignUpdateErrorMessage: string | null = null;
    if (campaign_id && campaign && !isTreasuryPurchase) {
      const { error: campaignUpdateError } = await supabaseAny
        .rpc('increment_campaigns_ticket_progress', {
          p_campaign_id: campaign_id,
          p_increment_current_funding_cents: priceCents,
          p_increment_received_cents: priceCents, // Generic parameter for all payment methods
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
    } else if (!campaign_id) {
      console.log(`✅ Direct credit purchase (no campaign) - ${credit_amount} credits for user ${actualUserId}`);
    }
    // Treasury purchases are recorded but don't update campaign (already counted)

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

