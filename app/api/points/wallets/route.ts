import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get internal user ID from Privy ID
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get all point wallets for this user with community info
    const { data: wallets, error: walletsError } = await supabase
      .from('point_wallets')
      .select(`
        id,
        club_id,
        balance_pts,
        last_activity_at,
        created_at,
        updated_at,
        clubs!inner (
          id,
          name,
          city,
          image_url
        )
      `)
      .eq('user_id', internalUser.id);

    if (walletsError) {
      throw walletsError;
    }

    // Get recent transactions for each wallet (last 10)
    const walletIds = wallets?.map(w => w.id) || [];
    let transactions = [];
    
    if (walletIds.length > 0) {
      const { data: transactionData, error: transactionError } = await supabase
        .from('point_transactions')
        .select('*')
        .in('wallet_id', walletIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (transactionError) {
        throw transactionError;
      }
      
      transactions = transactionData || [];
    }

    // Group transactions by wallet ID
    const transactionsByWallet = transactions.reduce((acc, tx) => {
      if (!acc[tx.wallet_id]) {
        acc[tx.wallet_id] = [];
      }
      acc[tx.wallet_id].push(tx);
      return acc;
    }, {} as Record<string, typeof transactions>);

    // Combine wallet data with transactions
    const walletsWithTransactions = wallets?.map(wallet => ({
      ...wallet,
      recent_transactions: transactionsByWallet[wallet.id] || []
    })) || [];

    return NextResponse.json({
      wallets: walletsWithTransactions
    });

  } catch (error) {
    console.error('Error fetching wallets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wallets' },
      { status: 500 }
    );
  }
}
