import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";
import { z } from "zod";

// Type assertion for club schema tables
const supabaseAny = supabase as any;

const toggleActiveSchema = z.object({
  is_active: z.boolean().optional(), // If not provided, will toggle current state
});

// Get single club details (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  if (!isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const { data: club, error } = await supabaseAny
      .from('clubs')
      .select(`
        *,
        club_memberships(count),
        unlocks(count),
        tap_ins(count)
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: "Club not found" }, { status: 404 });
      }
      throw error;
    }

    // Format response with counts
    const formattedClub = {
      ...club,
      member_count: club.club_memberships?.[0]?.count || 0,
      unlock_count: club.unlocks?.[0]?.count || 0,
      tap_in_count: club.tap_ins?.[0]?.count || 0,
      club_memberships: undefined,
      unlocks: undefined,
      tap_ins: undefined
    };

    return NextResponse.json(formattedClub);

  } catch (error) {
    console.error("[Admin Club Detail API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Toggle club active status (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  if (!isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { is_active } = toggleActiveSchema.parse(body);

    // Get current club state
    const { data: currentClub, error: fetchError } = await supabaseAny
      .from('clubs')
      .select('is_active')
      .eq('id', params.id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: "Club not found" }, { status: 404 });
      }
      throw fetchError;
    }

    // Determine new active state (toggle if not specified)
    const newActiveState = is_active !== undefined ? is_active : !currentClub.is_active;

    // Update club status
    const { data: updatedClub, error: updateError } = await supabaseAny
      .from('clubs')
      .update({ 
        is_active: newActiveState,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error("[Admin Club Toggle API] Error updating club:", updateError);
      return NextResponse.json({ error: "Failed to update club" }, { status: 500 });
    }

    console.log(`[Admin Club Toggle API] Club ${params.id} active status changed to: ${newActiveState}`);

    return NextResponse.json({
      ...updatedClub,
      member_count: 0 // Will be updated by calling component
    });

  } catch (error) {
    console.error("[Admin Club Toggle API] Unexpected error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Invalid request data",
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Soft delete club (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin status
  if (!isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Check if club has active members
    const { count: memberCount, error: countError } = await supabaseAny
      .from('club_memberships')
      .select('*', { count: 'exact', head: true })
      .eq('club_id', params.id)
      .eq('status', 'active');

    if (countError) {
      throw countError;
    }

    if (memberCount && memberCount > 0) {
      return NextResponse.json({ 
        error: "Cannot delete club with active members",
        details: `Club has ${memberCount} active members. Deactivate first or transfer members.`
      }, { status: 409 });
    }

    // Soft delete by setting inactive
    const { data: deletedClub, error: deleteError } = await supabaseAny
      .from('clubs')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json({ error: "Club not found" }, { status: 404 });
      }
      throw deleteError;
    }

    console.log(`[Admin Club Delete API] Soft deleted club: ${params.id}`);

    return NextResponse.json({ 
      success: true, 
      message: "Club deactivated successfully" 
    });

  } catch (error) {
    console.error("[Admin Club Delete API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
