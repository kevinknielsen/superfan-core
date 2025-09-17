import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../../supabase";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";

export const runtime = 'nodejs';

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
const supabaseAny = supabase as any;

// Get campaign status and monitoring data
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

    console.log('[Campaign Status] Fetching campaign status data...');

    // Get all campaigns with their status
    const { data: campaigns, error: campaignsError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .order('campaign_deadline', { ascending: false });
      
    if (campaignsError) {
      console.error('[Campaign Status] Error fetching campaigns:', campaignsError);
      return NextResponse.json({ 
        error: 'Failed to fetch campaigns', 
        details: campaignsError.message 
      }, { status: 500 });
    }

    // Get refund statistics
    const { data: refundStats, error: refundError } = await supabaseAny
      .from('reward_claims')
      .select('refund_status, campaign_id')
      .not('campaign_id', 'is', null)
      .eq('claim_method', 'upgrade_purchased');
      
    if (refundError) {
      console.error('[Campaign Status] Error fetching refund stats:', refundError);
    }

    // Process refund statistics
    const refundStatsByCampaign = new Map<string, {
      total_participants: number;
      refunded: number;
      pending_refunds: number;
      failed_refunds: number;
    }>();
    if (refundStats) {
      refundStats.forEach((claim: any) => {
        if (!refundStatsByCampaign.has(claim.campaign_id)) {
          refundStatsByCampaign.set(claim.campaign_id, {
            total_participants: 0,
            refunded: 0,
            pending_refunds: 0,
            failed_refunds: 0
          });
        }
        
        const stats = refundStatsByCampaign.get(claim.campaign_id)!;
        stats.total_participants++;
        
        switch (claim.refund_status) {
          case 'processed':
            stats.refunded++;
            break;
          case 'pending':
            stats.pending_refunds++;
            break;
          case 'failed':
            stats.failed_refunds++;
            break;
        }
      });
    }

    // Categorize campaigns
    const activeCampaigns = campaigns.filter((c: any) => c.computed_status === 'campaign_active');
    const fundedCampaigns = campaigns.filter((c: any) => c.computed_status === 'ready_to_fund');
    const expiredCampaigns = campaigns.filter((c: any) => c.computed_status === 'expired');
    const failedCampaigns = campaigns.filter((c: any) => c.campaign_status === 'campaign_failed');

    // Calculate summary statistics
    const totalCampaigns = campaigns.length;
    const totalFundingGoal = campaigns.reduce((sum: number, c: any) => sum + (c.campaign_funding_goal_cents || 0), 0);
    const totalCurrentFunding = campaigns.reduce((sum: number, c: any) => sum + (c.campaign_current_funding_cents || 0), 0);
    const totalParticipants = Array.from(refundStatsByCampaign.values()).reduce((sum: number, stats: any) => sum + stats.total_participants, 0);
    const totalRefunded = Array.from(refundStatsByCampaign.values()).reduce((sum: number, stats: any) => sum + stats.refunded, 0);

    // Add refund stats to each campaign
    const campaignsWithRefundStats = campaigns.map((campaign: any) => ({
      ...campaign,
      refund_stats: refundStatsByCampaign.get(campaign.campaign_id) || {
        total_participants: 0,
        refunded: 0,
        pending_refunds: 0,
        failed_refunds: 0
      }
    }));

    const response = {
      summary: {
        total_campaigns: totalCampaigns,
        active_campaigns: activeCampaigns.length,
        funded_campaigns: fundedCampaigns.length,
        expired_campaigns: expiredCampaigns.length,
        failed_campaigns: failedCampaigns.length,
        total_funding_goal_cents: totalFundingGoal,
        total_current_funding_cents: totalCurrentFunding,
        total_participants: totalParticipants,
        total_refunded: totalRefunded,
        overall_success_rate: totalCampaigns > 0 ? Number(((fundedCampaigns.length / totalCampaigns) * 100).toFixed(1)) : 0
      },
      campaigns: campaignsWithRefundStats,
      categories: {
        active: activeCampaigns,
        funded: fundedCampaigns,
        expired: expiredCampaigns,
        failed: failedCampaigns
      }
    };

    console.log(`[Campaign Status] Retrieved status for ${totalCampaigns} campaigns`);
    return NextResponse.json(response);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaign Status] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Campaign status fetch failed',
      details: errMsg 
    }, { status: 500 });
  }
}
