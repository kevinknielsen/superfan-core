import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { type } from "arktype";
import { createServiceClient } from "../../supabase";

const generateQRSchema = type({
  club_id: "string",
  source: "string", // 'show_entry', 'merch_purchase', 'location', 'event', etc.
  location: "string?",
  points: "number?",
  expires_at: "string?", // ISO date string
  metadata: "unknown?"
});

export async function POST(request: NextRequest) {
  console.log("[QR Generate API] Starting QR generation request");
  
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    console.log("[QR Generate API] Authentication failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[QR Generate API] Authentication successful:", {
    userId: auth.userId,
    type: auth.type
  });

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
    // Initialize service client for database operations
    const supabase = createServiceClient();
    
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
    // Prefer current request origin for local and preview; fall back to configured prod URL
    const requestUrl = new URL(request.url);
    const isLocalDev = ['localhost', '127.0.0.1'].includes(requestUrl.hostname);
    const isVercelPreview = requestUrl.hostname.endsWith('.vercel.app');
    const baseUrl =
      (isLocalDev || isVercelPreview)
        ? `${requestUrl.protocol}//${requestUrl.host}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'https://superfan.one');
    const qrUrl = `${baseUrl}/tap?qr=${qrId}&club=${qrData.club_id}&source=${qrData.source}`;
    
    // Default point values for different QR sources
    const DEFAULT_POINTS = {
      show_entry: 100,
      merch_purchase: 50,
      event: 40,
      location: 20,
      qr_code: 20,
    };

    // Use provided points or default based on source
    const defaultPoints = DEFAULT_POINTS[qrData.source as keyof typeof DEFAULT_POINTS] || 20;
    const finalPoints = qrData.points || defaultPoints;

    // Prepare public payload for encoding
    const publicPayload = {
      club_id: qrData.club_id,
      source: qrData.source,
      location: qrData.location,
      points: finalPoints,
      expires_at: qrData.expires_at,
    };
    const encodedPayload = Buffer.from(JSON.stringify(publicPayload)).toString('base64');
    const fullQrUrl = `${qrUrl}&data=${encodedPayload}`;

    // Prepare data for database insert with validation
    const dbInsertData = {
      qr_id: qrId,
      club_id: qrData.club_id,
      created_by: auth.userId,
      source: qrData.source,
      location: qrData.location || null,
      points: finalPoints,
      expires_at: qrData.expires_at ? new Date(qrData.expires_at).toISOString() : null,
      qr_url: fullQrUrl,
      tap_url: qrUrl,
      metadata: qrData.metadata || {},
      description: (qrData.metadata as any)?.description || null
    };

    console.log("[QR Generate API] Attempting to save QR with data:", {
      ...dbInsertData,
      metadata: JSON.stringify(dbInsertData.metadata)
    });

    // Save QR code to database
    const { data: savedQR, error: saveError } = await supabase
      .from('qr_codes')
      .insert(dbInsertData)
      .select()
      .single();

    if (saveError) {
      console.error("[QR Generate API] Database error details:", {
        error: saveError,
        code: saveError.code,
        message: saveError.message,
        details: saveError.details,
        hint: saveError.hint,
        insertData: dbInsertData
      });
      return NextResponse.json({ 
        error: "Failed to save QR code", 
        details: saveError.message 
      }, { status: 500 });
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
  const limitParam = searchParams.get('limit') || '50';
  const limit = Math.min(Math.max(parseInt(limitParam) || 50, 1), 100);

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // Initialize service client for database operations
    const supabase = createServiceClient();
    
    // Fetch QR codes for the club
    const { data: qrCodes, error } = await supabase
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
