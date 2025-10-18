import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { createServiceClient } from "../../supabase";
import { isAdmin } from "@/lib/security.server";
import { createMetalPresale } from "@/lib/metal/create-presale";
import { getOrCreateTreasury } from "@/lib/metal/treasury";
import { resolveMetalPresale } from "@/lib/metal/resolve-presale";

export const runtime = 'nodejs';

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
// Note: Using any for new tables not in generated types yet
const supabaseAny = supabase as any;

// Get all campaigns (admin only)
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    console.log('[Campaigns API] Fetching all campaigns...');

    // Get all campaigns with progress data
    const { data: campaigns, error: campaignError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (campaignError) {
      console.error('[Campaigns API] Error fetching campaigns:', campaignError);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return NextResponse.json({ 
        error: 'Failed to fetch campaigns',
        ...(isDevelopment && { details: campaignError.message })
      }, { status: 500 });
    }

    console.log(`[Campaigns API] Retrieved ${campaigns?.length || 0} campaigns`);
    return NextResponse.json({ campaigns: campaigns || [] });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaigns API] Unexpected error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json({ 
      error: 'Failed to fetch campaigns',
      ...(isDevelopment && { details: errMsg })
    }, { status: 500 });
  }
}

// Create new campaign (admin only)
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await request.json() as {
      title?: string;
      club_id?: string;
      description?: string;
      funding_goal_cents?: string | number;
      deadline?: string;
      ticket_price_cents?: string | number;
    };
    
    // Enhanced validation with proper checks
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Title is required and must be a non-empty string' 
      }, { status: 400 });
    }

    if (!body.club_id || typeof body.club_id !== 'string') {
      return NextResponse.json({ 
        error: 'Club ID is required and must be a valid string' 
      }, { status: 400 });
    }

    // Verify club exists (using any for clubs table as it may not be in types)
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('id')
      .eq('id', body.club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ 
        error: 'Club not found or invalid club_id' 
      }, { status: 400 });
    }

    // Validate funding goal
    const fundingGoalCents = parseInt(String(body.funding_goal_cents || '0'), 10);
    if (!body.funding_goal_cents || isNaN(fundingGoalCents) || fundingGoalCents <= 0) {
      return NextResponse.json({ 
        error: 'Funding goal must be a positive integer (in cents)' 
      }, { status: 400 });
    }

    // Validate deadline if provided
    if (body.deadline) {
      const deadlineDate = new Date(body.deadline);
      if (isNaN(deadlineDate.getTime())) {
        return NextResponse.json({ 
          error: 'Deadline must be a valid date' 
        }, { status: 400 });
      }
      if (deadlineDate <= new Date()) {
        return NextResponse.json({ 
          error: 'Deadline must be in the future' 
        }, { status: 400 });
      }
    }

    console.log('[Campaigns API] Creating new campaign:', body.title);

    // Create campaign with validated data
    const ticketPriceCents = parseInt(String(body.ticket_price_cents || '1800'), 10); // Default $18
    if (isNaN(ticketPriceCents) || ticketPriceCents <= 0) {
      return NextResponse.json({ 
        error: 'Ticket price must be a positive integer (in cents)' 
      }, { status: 400 });
    }

    const { data: campaign, error: createError } = await supabaseAny
      .from('campaigns')
      .insert({
        club_id: body.club_id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        funding_goal_cents: fundingGoalCents,
        deadline: body.deadline || null,
        ticket_price_cents: ticketPriceCents,
        status: 'draft'
      })
      .select('*')
      .single();

    if (createError) {
      console.error('[Campaigns API] Error creating campaign:', createError);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return NextResponse.json({ 
        error: 'Failed to create campaign',
        ...(isDevelopment && { details: createError.message })
      }, { status: 500 });
    }

    console.log(`[Campaigns API] Created campaign ${campaign.id}: ${campaign.title}`);
    return NextResponse.json(campaign, { 
      status: 201,
      headers: {
        'Location': `/api/campaigns/${campaign.id}`
      }
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaigns API] Unexpected error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json({ 
      error: 'Failed to create campaign',
      ...(isDevelopment && { details: errMsg })
    }, { status: 500 });
  }
}

// Update campaign (admin only) - used to activate campaigns and create Metal presales
export async function PATCH(request: NextRequest) {
  try {
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await request.json() as {
      campaign_id?: string;
      status?: string;
    };

    if (!body.campaign_id || typeof body.campaign_id !== 'string') {
      return NextResponse.json({ 
        error: 'campaign_id is required' 
      }, { status: 400 });
    }

    // Validate status if provided
    if (body.status) {
      const allowedStatuses = ['draft', 'active', 'funded', 'failed', 'paused', 'completed'];
      if (typeof body.status !== 'string' || !allowedStatuses.includes(body.status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` 
        }, { status: 400 });
      }
    }

    const campaignId = body.campaign_id;

    // Get current campaign data
    const { data: existingCampaign, error: fetchError } = await supabaseAny
      .from('campaigns')
      .select('id, title, status, club_id, ticket_price_cents, funding_goal_cents, metal_presale_id')
      .eq('id', campaignId)
      .single();

    if (fetchError || !existingCampaign) {
      return NextResponse.json({ 
        error: 'Campaign not found' 
      }, { status: 404 });
    }

    // If activating campaign (draft → active), create Metal presale
    if (body.status === 'active' && existingCampaign.status === 'draft' && !existingCampaign.metal_presale_id) {
      console.log(`[Campaigns API] Activating campaign ${campaignId}, creating Metal presale...`);

      // Get or create treasury holder
      const treasury = await getOrCreateTreasury();
      console.log(`[Campaigns API] Treasury ready:`, {
        holderId: treasury.holderId,
        address: treasury.address
      });

      // Get club's token address
      const { data: club, error: clubError } = await supabaseAny
        .from('clubs')
        .select('metal_token_address')
        .eq('id', existingCampaign.club_id)
        .single();

      if (clubError || !club || !club.metal_token_address) {
        return NextResponse.json({ 
          error: 'Club must have a metal_token_address configured before activating campaigns. Please set up the club\'s Metal token first.' 
        }, { status: 400 });
      }

      // Calculate how much USDC to deposit for existing Stripe purchases
      const { data: stripePurchases } = await supabaseAny
        .from('credit_purchases')
        .select('credits_purchased')
        .eq('campaign_id', campaignId)
        .eq('payment_method', 'stripe')
        .eq('status', 'completed');

      const totalStripeCredits = stripePurchases?.reduce(
        (sum: number, p: any) => sum + (p.credits_purchased || 0), 
        0
      ) || 0;

      // Calculate presale size based on funding goal
      // Credits: 1 credit = $1 = 1 presale token
      const fundingGoalUSDC = (existingCampaign.funding_goal_cents || 0) / 100;
      
      // Validate funding goal is positive
      if (fundingGoalUSDC <= 0) {
        console.error('[Campaigns API] Cannot create presale with zero funding goal');
        return NextResponse.json({ 
          error: 'Cannot create presale: funding goal must be greater than zero' 
        }, { status: 400 });
      }
      
      const totalSupply = Math.ceil(fundingGoalUSDC * 1.5); // 50% buffer for oversubscription
      
      console.log(`[Campaigns API] Calculated presale supply:`, {
        fundingGoalUSDC,
        creditPrice: 1, // 1 credit = $1
        minimumCreditsNeeded: fundingGoalUSDC,
        totalSupply
      });

      // Create Metal presale
      // Price: $1 per token (matching 1 credit = $1 system)
      const presaleResult = await createMetalPresale({
        campaignId: campaignId,
        tokenAddress: club.metal_token_address,
        price: 1, // $1 per presale token = 1 credit
        totalSupply: totalSupply,
        lockDuration: 7 * 24 * 60 * 60, // 7 days lock
      });

      if (presaleResult.success === false) {
        console.error('[Campaigns API] Failed to create Metal presale:', presaleResult.error);
        return NextResponse.json({ 
          error: 'Failed to create Metal presale',
          details: presaleResult.error
        }, { status: 500 });
      }

      console.log(`[Campaigns API] Created Metal presale ${presaleResult.presaleId} for campaign ${campaignId}`);

      // Update campaign with Metal presale ID and new status
      const { data: updatedCampaign, error: updateError } = await supabaseAny
        .from('campaigns')
        .update({
          status: body.status,
          metal_presale_id: presaleResult.presaleId,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId)
        .select('*')
        .single();

      if (updateError) {
        // CRITICAL: Metal presale was created but DB update failed
        // Execute compensating action: resolve the presale to prevent orphaned state
        console.error('[Campaigns API] ⚠️ DB update failed after presale creation, executing compensating action:', {
          presaleId: presaleResult.presaleId,
          campaignId: campaignId,
          tokenAddress: club.metal_token_address,
          error: updateError.message,
          timestamp: new Date().toISOString()
        });
        
        // Attempt to resolve (cancel/refund) the orphaned presale
        const resolveResult = await resolveMetalPresale(presaleResult.presaleId);
        
        if (resolveResult.success) {
          console.log(`[Campaigns API] ✅ Compensating action successful: resolved orphaned presale ${presaleResult.presaleId}`);
          return NextResponse.json({ 
            error: 'Failed to activate campaign',
            details: 'Campaign activation failed, presale was automatically cancelled.',
          }, { status: 500 });
        } else {
          // Both DB update AND compensating action failed - critical
          console.error('[Campaigns API] 🚨 CRITICAL: Compensating action failed, orphaned presale exists:', {
            presaleId: presaleResult.presaleId,
            resolveError: resolveResult.error,
            recovery_action: 'MANUAL INTERVENTION REQUIRED - Resolve presale on Metal dashboard'
          });
          
          return NextResponse.json({ 
            error: 'Failed to activate campaign',
            details: 'Critical error: orphaned presale created. Contact support immediately.',
            presale_id: presaleResult.presaleId,
            requires_manual_resolution: true
          }, { status: 500 });
        }
      }

      console.log(`[Campaigns API] ✅ Activated campaign ${campaignId} with Metal presale ${presaleResult.presaleId}`);
      
      // Return campaign with treasury info for USDC deposit
      return NextResponse.json({
        ...updatedCampaign,
        treasury_info: {
          holder_id: treasury.holderId,
          deposit_address: treasury.address,
          required_usdc_deposit: totalStripeCredits,
          message: totalStripeCredits > 0 
            ? `IMPORTANT: 1) Deposit ${totalStripeCredits} USDC to ${treasury.address}, 2) Buy ${totalStripeCredits} presale tokens using metal.buyPresale('${treasury.holderId}', '${campaignId}', ${totalStripeCredits}), 3) After lock period, call POST /api/admin/campaigns/${campaignId}/distribute-tokens to send tokens to Stripe buyers.`
            : 'No existing Stripe purchases - no deposit needed'
        }
      });
    }

    // For other status updates, just update the campaign
    if (body.status) {
      const { data: updatedCampaign, error: updateError } = await supabaseAny
        .from('campaigns')
        .update({
          status: body.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaignId)
        .select('*')
        .single();

      if (updateError) {
        console.error('[Campaigns API] Error updating campaign:', updateError);
        return NextResponse.json({ 
          error: 'Failed to update campaign' 
        }, { status: 500 });
      }

      console.log(`[Campaigns API] Updated campaign ${campaignId} status to ${body.status}`);
      return NextResponse.json(updatedCampaign);
    }

    return NextResponse.json({ error: 'No updates specified' }, { status: 400 });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaigns API] Unexpected error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json({ 
      error: 'Failed to update campaign',
      ...(isDevelopment && { details: errMsg })
    }, { status: 500 });
  }
}
