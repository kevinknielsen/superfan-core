import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../supabase";
import { z } from "zod";

// Type assertion needed: database types don't include new club tables yet
const supabaseAny = supabase as any;

const createClubSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  point_sell_cents: z.number().int().min(1).max(1000).default(100), // Default: $1 = 1000 points
  point_settle_cents: z.number().int().min(1).max(500).default(50), // Default: 50% of sell price
  image_url: z.string().url().optional(),
}).refine(data => {
  return data.point_settle_cents <= data.point_sell_cents;
}, {
  message: "Settle price cannot exceed sell price",
  path: ["point_settle_cents"]
});

const updateClubSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  point_sell_cents: z.number().int().min(1).max(1000).optional(),
  point_settle_cents: z.number().int().min(1).max(500).optional(),
  image_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
}).refine(data => {
  // This validation should be done after fetching the existing club
  // to ensure the new values don't create an invalid state
  if (data.point_settle_cents !== undefined && data.point_sell_cents !== undefined) {
    return data.point_settle_cents <= data.point_sell_cents;
  }
  // Note: Additional validation needed against existing values
  return true;
}, {
  message: "Settle price cannot exceed sell price",
  path: ["point_settle_cents"]
});

// Get all clubs (admin only)
export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - can be disabled via environment variable for testing
  if (process.env.SKIP_ADMIN_CHECKS !== 'true' && !(await isAdmin(auth.userId))) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    // Get clubs with member counts
    const { data: clubs, error } = await supabaseAny
      .from('clubs')
      .select(`
        *,
        club_memberships(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching clubs:', error);
      return NextResponse.json({ error: "Failed to fetch clubs" }, { status: 500 });
    }

    // Format response with member counts
    const formattedClubs = clubs.map((club: any) => ({
      ...club,
      member_count: club.club_memberships?.[0]?.count || 0,
      club_memberships: undefined // Remove the nested object
    }));

    return NextResponse.json(formattedClubs);

  } catch (error) {
    console.error("[Admin Clubs API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create new club (admin only)
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - can be disabled via environment variable for testing
  if (process.env.SKIP_ADMIN_CHECKS !== 'true' && !(await isAdmin(auth.userId))) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const clubData = createClubSchema.parse(body);

    // Get admin user's internal ID
    const { data: adminUser, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !adminUser) {
      console.error(`[Admin Clubs API] Admin user ${auth.userId} not found in database`);
      return NextResponse.json({ 
        error: "Admin user not found in database. Please ensure user sync is complete." 
      }, { status: 404 });
    }

    // Create the club
    const { data: newClub, error: createError } = await supabaseAny
      .from('clubs')
      .insert({
        owner_id: adminUser.id,
        name: clubData.name,
        description: clubData.description,
        city: clubData.city,
        point_sell_cents: clubData.point_sell_cents,
        point_settle_cents: clubData.point_settle_cents,
        image_url: clubData.image_url,
        is_active: true,
        // Add pricing guardrails for safety with proper bounds
        guardrail_min_sell: Math.max(50, Math.floor(clubData.point_sell_cents * 0.5)),
        guardrail_max_sell: Math.max(
          clubData.point_sell_cents,
          Math.min(500, Math.floor(clubData.point_sell_cents * 2))
        ),
        guardrail_min_settle: Math.max(25, Math.floor(clubData.point_settle_cents * 0.5)),
        guardrail_max_settle: Math.max(
          clubData.point_settle_cents,
          Math.min(250, Math.floor(clubData.point_settle_cents * 2))
        ),
      })
      .select()
      .single();

    if (createError) {
      console.error("[Admin Clubs API] Error creating club:", createError);
      
      // Handle unique constraint violations
      if (createError.code === '23505' || createError.message?.includes('duplicate')) {
        return NextResponse.json({ 
          error: "A club with this name already exists" 
        }, { status: 409 });
      }
      
      return NextResponse.json({ error: "Failed to create club" }, { status: 500 });
    }

    console.log(`[Admin Clubs API] Created club: ${newClub.name} by admin ${auth.userId}`);

    return NextResponse.json({
      ...newClub,
      member_count: 0 // New clubs start with 0 members
    });

  } catch (error) {
    console.error("[Admin Clubs API] Unexpected error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Invalid club data",
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update club (admin only) 
export async function PUT(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - can be disabled via environment variable for testing
  if (process.env.SKIP_ADMIN_CHECKS !== 'true' && !(await isAdmin(auth.userId))) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const clubData = updateClubSchema.parse(body);

    // Build update object with only provided fields
    const updateData: any = {};
    if (clubData.name !== undefined) updateData.name = clubData.name;
    if (clubData.description !== undefined) updateData.description = clubData.description;
    if (clubData.city !== undefined) updateData.city = clubData.city;
    if (clubData.image_url !== undefined) updateData.image_url = clubData.image_url;
    if (clubData.is_active !== undefined) updateData.is_active = clubData.is_active;
    
    // Handle pricing updates with guardrails
    if (clubData.point_sell_cents !== undefined) {
      updateData.point_sell_cents = clubData.point_sell_cents;
      updateData.guardrail_min_sell = Math.max(50, Math.floor(clubData.point_sell_cents * 0.5));
      updateData.guardrail_max_sell = Math.max(
        clubData.point_sell_cents,
        Math.min(500, Math.floor(clubData.point_sell_cents * 2))
      );
    }
    if (clubData.point_settle_cents !== undefined) {
      updateData.point_settle_cents = clubData.point_settle_cents;
      updateData.guardrail_min_settle = Math.max(25, Math.floor(clubData.point_settle_cents * 0.5));
      updateData.guardrail_max_settle = Math.max(
        clubData.point_settle_cents,
        Math.min(250, Math.floor(clubData.point_settle_cents * 2))
      );
    }

    // If only one pricing field is being updated, fetch current values to validate
    if ((clubData.point_sell_cents !== undefined) !== (clubData.point_settle_cents !== undefined)) {
      const { data: existingClub, error: fetchError } = await supabaseAny
        .from('clubs')
        .select('point_sell_cents, point_settle_cents')
        .eq('id', clubData.id)
        .single();

      if (fetchError || !existingClub) {
        return NextResponse.json({ error: "Club not found" }, { status: 404 });
      }

      const newSellPrice = clubData.point_sell_cents ?? existingClub.point_sell_cents;
      const newSettlePrice = clubData.point_settle_cents ?? existingClub.point_settle_cents;

      if (newSettlePrice > newSellPrice) {
        return NextResponse.json({ 
          error: "Settle price cannot exceed sell price" 
        }, { status: 400 });
      }
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString();

    // Update the club
    const { data: updatedClub, error: updateError } = await supabaseAny
      .from('clubs')
      .update(updateData)
      .eq('id', clubData.id)
      .select(`
        *,
        club_memberships(count)
      `)
      .single();

    if (updateError) {
      console.error("[Admin Clubs API] Error updating club:", updateError);
      
      if (updateError.code === '23505' || updateError.message?.includes('duplicate')) {
        return NextResponse.json({ 
          error: "A club with this name already exists" 
        }, { status: 409 });
      }
      
      return NextResponse.json({ error: "Failed to update club" }, { status: 500 });
    }

    console.log(`[Admin Clubs API] Updated club: ${updatedClub.name}`);

    return NextResponse.json({
      ...updatedClub,
      member_count: updatedClub.club_memberships?.[0]?.count || 0,
      club_memberships: undefined
    });

  } catch (error) {
    console.error("[Admin Clubs API] Unexpected error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Invalid club data",
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
