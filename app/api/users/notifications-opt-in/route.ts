import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/app/api/supabase";
import { verifyUnifiedAuth } from "@/app/api/auth";

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Validate request body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    
    const { notifications_opt_in } = body;

    if (typeof notifications_opt_in !== 'boolean') {
      return NextResponse.json({ error: "Invalid notifications_opt_in value" }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    // Get the user from our database - use correct column based on auth type
    const userIdColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
      return NextResponse.json({ error: 'Invalid auth type' }, { status: 400 });
    }
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq(userIdColumn, auth.userId)
      .single();

    if (userError) {
      console.error("[Notifications Opt-in API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the user's notifications opt-in status
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ 
        notifications_opt_in,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select('notifications_opt_in')
      .single();

    if (updateError) {
      console.error("[Notifications Opt-in API] Error updating user:", updateError);
      return NextResponse.json({ error: "Failed to update notifications preference" }, { status: 500 });
    }

    console.log(`[Notifications Opt-in API] User ${auth.userId} set notifications_opt_in to ${notifications_opt_in}`);

    return NextResponse.json({ 
      success: true, 
      notifications_opt_in: updatedUser.notifications_opt_in 
    });

  } catch (error) {
    console.error("[Notifications Opt-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    
    // Get the user's current notifications opt-in status - use correct column based on auth type
    const userIdColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    if (!['farcaster_id', 'privy_id'].includes(userIdColumn)) {
      return NextResponse.json({ error: 'Invalid auth type' }, { status: 400 });
    }
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('notifications_opt_in')
      .eq(userIdColumn, auth.userId)
      .single();

    if (userError) {
      console.error("[Notifications Opt-in API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      notifications_opt_in: user.notifications_opt_in 
    });

  } catch (error) {
    console.error("[Notifications Opt-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
