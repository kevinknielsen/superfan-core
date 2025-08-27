import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { type } from "arktype";

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
    
    // TODO: Store QR data in database with qrId as key
    // For MVP, at minimum remove sensitive fields before encoding
    const publicPayload = {
      club_id: qrData.club_id,
      source: qrData.source,
      location: qrData.location,
      points: qrData.points,
      expires_at: qrData.expires_at,
    };
    const encodedPayload = Buffer.from(JSON.stringify(publicPayload)).toString('base64');
    const fullQrUrl = `${qrUrl}&data=${encodedPayload}`;

    const response = {
      qr_id: qrId,
      qr_url: fullQrUrl,
      qr_data: qrPayload,
      tap_url: qrUrl, // Simplified URL for manual testing
      expires_at: qrData.expires_at,
      created_at: qrPayload.created_at
    };

    console.log(`[QR Generate API] QR code created for club ${qrData.club_id}, source: ${qrData.source}`);

    return NextResponse.json(response);

  } catch (error) {
    console.error("[QR Generate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get QR code analytics/usage (for club admins)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clubId = searchParams.get('club_id');

  if (!clubId) {
    return NextResponse.json({ error: "club_id is required" }, { status: 400 });
  }

  try {
    // For now, return basic analytics
    // In the future, you might want to track QR usage in a separate table
    return NextResponse.json({
      message: "QR analytics coming soon",
      club_id: clubId
    });

  } catch (error) {
    console.error("[QR Generate API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
