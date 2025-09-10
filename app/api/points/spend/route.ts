
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { computeStatus } from '@/lib/status';
import { 
  createStandardError, 
  createErrorResponse, 
  handleApiError 
} from '@/lib/error-handling';
import { invalidatePointsCache, getCachedUser } from '@/lib/query-cache';

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
      return createErrorResponse(createStandardError('UNAUTHORIZED'));
    }

    const body = await request.json();
    const parsed = SpendPointsSchema.parse(body);
    const { clubId, pointsToSpend, preserveStatus, referenceId } = parsed;
    
    // Normalize description: trim and treat empty/whitespace as undefined
    const description = parsed.description?.trim() || 'Point spending';

    // Get user's internal ID with caching
    const { data: user, error: userError } = await getCachedUser(supabase, auth.userId);
    if (userError || !user) {
      return createErrorResponse(createStandardError('USER_NOT_FOUND', userError));
    }

    // Get user's point wallet basic data
    const { data: wallet, error: walletError } = await supabase
      .from('point_wallets')
      .select('id')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();

    if (walletError || !wallet) {
      // Check if user is a member of the club
      const { data: membership } = await supabase
        .from('club_memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();
      
      if (!membership) {
        return createErrorResponse(createStandardError('NOT_CLUB_MEMBER'));
      }
      
      return createErrorResponse(createStandardError('WALLET_NOT_FOUND', walletError));
    }

    // Derive current status from status points (earned - escrow) via view
    const { data: walletView } = await supabase
      .from('v_point_wallets')
      .select('status_pts')
      .eq('id', wallet.id)
      .single();

    const statusPoints = walletView?.status_pts || 0;
    const currentStatus = computeStatus(statusPoints);

    // Generate reference ID for idempotency
    const ref = referenceId || `spend_${Date.now()}`;

    // Use unified database function for safe spending with status protection and atomic logging
    const { data: spendResult, error: spendError } = await supabase
      .rpc('spend_points_unified', {
        p_wallet_id: wallet.id,
        p_points_to_spend: pointsToSpend,
        p_preserve_status: preserveStatus,
        p_current_status: currentStatus,
        p_ref: ref,
        p_description: description
      });

    if (spendError) {
      return createErrorResponse(createStandardError('DATABASE_ERROR', spendError));
    }

    // Check if spending was successful
    if (!spendResult?.success) {
      const errorMessage = spendResult?.error || 'Spending failed';
      
      // Handle specific business logic errors
      if (errorMessage.includes('Insufficient points')) {
        if (errorMessage.includes('status protection')) {
          return createErrorResponse(createStandardError('INSUFFICIENT_POINTS_STATUS_PROTECTION', spendResult));
        } else {
          return createErrorResponse(createStandardError('INSUFFICIENT_POINTS', spendResult));
        }
      }
      
      // Generic business logic error
      return createErrorResponse(createStandardError('BUSINESS_LOGIC', spendResult, errorMessage));
    }

    // Invalidate cached points data after successful spending
    invalidatePointsCache(user.id, clubId);

    // Return success response with atomically handled transaction
    return NextResponse.json({
      success: true,
      idempotent: Boolean(spendResult?.idempotent),
      transaction: {
        reference: ref,
        points_spent: spendResult.points_spent,
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
    return handleApiError(error, 'points/spend');
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
