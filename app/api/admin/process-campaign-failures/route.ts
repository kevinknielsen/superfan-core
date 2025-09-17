import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../supabase";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { processCampaignRefunds } from "@/lib/campaigns/refunds";

export const runtime = 'nodejs';

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
const supabaseAny = supabase as any;

// Process failed campaigns and issue refunds
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

    console.log('[Campaign Failure Processor] Starting campaign failure processing...');

    // Get campaigns past deadline that didn't reach goal
    const { data: failedCampaigns, error: campaignsError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .lt('campaign_deadline', new Date().toISOString())
      .lt('funding_percentage', 100)
      .eq('computed_status', 'expired');
      
    if (campaignsError) {
      console.error('[Campaign Failure Processor] Error fetching failed campaigns:', campaignsError);
      return NextResponse.json({ 
        error: 'Failed to fetch campaigns', 
        details: campaignsError.message 
      }, { status: 500 });
    }

    if (!failedCampaigns || failedCampaigns.length === 0) {
      console.log('[Campaign Failure Processor] No failed campaigns found');
      return NextResponse.json({ 
        processed_campaigns: 0,
        message: 'No failed campaigns found' 
      });
    }

    console.log(`[Campaign Failure Processor] Found ${failedCampaigns.length} failed campaigns`);

    const results = [];
    let totalRefunded = 0;
    let totalErrors = 0;

    // Process each failed campaign
    for (const campaign of failedCampaigns) {
      console.log(`[Campaign Failure Processor] Processing campaign: ${campaign.campaign_title} (${campaign.campaign_id})`);
      
      try {
        const result = await processCampaignRefunds(campaign.campaign_id);
        results.push({
          campaign_id: campaign.campaign_id,
          campaign_title: campaign.campaign_title,
          success: result.success,
          refunded_count: result.refundedCount || 0,
          error: result.error
        });
        
        if (result.success) {
          totalRefunded += result.refundedCount || 0;
        } else {
          totalErrors++;
        }
        
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Campaign Failure Processor] Error processing campaign ${campaign.campaign_id}:`, error);
        
        results.push({
          campaign_id: campaign.campaign_id,
          campaign_title: campaign.campaign_title,
          success: false,
          refunded_count: 0,
          error: errMsg
        });
        totalErrors++;
      }
    }

    console.log(`[Campaign Failure Processor] Completed processing. Refunded ${totalRefunded} participants across ${results.length} campaigns`);

    return NextResponse.json({
      processed_campaigns: results.length,
      total_refunded: totalRefunded,
      total_errors: totalErrors,
      results
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaign Failure Processor] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Campaign failure processing failed',
      details: errMsg 
    }, { status: 500 });
  }
}
