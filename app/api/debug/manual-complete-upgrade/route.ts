import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { createServiceClient } from "../../supabase";

// Manual endpoint to complete an upgrade transaction (for testing)
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Manual Complete Upgrade API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  // Restrict to non-production environments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Create service client to bypass RLS
  const supabase = createServiceClient();

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { session_id } = body as { session_id?: string };

    // Validate session_id shape
    if (typeof session_id !== 'string' || session_id.length === 0 || !session_id.startsWith('cs_')) {
      return NextResponse.json({ 
        error: "session_id is required and must be a Stripe Checkout session id (cs_...)" 
      }, { status: 400 });
    }

    // Resolve authenticated user ID from the auth service
    // The auth.userId should already be the internal user ID from verifyUnifiedAuth
    const userId = auth.userId;
    if (!userId) {
      return NextResponse.json({ 
        error: "Unable to resolve user identity" 
      }, { status: 401 });
    }

    console.log('[Manual Complete] Processing session:', session_id);

    // Find the transaction by session ID
    const { data: transaction, error: transactionError } = await supabase
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_session_id', session_id)
      .single();

    if (transactionError) {
      if (transactionError.code === 'PGRST116') {
        return NextResponse.json({ 
          error: "Transaction not found",
          session_id: session_id 
        }, { status: 404 });
      } else {
        console.error('[Manual Complete] Database error fetching transaction:', transactionError);
        return NextResponse.json({ 
          error: "Database error",
          session_id: session_id 
        }, { status: 500 });
      }
    }

    // Verify transaction ownership
    if (transaction.user_id !== userId) {
      return NextResponse.json({ 
        error: "Forbidden - Transaction does not belong to authenticated user",
        session_id: session_id 
      }, { status: 403 });
    }

    if (transaction.status === 'completed') {
      return NextResponse.json({ 
        message: "Transaction already completed",
        transaction: transaction 
      });
    }

    // Simulate successful payment processing
    const fakePaymentIntentId = `pi_test_${session_id.slice(-10)}`;
    
    console.log('[Manual Complete] Simulating successful payment with intent:', fakePaymentIntentId);

    // Use the session-based processing function
    const { error: processError } = await (supabase as any).rpc('process_successful_upgrade_by_session', {
      p_session_id: session_id,
      p_payment_intent_id: fakePaymentIntentId
    });

    if (processError) {
      console.error('[Manual Complete] Error processing upgrade:', processError);
      return NextResponse.json({ error: "Failed to process upgrade" }, { status: 500 });
    }

    // Get the updated transaction to return
    const { data: updatedTransaction, error: fetchError } = await supabase
      .from('upgrade_transactions')
      .select('id,user_id,club_id,reward_id,status,stripe_session_id,amount_cents,purchase_type,updated_at,created_at')
      .eq('stripe_session_id', session_id)
      .single();

    if (fetchError || !updatedTransaction) {
      console.error('[Manual Complete] Failed to fetch updated transaction:', fetchError);
      return NextResponse.json({ 
        error: "Failed to retrieve updated transaction",
        session_id: session_id 
      }, { status: 500 });
    }

    console.log('[Manual Complete] Successfully completed upgrade for session:', session_id);

    return NextResponse.json({
      success: true,
      message: "Upgrade completed manually",
      transaction: updatedTransaction,
      fake_payment_intent: fakePaymentIntentId
    });

  } catch (error) {
    console.error("[Manual Complete] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
