import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../../../auth";
import { createServiceClient } from "../../../../../supabase";
import type { Database } from "@/types/database.types";

export const runtime = 'nodejs';

// Create service client for database operations
const supabase = createServiceClient();

// Redeem tickets for a campaign item
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; item_id: string } }
) {
  const { id: campaignId, item_id: itemId } = await params;

  try {
    // Get authenticated user
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user from our database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const actualUserId = user.id;

    // Get the campaign item (tier reward with ticket campaign info)
    const { data: item, error: itemError } = await supabase
      .from('tier_rewards')
      .select(`
        id,
        title,
        ticket_cost,
        is_ticket_campaign,
        campaign_id,
        clubs!inner(name)
      `)
      .eq('id', itemId)
      .eq('campaign_id', campaignId)
      .eq('is_ticket_campaign', true)
      .single();

    if (itemError || !item) {
      console.error('Campaign item not found:', itemError);
      return NextResponse.json({ error: 'Campaign item not found' }, { status: 404 });
    }

    // Simplified: Always use the item's defined ticket cost
    const ticketsToSpend = item.ticket_cost;

    // Use database function to atomically spend tickets
    const { data: success, error: spendError } = await supabase
      .rpc('spend_tickets_for_item', {
        p_user_id: actualUserId,
        p_campaign_id: campaignId,
        p_item_id: itemId,
        p_tickets_to_spend: ticketsToSpend
      });

    if (spendError || !success) {
      console.error('Failed to redeem tickets:', spendError);
      
      // Get user's current ticket balance for better error message
      const { data: ticketBalance } = await supabase
        .rpc('get_user_ticket_balance', {
          p_user_id: actualUserId,
          p_campaign_id: campaignId
        });

      const currentBalance = ticketBalance || 0;
      const needMore = ticketsToSpend - currentBalance;

      if (needMore > 0) {
        return NextResponse.json({ 
          error: `Not enough tickets. You have ${currentBalance}, need ${ticketsToSpend} (${needMore} more required)`,
          current_balance: currentBalance,
          required: ticketsToSpend,
          need_more: needMore
        }, { status: 400 });
      }

      return NextResponse.json({ error: 'Failed to redeem tickets' }, { status: 500 });
    }

    console.log(`[Ticket Redemption] User ${actualUserId} redeemed ${ticketsToSpend} tickets for item ${item.title}`);

    return NextResponse.json({
      success: true,
      item_redeemed: item.title,
      tickets_spent: ticketsToSpend,
      message: `Successfully redeemed ${item.title}! Check your email for fulfillment details.`
    });

  } catch (error) {
    console.error('Error processing ticket redemption:', error);
    return NextResponse.json({ error: 'Failed to process redemption' }, { status: 500 });
  }
}
