import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { computeStatus } from '@/lib/status';

const SpendPointsSchema = z.object({
  clubId: z.string().uuid(),
  pointsToSpend: z.number().int().positive(),
  preserveStatus: z.boolean().default(false),
  description: z.string().max(255).optional(), // Allow empty descriptions
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
    const parsed = SpendPointsSchema.parse(body);
    const { clubId, pointsToSpend, preserveStatus, referenceId } = parsed;
    
    // Normalize description: trim and treat empty/whitespace as undefined
    const description = parsed.description?.trim() || 'Point spending';

    // Get user's internal ID (handle both Privy and Farcaster users)
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's point wallet basic data
    const { data: wallet, error: walletError } = await supabase
      .from('point_wallets')
      .select('id')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Point wallet not found' },
        { status: 404 }
      );
    }

    // Derive current status from status points (earned - escrow) via view
    const { data: walletView } = await supabase
      .from('v_point_wallets')
      .select('status_pts')
      .eq('id', wallet.id)
      .single();

    const statusPoints = walletView?.status_pts || 0;
    const currentStatus = computeStatus(statusPoints);

    // Use unified database function for safe spending with status protection
    const { data: spendResult, error: spendError } = await supabase
      .rpc('spend_points_unified', {
        p_wallet_id: wallet.id,
        p_points_to_spend: pointsToSpend,
        p_preserve_status: preserveStatus,
        p_current_status: currentStatus
      });

    if (spendError) {
      console.error('Error calling spend_points_unified:', spendError);
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
    const ref = referenceId || `spend_${Date.now()}`;
    const { error: transactionError } = await supabase
      .from('point_transactions')
      .insert({
        wallet_id: wallet.id,
        type: 'SPEND',
        pts: pointsToSpend,
        source: 'spent',
        affects_status: false, // Spending doesn't affect status, only earning does
        ref,
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
      
      // Check if this is a duplicate reference (idempotent request)
      if (transactionError.code === '23505' || // Postgres unique violation
          transactionError.message?.includes('duplicate') ||
          transactionError.message?.includes('unique')) {
        console.log('Duplicate transaction reference detected, treating as idempotent success:', ref);
        
        return NextResponse.json({
          success: true,
          idempotent: true,
          transaction: {
            reference: ref,
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
      }
      
      // Non-idempotent insert error: surface failure (no destructive reversal)
      return NextResponse.json({
        error: 'Spending recorded on wallet but failed to log transaction',
        details: transactionError.message,
        reference: ref
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      transaction: {
        reference: ref,
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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    if (!clubId) {
      return NextResponse.json({ error: 'clubId required' }, { status: 400 });
    }

    // Get user's internal ID (handle both Privy and Farcaster users)
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
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

    // Get spending transactions (select only needed fields)
    const { data: transactions, error: transactionsError } = await supabase
      .from('point_transactions')
      .select('id,type,pts,source,ref,created_at,metadata')
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
