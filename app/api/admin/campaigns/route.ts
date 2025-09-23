import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { createServiceClient } from "../../supabase";
import { isAdmin } from "@/lib/security.server";

export const runtime = 'nodejs';

// Create service client to bypass RLS for admin operations
const supabase = createServiceClient();
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
      return NextResponse.json({ 
        error: 'Failed to fetch campaigns', 
        details: campaignError.message 
      }, { status: 500 });
    }

    console.log(`[Campaigns API] Retrieved ${campaigns?.length || 0} campaigns`);
    return NextResponse.json({ campaigns: campaigns || [] });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaigns API] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch campaigns',
      details: errMsg 
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

    const body = await request.json();
    
    // Validate required fields
    if (!body.title || !body.club_id || !body.funding_goal_cents) {
      return NextResponse.json({ 
        error: 'Missing required fields: title, club_id, funding_goal_cents' 
      }, { status: 400 });
    }

    console.log('[Campaigns API] Creating new campaign:', body.title);

    // Create campaign
    const { data: campaign, error: createError } = await supabaseAny
      .from('campaigns')
      .insert({
        club_id: body.club_id,
        title: body.title,
        description: body.description || null,
        funding_goal_cents: parseInt(body.funding_goal_cents),
        deadline: body.deadline || null,
        ticket_price_cents: parseInt(body.ticket_price_cents || '1800'), // Default $18
        status: 'draft'
      })
      .select('*')
      .single();

    if (createError) {
      console.error('[Campaigns API] Error creating campaign:', createError);
      return NextResponse.json({ 
        error: 'Failed to create campaign', 
        details: createError.message 
      }, { status: 500 });
    }

    console.log(`[Campaigns API] Created campaign ${campaign.id}: ${campaign.title}`);
    return NextResponse.json(campaign);

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Campaigns API] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Failed to create campaign',
      details: errMsg 
    }, { status: 500 });
  }
}
