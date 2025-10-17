import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../auth";
import { createServiceClient } from "../../../../supabase";
import { isAdmin } from "@/lib/security.server";
import { metal } from "@/lib/metal/server";

export const runtime = 'nodejs';

const supabase = createServiceClient();
const supabaseAny = supabase as any;

/**
 * POST /api/admin/campaigns/[id]/distribute-tokens
 * Distributes tokens from treasury to Stripe purchasers after presale resolves
 * 
 * This should be called AFTER:
 * 1. Presale is resolved
 * 2. Token lock period has ended
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { id: campaignId } = await params;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabaseAny
      .from('campaigns')
      .select('id, title, club_id, metal_presale_id, status')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!campaign.metal_presale_id) {
      return NextResponse.json({ 
        error: 'Campaign has no Metal presale' 
      }, { status: 400 });
    }

    // Get club's token address
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('metal_token_address')
      .eq('id', campaign.club_id)
      .single();

    if (clubError || !club || !club.metal_token_address) {
      return NextResponse.json({ 
        error: 'Club token address not found' 
      }, { status: 400 });
    }

    // Get all Stripe purchases for this campaign that haven't received tokens yet
    const { data: stripePurchases, error: purchasesError } = await supabaseAny
      .from('credit_purchases')
      .select('id, user_id, credits_purchased, stripe_payment_intent_id')
      .eq('campaign_id', campaignId)
      .eq('payment_method', 'stripe')
      .eq('status', 'completed');

    if (purchasesError) {
      return NextResponse.json({ 
        error: 'Failed to fetch Stripe purchases',
        details: purchasesError.message 
      }, { status: 500 });
    }

    if (!stripePurchases || stripePurchases.length === 0) {
      return NextResponse.json({ 
        message: 'No Stripe purchases found for this campaign',
        distributed: 0
      });
    }

    console.log(`[Token Distribution] Distributing tokens for ${stripePurchases.length} Stripe purchasers...`);

    const results = {
      total: stripePurchases.length,
      successful: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Distribute to each Stripe purchaser
    for (const purchase of stripePurchases) {
      try {
        console.log(`[Token Distribution] Distributing ${purchase.credits_purchased} tokens to user ${purchase.user_id}`);

        // Distribute from treasury to user's Metal holder
        const response = await fetch(
          `https://api.metal.build/token/${club.metal_token_address}/distribute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.METAL_SECRET_KEY || '',
            },
            body: JSON.stringify({
              sendToId: purchase.user_id,
              amount: purchase.credits_purchased
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Distribution failed' }));
          throw new Error(error.message || 'Failed to distribute tokens');
        }

        // Update purchase record to mark tokens distributed
        await supabaseAny
          .from('credit_purchases')
          .update({ 
            metadata: { 
              ...purchase.metadata, 
              tokens_distributed: true,
              distributed_at: new Date().toISOString()
            }
          })
          .eq('id', purchase.id);

        results.successful++;
        console.log(`[Token Distribution] ✅ Distributed to ${purchase.user_id}`);

      } catch (error) {
        results.failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Token Distribution] ❌ Failed for ${purchase.user_id}:`, errorMsg);
        
        results.errors.push({
          user_id: purchase.user_id,
          credits: purchase.credits_purchased,
          error: errorMsg
        });
      }
    }

    console.log(`[Token Distribution] Complete:`, results);

    return NextResponse.json({
      success: true,
      campaign_id: campaignId,
      campaign_title: campaign.title,
      summary: {
        total_distributions: results.total,
        successful: results.successful,
        failed: results.failed
      },
      ...(results.errors.length > 0 && { errors: results.errors })
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Token Distribution] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Failed to distribute tokens',
      details: errMsg 
    }, { status: 500 });
  }
}

