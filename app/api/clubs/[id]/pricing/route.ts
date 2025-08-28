import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { getServerUser } from '@/lib/auth-utils';
import { validatePricingGuardrails } from '@/lib/points';
import { isAdmin } from '@/lib/security';

const PricingUpdateSchema = z.object({
  sellCents: z.number().int().positive(),
  settleCents: z.number().int().positive(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clubId = params.id;
    const body = await request.json();
    const { sellCents, settleCents } = PricingUpdateSchema.parse(body);

    // Get club details and check ownership/admin permissions
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Get internal user to check ownership
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user owns the club or is admin
    const isClubOwner = club.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can update pricing' },
        { status: 403 }
      );
    }

    // Validate pricing guardrails
    const validation = validatePricingGuardrails(sellCents, settleCents, {
      guardrail_min_sell: club.guardrail_min_sell,
      guardrail_max_sell: club.guardrail_max_sell,
      guardrail_min_settle: club.guardrail_min_settle,
      guardrail_max_settle: club.guardrail_max_settle,
    });

    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid pricing', details: validation.errors },
        { status: 400 }
      );
    }

    // Update club pricing
    const { data: updatedClub, error: updateError } = await supabase
      .from('clubs')
      .update({
        point_sell_cents: sellCents,
        point_settle_cents: settleCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clubId)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      club: updatedClub,
      message: 'Pricing updated successfully',
    });

  } catch (error) {
    console.error('Error updating pricing:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update pricing' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const user = await getServerUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clubId = params.id;

    // Get club pricing details
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select(`
        id,
        name,
        point_sell_cents,
        point_settle_cents,
        guardrail_min_sell,
        guardrail_max_sell,
        guardrail_min_settle,
        guardrail_max_settle
      `)
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Get internal user to check ownership
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', user.userId)
      .single();

    if (userError || !internalUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user owns the club or is admin
    const isClubOwner = club.owner_id === internalUser.id;
    const isUserAdmin = isAdmin(user.userId);

    if (!isClubOwner && !isUserAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only club owners and admins can view pricing settings' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      club,
      current_pricing: {
        sell_cents: club.point_sell_cents,
        settle_cents: club.point_settle_cents,
      },
      guardrails: {
        min_sell: club.guardrail_min_sell,
        max_sell: club.guardrail_max_sell,
        min_settle: club.guardrail_min_settle,
        max_settle: club.guardrail_max_settle,
      },
    });

  } catch (error) {
    console.error('Error fetching pricing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pricing' },
      { status: 500 }
    );
  }
}
