import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "../supabase";
import crypto from "node:crypto";

import { verifyUnifiedAuth } from "../auth";
import { type } from "arktype";

interface TapInMetadata {
  qr_id?: string;
  scanned_at?: string;
  [key: string]: unknown;
}

const tapInSchema = type({
  club_id: "string",
  source: "string", // 'qr_code', 'nfc', 'link', 'show_entry', 'merch_purchase', etc.
  points_earned: "number?",
  location: "string?",
  metadata: "unknown?",
  idempotency_key: "string?" // Optional client-provided idempotency key
});

// Point values for different tap-in sources (from memo)
const POINT_VALUES = {
  qr_code: 20,
  nfc: 20,
  link: 10,
  show_entry: 100,
  merch_purchase: 50,
  presave: 40,
  default: 10
};

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Tap-in API] Authenticated user: ${auth.userId} (${auth.type})`);

  // Parse and validate JSON inside try/catch to handle malformed JSON gracefully
  let tapInData: any;
  try {
    const body = await request.json();
    tapInData = tapInSchema(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  
  if (tapInData instanceof type.errors) {
    console.error("[Tap-in API] Invalid request body:", tapInData);
    return NextResponse.json(
      { error: "Invalid request body", message: tapInData.summary },
      { status: 400 }
    );
  }

  try {
    // Use service client to bypass RLS for server-side operations
    const supabase = createServiceClient();
    
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      console.error("[Tap-in API] User not found:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify club exists
    const { data: club, error: clubError } = await supabase
      .from('clubs' as any)
      .select('id, name')
      .eq('id', tapInData.club_id)
      .eq('is_active', true)
      .single();

    if (clubError) {
      console.error("[Tap-in API] Club not found:", clubError);
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Check for QR code duplicate scans (for any source that has a qr_id in metadata)
    let qrId: string | null = null;
    const metadata = tapInData.metadata as TapInMetadata | undefined;
    qrId = metadata?.qr_id || null;
    
    if (qrId) {
      console.log(`[Tap-in API] Checking QR code usage for qr_id: ${qrId}, user_id: ${user.id}`);

      // Check if user already scanned this QR code
      const { data: existingScan, error: scanError } = await supabase
        .from('qr_code_usage' as any)
        .select('id')
        .eq('qr_id', qrId)
        .eq('user_id', user.id)
        .single();

      if (scanError && scanError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error("[Tap-in API] Error checking QR usage:", scanError);
        return NextResponse.json({ error: "Failed to verify QR code" }, { status: 500 });
      }

      if (existingScan) {
        console.log(`[Tap-in API] User ${user.id} already scanned QR ${qrId}`);
        return NextResponse.json({ 
          error: "You've already scanned this QR code",
          error_code: "QR_ALREADY_SCANNED"
        }, { status: 409 });
      }

      // Check if QR code has reached its usage limit
      // NOTE: usage_count may be stale under high contention. Consider using COUNT(*) from qr_code_usage
      // within the same transaction that awards points for better consistency
      const { data: qrCode, error: qrError } = await supabase
        .from('qr_codes' as any)
        .select('usage_count, max_usage_limit, is_active')
        .eq('qr_id', qrId)
        .single();

      if (qrError) {
        console.error("[Tap-in API] Error fetching QR code:", qrError);
        return NextResponse.json({ error: "QR code not found" }, { status: 404 });
      }

      if (!(qrCode as any).is_active) {
        console.log(`[Tap-in API] QR code ${qrId} is inactive`);
        return NextResponse.json({ 
          error: "This QR code is no longer active",
          error_code: "QR_INACTIVE"
        }, { status: 410 });
      }

      if ((qrCode as any).max_usage_limit && (qrCode as any).usage_count >= (qrCode as any).max_usage_limit) {
        console.log(`[Tap-in API] QR code ${qrId} has reached usage limit: ${(qrCode as any).usage_count}/${(qrCode as any).max_usage_limit}`);
        return NextResponse.json({ 
          error: "This QR code has reached its usage limit",
          error_code: "QR_LIMIT_REACHED"
        }, { status: 410 });
      }
    }

    // Determine points to award
    const pointsToAward = tapInData.points_earned || 
      (tapInData.source in POINT_VALUES ? POINT_VALUES[tapInData.source as keyof typeof POINT_VALUES] : POINT_VALUES.default);
    
    // Idempotency key: prefer client-provided header/body; else derive a deterministic fallback
    const headerKey = request.headers.get("Idempotency-Key") || undefined;
    const bodyKey = tapInData.idempotency_key as string | undefined;
    const ref =
      bodyKey ??
      headerKey ??
      // deterministic fallback: hash of stable tuple (no timestamps)
      `tapin_${crypto
        .createHash("sha256")
        .update(`${user.id}|${tapInData.club_id}|${tapInData.source}|${tapInData.location ?? ""}|${JSON.stringify(tapInData.metadata ?? {})}`)
        .digest("hex")
      }`;

    // Use unified database function for atomic tap-in processing
    const { data: tapInResult, error: tapInError } = await (supabase as any)
      .rpc('award_points_unified', {
        p_user_id: user.id,
        p_club_id: tapInData.club_id,
        p_source: tapInData.source,
        p_points: pointsToAward,
        p_location: tapInData.location,
        p_metadata: tapInData.metadata || {},
        p_ref: ref
      });

    if (tapInError) {
      console.error("[Tap-in API] Error calling award_points_unified:", tapInError);
      return NextResponse.json({ error: "Failed to process tap-in" }, { status: 500 });
    }

    // Check if the operation was successful
    if (!(tapInResult as any)?.success) {
      return NextResponse.json({ 
        error: (tapInResult as any)?.error || 'Tap-in processing failed',
        details: tapInResult
      }, { status: 500 });
    }

    // Record QR code usage if this was a QR scan
    if (qrId && (tapInResult as any)?.success) {
      try {
        const { error: usageError } = await supabase
          .from('qr_code_usage' as any)
          .insert({
            qr_id: qrId,
            user_id: user.id,
            points_awarded: (tapInResult as any).points_earned,
            tap_in_id: (tapInResult as any).tap_in?.id
          });

        if (usageError) {
          // Log the error but don't fail the tap-in since points were already awarded
          console.error("[Tap-in API] Failed to record QR usage (non-fatal):", usageError);
        } else {
          console.log(`[Tap-in API] Recorded QR usage for qr_id: ${qrId}, user_id: ${user.id}`);
        }
      } catch (error) {
        // Log the error but don't fail the tap-in since points were already awarded
        console.error("[Tap-in API] Exception recording QR usage (non-fatal):", error);
      }
    }

    // Build response with all the data from the unified function
    const response = {
      success: true,
      idempotent: Boolean((tapInResult as any)?.idempotent),
      tap_in: (tapInResult as any).tap_in,
      points_earned: (tapInResult as any).points_earned,
      total_points: (tapInResult as any).total_points,
      current_status: (tapInResult as any).current_status,
      previous_status: (tapInResult as any).previous_status,
      status_changed: (tapInResult as any).status_changed,
      club_name: (club as any).name
    };

    console.log(`[Tap-in API] Success: ${(tapInResult as any).points_earned} points awarded to user ${auth.userId} in club ${(club as any).name}`);
    if ((tapInResult as any).status_changed) {
      console.log(`[Tap-in API] Status upgraded: ${(tapInResult as any).previous_status} → ${(tapInResult as any).current_status}`);
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error("[Tap-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get tap-in history for a user/club
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('club_id');
  const raw = Number(searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, raw), 100) : 10;

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // Use service client for server-side queries
    const supabase = createServiceClient();
    // Get the user from our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // TODO: Define proper type for tap_ins table to avoid any cast
    const { data: tapIns, error } = await supabase
      .from('tap_ins' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Tap-in API] Error fetching tap-ins:", error);
      return NextResponse.json({ error: "Failed to fetch tap-ins" }, { status: 500 });
    }

    return NextResponse.json(tapIns);

  } catch (error) {
    console.error("[Tap-in API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}