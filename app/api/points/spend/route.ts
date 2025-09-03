import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

const SpendPointsSchema = z.object({
  clubId: z.string().uuid(),
  pointsToSpend: z.number().int().positive(),
  preserveStatus: z.boolean().default(false),
  description: z.string().min(1).max(255),
  referenceId: z.string().optional(), // For linking to unlocks, purchases, etc.
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { clubId, pointsToSpend, preserveStatus, description, referenceId } = SpendPointsSchema.parse(body);

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's point wallet and current membership status
    const { data: wallet, error: walletError } = await supabase
      .from('point_wallets')
      .select('id, balance_pts, earned_pts, purchased_pts')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Point wallet not found' },
        { status: 404 }
      );
    }

    // Get current membership status for status protection
    const { data: membership, error: membershipError } = await supabase
      .from('club_memberships')
      .select('current_status')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    const currentStatus = membership?.current_status || 'cadet';

    // Use database function for safe spending with status protection
    const { data: spendResult, error: spendError } = await supabase
      .rpc('spend_points_with_protection', {
        p_wallet_id: wallet.id,
        p_points_to_spend: pointsToSpend,
        p_preserve_status: preserveStatus,
        p_current_status: currentStatus
      });

    if (spendError) {
      console.error('Error calling spend_points_with_protection:', spendError);
      return NextResponse.json(
        { error: 'Failed to process spending' },
        { status: 500 }
      );
    }

    // Check if spending was successful
    if (!spendResult?.success) {
      return NextResponse.json(
        { 
          error: spendResult?.error || 'Spending failed',
          details: spendResult
        },
        { status: 400 }
      );
    }

    // Record the spending transaction
    const { error: transactionError } = await supabase
      .from('point_transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'SPEND',
        pts: pointsToSpend,
        source: 'spent',
        affects_status: false, // Spending doesn't affect status, only earning does
        ref: referenceId || `spend_${Date.now()}`,
        metadata: {
          description,
          spent_breakdown: {
            purchased: spendResult.spent_purchased,
            earned: spendResult.spent_earned
          },
          preserve_status: preserveStatus,
          status_at_time: currentStatus
        }
      });

    if (transactionError) {
      console.error('Error recording spend transaction:', transactionError);
      
      // CRITICAL: Points were already spent, but transaction wasn't recorded
      // Implement compensation logic to maintain data integrity
      try {
        // Attempt to reverse the spending by calling the database function again
        const { data: compensationResult, error: compensationError } = await supabase
          .rpc('spend_points_with_protection', {
            p_wallet_id: wallet.id,
            p_points_to_spend: -pointsToSpend, // Negative amount to reverse
            p_preserve_status: false, // Don't preserve status during compensation
            p_current_status: currentStatus
          });

        if (compensationError || !compensationResult?.success) {
          console.error('CRITICAL: Failed to compensate for transaction recording failure:', {
            originalError: transactionError,
            compensationError,
            compensationResult,
            walletId: wallet.id,
            pointsToSpend,
            userId: user.id,
            clubId
          });
          
          // Return error but note that manual intervention may be needed
          return NextResponse.json({
            error: 'Transaction recording failed and compensation failed',
            details: 'Points may have been spent but not recorded. Manual intervention required.',
            compensation_attempted: true,
            compensation_result: compensationResult,
            original_error: transactionError.message
          }, { status: 500 });
        }
        
        console.log('Successfully compensated for transaction recording failure');
        return NextResponse.json({
          error: 'Transaction recording failed but spending was reversed',
          details: 'Please try again',
          compensation_successful: true
        }, { status: 500 });
        
      } catch (compensationError) {
        console.error('CRITICAL: Compensation logic failed:', compensationError);
        return NextResponse.json({
          error: 'Critical error: Points spent but cannot record or compensate',
          details: 'Manual database intervention required',
          wallet_id: wallet.id,
          points_affected: pointsToSpend
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      transaction: {
        points_spent: pointsToSpend,
        spent_breakdown: {
          purchased: spendResult.spent_purchased,
          earned: spendResult.spent_earned
        },
        remaining_balance: spendResult.remaining_balance,
        status_preserved: preserveStatus,
        current_status: currentStatus
      }
    });

  } catch (error) {
    console.error('Points spending error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to spend points' },
      { status: 500 }
    );
  }
}

// Get spending history and breakdown
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get('clubId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!clubId) {
      return NextResponse.json({ error: 'clubId required' }, { status: 400 });
    }

    // Get user's internal ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get point wallet
    const { data: wallet, error: walletError } = await supabase
      .from('point_wallets')
      .select('id')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    // Get spending transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .eq('source', 'spent')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (transactionsError) {
      throw transactionsError;
    }

    return NextResponse.json({
      spending_history: transactions || [],
      total_records: transactions?.length || 0
    });

  } catch (error) {
    console.error('Error fetching spending history:', error);
    return NextResponse.json({ error: 'Failed to fetch spending history' }, { status: 500 });
  }
}
