import { NextRequest, NextResponse } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { supabase } from '@/app/api/supabase';
import { getOrCreateUser } from '@/lib/user-management';

/**
 * GET /api/house/balance
 * Get current user's house account balance
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Ensure user exists in our system
    const user = await getOrCreateUser({
      privyId: auth.userId,
    });

    // Get or create house account
    let { data: houseAccount, error } = await supabase
      .from('house_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Create house account if it doesn't exist
      const { data: newAccount, error: createError } = await supabase
        .from('house_accounts')
        .insert({
          user_id: user.id,
          balance_cents: 0,
          lifetime_topup_cents: 0,
          lifetime_spend_cents: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating house account:', createError);
        return NextResponse.json(
          { error: 'Failed to create house account' },
          { status: 500 }
        );
      }
      houseAccount = newAccount;
    } else if (error) {
      console.error('Error fetching house account:', error);
      return NextResponse.json(
        { error: 'Failed to fetch house account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      houseAccount: {
        balance_cents: houseAccount.balance_cents,
        lifetime_topup_cents: houseAccount.lifetime_topup_cents,
        lifetime_spend_cents: houseAccount.lifetime_spend_cents,
      }
    });
  } catch (error) {
    console.error('Error in /api/house/balance:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
