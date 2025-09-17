import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../../supabase";
import { verifyUnifiedAuth } from "../../../../auth";
import { isAdmin } from "@/lib/security.server";
import { processCampaignRefunds } from "@/lib/campaigns/refunds";

export const runtime = 'nodejs';

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
const supabaseAny = supabase as any;

// Manually trigger refunds for a specific campaign
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    
    // Verify admin authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (!isAdmin(auth.userId)) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    console.log(`[Manual Campaign Refund] Processing refunds for campaign: ${campaignId}`);

    // Get campaign details first
    const { data: campaign, error: campaignError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();
      
    if (campaignError || !campaign) {
      return NextResponse.json({ 
        error: 'Campaign not found' 
      }, { status: 404 });
    }

    // Check if campaign is actually failed
    if (campaign.computed_status !== 'expired' && campaign.funding_percentage >= 100) {
      return NextResponse.json({ 
        error: 'Campaign is not eligible for refunds',
        details: `Campaign status: ${campaign.computed_status}, Funding: ${campaign.funding_percentage}%`
      }, { status: 400 });
    }

    // Process the refunds
    const result = await processCampaignRefunds(campaignId);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        campaign_id: campaignId,
        campaign_title: campaign.campaign_title,
        refunded_count: result.refundedCount || 0,
        message: `Successfully processed ${result.refundedCount || 0} refunds for campaign "${campaign.campaign_title}"`
      });
    } else {
      return NextResponse.json({ 
        error: 'Refund processing failed',
        details: result.error
      }, { status: 500 });
    }

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Manual Campaign Refund] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Campaign refund processing failed',
      details: errMsg 
    }, { status: 500 });
  }
}

