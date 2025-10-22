import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { supabase } from "../../../supabase";

// Type assertion for credit_purchases table
const supabaseAny = supabase as any;

/**
 * Get user's credit balances for all campaigns in a club
 * Simple, direct query - no dependency on rewards/items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: clubId } = await params;

  // Require authentication
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get the user from our database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('[Credit Balances API] User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = user.id;

    // Get all campaigns for this club
    const { data: campaigns, error: campaignsError } = await supabaseAny
      .from('campaigns')
      .select('id, title')
      .eq('club_id', clubId);

    if (campaignsError) {
      console.error('[Credit Balances API] Error fetching campaigns:', campaignsError);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      // No campaigns = no credits possible
      return NextResponse.json({ balances: {} });
    }

    // Get credit balance for each campaign (parallel for performance)
    const balancePromises = campaigns.map(async (campaign: { id: string; title: string }) => {
      const { data: balance, error: balanceError } = await supabaseAny
        .rpc('get_user_campaign_credits', {
          p_user_id: actualUserId,
          p_campaign_id: campaign.id
        });

      if (balanceError) {
        console.error(`[Credit Balances API] Error getting balance for campaign ${campaign.id}:`, balanceError);
        return null;
      }

      // Only include campaigns where user has credits
      if (balance && balance > 0) {
        return { id: campaign.id, title: campaign.title, balance };
      }
      return null;
    });

    const results = await Promise.all(balancePromises);
    
    const balances: Record<string, { campaign_title: string; balance: number }> = {};
    for (const result of results) {
      if (result) {
        balances[result.id] = {
          campaign_title: result.title,
          balance: result.balance
        };
      }
    }

    return NextResponse.json({ balances });

  } catch (error) {
    console.error('[Credit Balances API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

