import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../auth";
import { supabase } from "../supabase";

// Type assertion for enhanced schema features
const supabaseAny = supabase as any;

/**
 * POST /api/validate-purchase
 * Validate a Stripe session and confirm payment before clearing cart
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      session_id: string;
      club_id: string;
    };

    const { session_id, club_id } = body;

    // Validate inputs
    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    // Get user from database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if we have a credit_purchases record for this session
    const { data: purchase, error: purchaseError } = await supabaseAny
      .from('credit_purchases')
      .select('id, status, stripe_session_id, club_id, user_id')
      .eq('stripe_session_id', session_id)
      .eq('club_id', club_id)
      .eq('user_id', user.id)
      .single();

    // Handle database errors
    if (purchaseError) {
      // If it's a "not found" error (PGRST116), that's expected - return not validated
      if (purchaseError.code === 'PGRST116') {
        return NextResponse.json({ 
          validated: false,
          message: 'Payment not found'
        });
      }
      
      // Other database errors should be reported
      console.error('Database error checking purchase:', purchaseError);
      return NextResponse.json({ 
        error: 'Database error validating purchase',
        details: purchaseError.message
      }, { status: 500 });
    }

    if (purchase && purchase.status === 'completed') {
      return NextResponse.json({ 
        validated: true,
        message: 'Payment confirmed'
      });
    }

    // Purchase exists but not completed
    return NextResponse.json({ 
      validated: false,
      message: 'Payment not completed yet'
    });

  } catch (error) {
    console.error('Error validating purchase:', error);
    return NextResponse.json({ 
      error: 'Failed to validate purchase',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

