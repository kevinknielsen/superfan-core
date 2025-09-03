import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

const TransferPointsSchema = z.object({
  clubId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
  recipientPrivyId: z.string().optional(),
  pointsToTransfer: z.number().int().positive().max(10000), // Reasonable limit
  message: z.string().max(500).optional(),
  transferType: z.enum(['purchased_only', 'any']).default('purchased_only'), // Only allow transferring purchased points by default
}).refine(data => data.recipientEmail || data.recipientPrivyId, {
  message: "Either recipientEmail or recipientPrivyId must be provided"
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      clubId, 
      recipientEmail, 
      recipientPrivyId, 
      pointsToTransfer, 
      message, 
      transferType 
    } = TransferPointsSchema.parse(body);

    // Get sender's internal user ID
    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('id, email')
      .eq('privy_id', auth.userId)
      .single();

    if (senderError || !sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    // Find recipient user
    let recipientQuery = supabase.from('users').select('id, email, privy_id');
    
    if (recipientEmail) {
      recipientQuery = recipientQuery.eq('email', recipientEmail);
    } else {
      recipientQuery = recipientQuery.eq('privy_id', recipientPrivyId);
    }

    const { data: recipient, error: recipientError } = await recipientQuery.single();

    if (recipientError || !recipient) {
      return NextResponse.json({ 
        error: 'Recipient not found. They may need to join the platform first.' 
      }, { status: 404 });
    }

    // Prevent self-transfer
    if (sender.id === recipient.id) {
      return NextResponse.json({ error: 'Cannot transfer points to yourself' }, { status: 400 });
    }

    // Get sender's wallet
    const { data: senderWallet, error: senderWalletError } = await supabase
      .from('point_wallets')
      .select('id, balance_pts, earned_pts, purchased_pts')
      .eq('user_id', sender.id)
      .eq('club_id', clubId)
      .single();

    if (senderWalletError || !senderWallet) {
      return NextResponse.json({ error: 'Sender wallet not found' }, { status: 404 });
    }

    // Check if sender has enough points
    const availableForTransfer = transferType === 'purchased_only' 
      ? senderWallet.purchased_pts 
      : senderWallet.balance_pts;

    if (availableForTransfer < pointsToTransfer) {
      return NextResponse.json({ 
        error: `Insufficient ${transferType === 'purchased_only' ? 'purchased' : ''} points for transfer`,
        available: availableForTransfer,
        requested: pointsToTransfer
      }, { status: 400 });
    }

    // Get or create recipient's wallet
    let { data: recipientWallet, error: recipientWalletError } = await supabase
      .from('point_wallets')
      .select('id, balance_pts, purchased_pts')
      .eq('user_id', recipient.id)
      .eq('club_id', clubId)
      .single();

    // Create recipient wallet if it doesn't exist
    if (recipientWalletError && recipientWalletError.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('point_wallets')
        .insert({
          user_id: recipient.id,
          club_id: clubId,
          balance_pts: 0,
          earned_pts: 0,
          purchased_pts: 0,
          spent_pts: 0,
          escrowed_pts: 0
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }
      recipientWallet = newWallet;
    } else if (recipientWalletError) {
      throw recipientWalletError;
    }

    // Execute transfer in transaction
    const { data: transferResult, error: transferError } = await supabase.rpc('transfer_points', {
      sender_wallet_id: senderWallet.id,
      recipient_wallet_id: recipientWallet!.id,
      points_amount: pointsToTransfer,
      transfer_type: transferType,
      transfer_message: message || `Transfer from ${sender.email}`
    });

    if (transferError) {
      console.error('Transfer function error:', transferError);
      return NextResponse.json({ 
        error: 'Transfer failed', 
        details: transferError.message 
      }, { status: 500 });
    }

    // Check if the transfer was successful
    if (!transferResult?.success) {
      return NextResponse.json({
        error: transferResult?.error || 'Transfer failed',
        details: transferResult
      }, { status: 400 });
    }

    // Record transfer transactions
    const transferRef = `transfer_${Date.now()}`;
    
    // Sender transaction (outgoing)
    await supabase
      .from('point_transactions')
      .insert({
        wallet_id: senderWallet.id,
        type: 'SPEND',
        pts: pointsToTransfer,
        source: 'transferred',
        affects_status: false,
        ref: transferRef,
        metadata: {
          transfer_type: 'outgoing',
          recipient_email: recipient.email,
          message: message,
          transfer_source: transferType
        }
      });

    // Recipient transaction (incoming)
    await supabase
      .from('point_transactions')
      .insert({
        wallet_id: recipientWallet!.id,
        type: 'PURCHASE',
        pts: pointsToTransfer,
        source: 'transferred',
        affects_status: false, // Transferred points don't affect status
        ref: transferRef,
        metadata: {
          transfer_type: 'incoming',
          sender_email: sender.email,
          message: message
        }
      });

    return NextResponse.json({
      success: true,
      transfer: {
        points_transferred: pointsToTransfer,
        recipient_email: recipient.email,
        transfer_type: transferType,
        message: message,
        reference: transferRef
      }
    });

  } catch (error) {
    console.error('Points transfer error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to transfer points' }, { status: 500 });
  }
}

// Get transfer history
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

    // Get transfer transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .eq('source', 'transferred')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (transactionsError) {
      throw transactionsError;
    }

    return NextResponse.json({
      transfer_history: transactions || [],
      total_records: transactions?.length || 0
    });

  } catch (error) {
    console.error('Error fetching transfer history:', error);
    return NextResponse.json({ error: 'Failed to fetch transfer history' }, { status: 500 });
  }
}
