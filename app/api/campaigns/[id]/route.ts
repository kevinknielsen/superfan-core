import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../../supabase";

export const runtime = 'nodejs';

// Create service client for database operations
const supabase = createServiceClient();
const supabaseAny = supabase as any;

// Get campaign details and progress (public endpoint for fans)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: campaignId } = await params;

  try {
    console.log(`[Campaign API] Fetching campaign details: ${campaignId}`);

    // Get campaign progress from view (note: view uses 'id' not 'campaign_id')
    const { data: campaign, error: campaignError } = await supabaseAny
      .from('v_campaign_progress')
      .select('*')
      .eq('id', campaignId)
      .single();
      
    if (campaignError || !campaign) {
      console.error('[Campaign API] Campaign not found:', campaignError);
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get campaign items (tier rewards for this campaign)
    const { data: items, error: itemsError } = await supabaseAny
      .from('tier_rewards')
      .select(`
        id,
        title,
        description,
        reward_type,
        upgrade_price_cents,
        ticket_cost,
        is_ticket_campaign,
        cogs_cents,
        metadata
      `)
      .eq('campaign_id', campaignId)
      .eq('is_ticket_campaign', true)
      .eq('is_active', true)
      .order('ticket_cost'); // Order by ticket cost (cheapest first)

    if (itemsError) {
      console.error('[Campaign API] Error fetching campaign items:', itemsError);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return NextResponse.json({ 
        error: 'Failed to fetch campaign items',
        ...(isDevelopment && { details: itemsError.message })
      }, { status: 500 });
    }

    // Destructure to avoid data duplication in response
    const { 
      funding_percentage, 
      current_funding_cents, 
      funding_goal_cents, 
      seconds_remaining, 
      participant_count, 
      total_tickets_sold,
      ...campaignData 
    } = campaign;

    const response = {
      ...campaignData,
      items: items || [],
      progress: {
        funding_percentage,
        current_funding_cents,
        funding_goal_cents,
        seconds_remaining,
        participant_count,
        total_tickets_sold
      }
    };

    console.log(`[Campaign API] Retrieved campaign "${campaign.title}" with ${items?.length || 0} items`);
    return NextResponse.json(response);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaign API] Unexpected error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development';
    return NextResponse.json({ 
      error: 'Failed to fetch campaign',
      ...(isDevelopment && { details: errMsg })
    }, { status: 500 });
  }
}
