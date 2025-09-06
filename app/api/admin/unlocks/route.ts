import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../supabase";
import { type } from "arktype";

// Type assertion needed: database types don't include new club tables yet
const supabaseAny = supabase as any;

const createUnlockSchema = type({
  club_id: "string",
  title: "string",
  description: "string", 
  unlock_type: "string",
  required_status: "string",
  metadata: "unknown?"
});

const updateUnlockSchema = type({
  id: "string",
  club_id: "string",
  title: "string",
  description: "string",
  unlock_type: "string", 
  required_status: "string",
  metadata: "unknown?"
});

// Get all unlocks (admin only)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMPORARY: Skip admin check for testing
  // if (!isAdmin(auth.userId)) {
  //   return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  // }

  try {
    // Get unlocks with club information
    const { data: unlocks, error } = await supabase
      .from('unlocks')
      .select(`
        *,
        clubs!inner(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching unlocks:', error);
      return NextResponse.json({ error: "Failed to fetch unlocks" }, { status: 500 });
    }

    // Format response with club names
    const formattedUnlocks = unlocks.map((unlock: any) => ({
      ...unlock,
      club_name: unlock.clubs?.name,
      clubs: undefined // Remove the nested object
    }));

    return NextResponse.json(formattedUnlocks);

  } catch (error) {
    console.error("[Admin Unlocks API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create new unlock (admin only)
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMPORARY: Skip admin check for testing
  // if (!isAdmin(auth.userId)) {
  //   return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  // }

  const body = await request.json();
  const unlockData = createUnlockSchema(body);

  if (unlockData instanceof type.errors) {
    console.error("[Admin Unlocks API] Invalid request body:", unlockData);
    return NextResponse.json(
      { error: "Invalid request body", message: unlockData.summary },
      { status: 400 }
    );
  }

  try {
    // Verify club exists and is active
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', unlockData.club_id)
      .eq('is_active', true)
      .single();

    if (clubError) {
      return NextResponse.json({ error: "Club not found or inactive" }, { status: 404 });
    }

    // Create the unlock
    const { data: newUnlock, error: createError } = await supabase
      .from('unlocks')
      .insert({
        club_id: unlockData.club_id,
        title: unlockData.title,
        description: unlockData.description,
        unlock_type: unlockData.unlock_type,
        required_status: unlockData.required_status,
        metadata: unlockData.metadata || {},
        is_active: true,
        created_by: auth.userId
      })
      .select()
      .single();

    if (createError) {
      console.error("[Admin Unlocks API] Error creating unlock:", createError);
      return NextResponse.json({ error: "Failed to create unlock" }, { status: 500 });
    }

    console.log(`[Admin Unlocks API] Created unlock: ${newUnlock.title} for club ${club.name}`);

    return NextResponse.json({
      ...newUnlock,
      club_name: club.name
    });

  } catch (error) {
    console.error("[Admin Unlocks API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update unlock (admin only) 
export async function PUT(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMPORARY: Skip admin check for testing
  // if (!isAdmin(auth.userId)) {
  //   return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  // }

  const body = await request.json();
  const unlockData = updateUnlockSchema(body);

  if (unlockData instanceof type.errors) {
    console.error("[Admin Unlocks API] Invalid request body:", unlockData);
    return NextResponse.json(
      { error: "Invalid request body", message: unlockData.summary },
      { status: 400 }
    );
  }

  try {
    // Update the unlock
    const { data: updatedUnlock, error: updateError } = await supabase
      .from('unlocks')
      .update({
        club_id: unlockData.club_id,
        title: unlockData.title,
        description: unlockData.description,
        unlock_type: unlockData.unlock_type,
        required_status: unlockData.required_status,
        metadata: unlockData.metadata || {},
        updated_at: new Date().toISOString()
      })
      .eq('id', unlockData.id)
      .select(`
        *,
        clubs!inner(name)
      `)
      .single();

    if (updateError) {
      console.error("[Admin Unlocks API] Error updating unlock:", updateError);
      return NextResponse.json({ error: "Failed to update unlock" }, { status: 500 });
    }

    console.log(`[Admin Unlocks API] Updated unlock: ${updatedUnlock.title}`);

    return NextResponse.json({
      ...updatedUnlock,
      club_name: updatedUnlock.clubs?.name,
      clubs: undefined
    });

  } catch (error) {
    console.error("[Admin Unlocks API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
