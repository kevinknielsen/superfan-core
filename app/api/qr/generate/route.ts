import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { type } from "arktype";
import { supabase } from "../../supabase";

const generateQRSchema = type({
  club_id: "string",
  source: "string", // 'show_entry', 'merch_purchase', 'location', 'event', etc.
  location: "string?",
  points: "number?",
  expires_at: "string?", // ISO date string
  metadata: "unknown?"
});

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const qrData = generateQRSchema(body);

  if (qrData instanceof type.errors) {
    console.error("[QR Generate API] Invalid request body:", qrData);
    return NextResponse.json(
      { error: "Invalid request body", message: qrData.summary },
      { status: 400 }
    );
  }

  try {
    // Create QR code data payload
    const qrPayload = {
      club_id: qrData.club_id,
      source: qrData.source,
      location: qrData.location,
      points: qrData.points,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
      expires_at: qrData.expires_at,
      metadata: qrData.metadata || {}
    };

    // Generate unique QR ID for tracking
    const qrId = crypto.randomUUID();
    
    // Create the QR code URL that will trigger the tap-in
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.superfan.one';
    const qrUrl = `${baseUrl}/tap?qr=${qrId}&club=${qrData.club_id}&source=${qrData.source}`;
    
    // Prepare public payload for encoding
    const publicPayload = {
      club_id: qrData.club_id,
      source: qrData.source,
      location: qrData.location,
      points: qrData.points,
      expires_at: qrData.expires_at,
    };
    const encodedPayload = Buffer.from(JSON.stringify(publicPayload)).toString('base64');
    const fullQrUrl = `${qrUrl}&data=${encodedPayload}`;

    // Save QR code to database
    const { data: savedQR, error: saveError } = await (supabase as any)
      .from('qr_codes')
      .insert({
        qr_id: qrId,
        club_id: qrData.club_id,
        created_by: auth.userId,
        source: qrData.source,
        location: qrData.location,
        points: qrData.points,
        expires_at: qrData.expires_at,
        qr_url: fullQrUrl,
        tap_url: qrUrl,
        metadata: qrData.metadata || {},
        description: qrData.metadata?.description
      })
      .select()
      .single();

    if (saveError) {
      console.error("[QR Generate API] Error saving QR code:", saveError);
      return NextResponse.json({ error: "Failed to save QR code" }, { status: 500 });
    }

    const response = {
      qr_id: qrId,
      qr_url: fullQrUrl,
      qr_data: qrPayload,
      tap_url: qrUrl,
      expires_at: qrData.expires_at,
      created_at: qrPayload.created_at,
      saved_qr: savedQR
    };

    console.log(`[QR Generate API] QR code created and saved for club ${qrData.club_id}, source: ${qrData.source}`);

    return NextResponse.json(response);

  } catch (error) {
    console.error("[QR Generate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get QR codes for a club (for club admins)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('club_id');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // Fetch QR codes for the club
    const { data: qrCodes, error } = await (supabase as any)
      .from('qr_codes')
      .select(`
        *,
        clubs:club_id (name)
      `)
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[QR Generate API] Error fetching QR codes:", error);
      return NextResponse.json({ error: "Failed to fetch QR codes" }, { status: 500 });
    }

    // Transform data to match expected format
    const transformedQRs = qrCodes?.map((qr: any) => ({
      qr_id: qr.qr_id,
      qr_url: qr.qr_url,
      qr_data: {
        club_id: qr.club_id,
        source: qr.source,
        location: qr.location,
        points: qr.points,
        expires_at: qr.expires_at,
        metadata: qr.metadata
      },
      tap_url: qr.tap_url,
      expires_at: qr.expires_at,
      created_at: qr.created_at,
      club_name: qr.clubs?.name || 'Unknown Club',
      usage_count: qr.usage_count,
      last_used_at: qr.last_used_at
    })) || [];

    return NextResponse.json({
      qr_codes: transformedQRs,
      club_id: clubId,
      total: transformedQRs.length
    });

  } catch (error) {
    console.error("[QR Generate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
