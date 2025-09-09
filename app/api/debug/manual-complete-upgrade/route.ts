import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Manual endpoint to complete an upgrade transaction (for testing)
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    console.log('[Manual Complete] Processing session:', session_id);

    // Find the transaction by session ID
    const { data: transaction, error: transactionError } = await supabaseAny
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_session_id', session_id)
      .single();

    if (transactionError) {
      console.error('[Manual Complete] Transaction not found:', transactionError);
      return NextResponse.json({ 
        error: "Transaction not found",
        session_id: session_id 
      }, { status: 404 });
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
    const { error: processError } = await supabaseAny.rpc('process_successful_upgrade_by_session', {
      p_session_id: session_id,
      p_payment_intent_id: fakePaymentIntentId
    });

    if (processError) {
      console.error('[Manual Complete] Error processing upgrade:', processError);
      return NextResponse.json({ 
        error: "Failed to process upgrade",
        details: processError.message 
      }, { status: 500 });
    }

    // Get the updated transaction to return
    const { data: updatedTransaction, error: fetchError } = await supabaseAny
      .from('upgrade_transactions')
      .select('*')
      .eq('stripe_session_id', session_id)
      .single();

    console.log('[Manual Complete] Successfully completed upgrade for session:', session_id);

    return NextResponse.json({
      success: true,
      message: "Upgrade completed manually",
      transaction: updatedTransaction,
      fake_payment_intent: fakePaymentIntentId
    });

  } catch (error) {
    console.error("[Manual Complete] Unexpected error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      message: error.message 
    }, { status: 500 });
  }
}
