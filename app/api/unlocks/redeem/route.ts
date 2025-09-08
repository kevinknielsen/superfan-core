import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { type } from "arktype";
import { STATUS_THRESHOLDS } from "@/lib/status";

// Type assertion for club schema tables (temporary workaround for outdated types)
const supabaseAny = supabase as any;

const redeemSchema = type({
  unlock_id: "string",
  club_id: "string"
});

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const redeemData = redeemSchema(body);

  if (redeemData instanceof type.errors) {
    console.error("[Unlock Redeem API] Invalid request body:", redeemData);
    return NextResponse.json(
      { error: "Invalid request body", message: redeemData.summary },
      { status: 400 }
    );
  }

  try {
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      console.error("[Unlock Redeem API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the unlock details
    const { data: unlock, error: unlockError } = await supabaseAny
      .from('unlocks')
      .select('*')
      .eq('id', redeemData.unlock_id)
      .eq('club_id', redeemData.club_id)
      .eq('is_active', true)
      .single();

    if (unlockError) {
      console.error("[Unlock Redeem API] Unlock not found:", unlockError);
      return NextResponse.json({ error: "Unlock not found or inactive" }, { status: 404 });
    }

    // Get user's club membership
    const { data: membership, error: membershipError } = await supabaseAny
      .from('club_memberships')
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', redeemData.club_id)
      .eq('status', 'active')
      .single();

    if (membershipError) {
      console.error("[Unlock Redeem API] Membership not found:", membershipError);
      return NextResponse.json({ error: "You must be a member of this club" }, { status: 403 });
    }

    // Derive status points from unified view
    const { data: walletView, error: walletViewError } = await supabase
      .from('v_point_wallets')
      .select('status_pts')
      .eq('user_id', user.id)
      .eq('club_id', redeemData.club_id)
      .single();

    if (walletViewError) {
      console.error("[Unlock Redeem API] Wallet not found for status check:", walletViewError);
      return NextResponse.json({ error: "Wallet not found for this club" }, { status: 404 });
    }

    // Check if user has enough points for this unlock based on unified thresholds
    if (!unlock.min_status || !(unlock.min_status in STATUS_THRESHOLDS)) {
      console.error(`[Unlock Redeem API] Invalid min_status: ${unlock.min_status} for unlock ${redeemData.unlock_id}`);
      return NextResponse.json({ 
        error: "Unlock configuration error: invalid minimum status requirement" 
      }, { status: 500 });
    }
    const requiredPoints = STATUS_THRESHOLDS[unlock.min_status as keyof typeof STATUS_THRESHOLDS];
    const statusPoints = walletView?.status_pts || 0;
    if (statusPoints < requiredPoints) {
      return NextResponse.json({ 
        error: `Insufficient status points. You need ${requiredPoints} to redeem (${unlock.min_status}).`,
        required_points: requiredPoints,
        current_points: statusPoints
      }, { status: 403 });
    }

    // Check if already redeemed (idempotency check)
    const { data: existingRedemption, error: redemptionCheckError } = await supabaseAny
      .from('redemptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('unlock_id', redeemData.unlock_id)
      .single();

    // If we found an existing redemption, return the existing result (idempotent)
    if (existingRedemption && !redemptionCheckError) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        redemption: existingRedemption,
        unlock: {
          title: unlock.title,
          description: unlock.description,
          unlock_type: unlock.type,
          metadata: unlock.rules
        },
        message: `Already redeemed: ${unlock.title}`
      });
    }

    // Check capacity limits if specified (including 0)
    if (typeof unlock.rules?.capacity === 'number') {
      const { count: redemptionCount, error: countError } = await supabaseAny
        .from('redemptions')
        .select('*', { count: 'exact', head: true })
        .eq('unlock_id', redeemData.unlock_id)
        .eq('status', 'confirmed');

      if (countError) {
        console.error("[Unlock Redeem API] Error checking capacity:", countError);
      } else if (redemptionCount >= unlock.rules.capacity) {
        return NextResponse.json({ 
          error: "This unlock has reached its capacity limit" 
        }, { status: 409 });
      }
    }

    // Check expiry date if specified
    if (unlock.rules?.expiry_date) {
      const expiryDate = new Date(unlock.rules.expiry_date);
      if (new Date() > expiryDate) {
        return NextResponse.json({ 
          error: "This unlock has expired" 
        }, { status: 410 });
      }
    }

    // Create redemption record
    const { data: redemption, error: createError } = await supabaseAny
      .from('redemptions')
      .insert({
        user_id: user.id,
        unlock_id: redeemData.unlock_id,
        status: 'confirmed',
        metadata: {
          unlock_title: unlock.title,
          unlock_type: unlock.type,
          user_status_at_redemption: membership.current_status,
          user_points_at_redemption: statusPoints,
          club_id: redeemData.club_id
        }
      })
      .select()
      .single();

    if (createError) {
      console.error("[Unlock Redeem API] Error creating redemption:", createError);
      
      // Check if this is a unique constraint violation (duplicate redemption)
      if (createError.code === '23505' || // Postgres unique violation
          createError.message?.includes('duplicate') ||
          createError.message?.includes('unique') ||
          createError.message?.includes('uniq_redemptions_user_unlock')) {
        
        // Fetch the existing redemption for idempotent response
        const { data: existingRedemption } = await supabaseAny
          .from('redemptions')
          .select('*')
          .eq('user_id', user.id)
          .eq('unlock_id', redeemData.unlock_id)
          .single();
        
        if (existingRedemption) {
          return NextResponse.json({
            success: true,
            idempotent: true,
            redemption: existingRedemption,
            unlock: {
              title: unlock.title,
              description: unlock.description,
              unlock_type: unlock.type,
              metadata: unlock.rules
            },
            message: `Already redeemed: ${unlock.title}`
          });
        }
        
        return NextResponse.json({ 
          error: "You have already redeemed this unlock" 
        }, { status: 409 });
      }
      
      return NextResponse.json({ error: "Failed to redeem unlock" }, { status: 500 });
    }

    console.log(`[Unlock Redeem API] User ${auth.userId} redeemed "${unlock.title}" in club ${redeemData.club_id}`);

    // Send notification (truly fire and forget with timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notifications/perk-redemption`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redemption_id: redemption.id,
        unlock_id: redeemData.unlock_id,
      }),
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        console.warn("[Unlock Redeem API] Notification failed, but redemption succeeded");
      } else {
        console.log("[Unlock Redeem API] Notification sent successfully");
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.warn("[Unlock Redeem API] Notification timeout, but redemption succeeded");
      } else {
        console.warn("[Unlock Redeem API] Notification error:", error.message);
      }
    });

    // Return success with redemption details
    return NextResponse.json({
      success: true,
      redemption: redemption,
      unlock: {
        title: unlock.title,
        description: unlock.description,
        unlock_type: unlock.type,
        metadata: unlock.rules
      },
      message: `Successfully redeemed: ${unlock.title}`
    });

  } catch (error) {
    console.error("[Unlock Redeem API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
