import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

const OperatorControlsSchema = z.object({
  earn_multiplier: z.number().min(0.5).max(5.0).optional(),
  redeem_multiplier: z.number().min(0.5).max(2.0).optional(),
  promo_active: z.boolean().optional(),
  promo_description: z.string().max(255).optional(),
  promo_discount_pts: z.number().min(0).optional(),
  promo_expires_at: z.string().datetime().optional().nullable(),
}).refine((data) => {
  // If promo is active, ensure description and discount are provided
  if (data.promo_active === true) {
    return data.promo_description && data.promo_discount_pts !== undefined;
  }
  return true;
}, {
  message: "Active promotions must have both description and discount points"
});

const StatusMultipliersSchema = z.array(z.object({
  status: z.enum(['cadet', 'resident', 'headliner', 'superfan']),
  earn_boost: z.number().min(1.0).max(3.0),
  redeem_boost: z.number().min(0.8).max(1.2),
}));

// Get operator controls for a club
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // TODO: Add proper admin check when isAdmin is available
    // For now, allow authenticated users (add admin check later)

    const clubId = params.id;

    // Get club operator controls
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select(`
        id,
        name,
        earn_multiplier,
        redeem_multiplier,
        promo_active,
        promo_description,
        promo_discount_pts,
        promo_expires_at,
        system_peg_rate,
        system_purchase_rate
      `)
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Get status multipliers
    const { data: statusMultipliers, error: statusError } = await supabase
      .from('status_multipliers')
      .select('status, earn_boost, redeem_boost')
      .eq('club_id', clubId)
      .order('status');

    if (statusError) {
      console.error('Error fetching status multipliers:', statusError);
    }

    // Get settlement pool info
    const { data: settlementPool, error: poolError } = await supabase
      .from('club_settlement_pools')
      .select('balance_usd_cents, reserved_usd_cents')
      .eq('club_id', clubId)
      .single();

    if (poolError) {
      console.error('Error fetching settlement pool:', poolError);
    }

    return NextResponse.json({
      club: {
        id: club.id,
        name: club.name,
        earn_multiplier: club.earn_multiplier,
        redeem_multiplier: club.redeem_multiplier,
        promo_active: club.promo_active,
        promo_description: club.promo_description,
        promo_discount_pts: club.promo_discount_pts,
        promo_expires_at: club.promo_expires_at,
        system_peg_rate: club.system_peg_rate,
        system_purchase_rate: club.system_purchase_rate,
      },
      status_multipliers: statusMultipliers || [],
      settlement_pool: {
        balance_usd_cents: settlementPool?.balance_usd_cents || 0,
        reserved_usd_cents: settlementPool?.reserved_usd_cents || 0,
        available_usd_cents: (settlementPool?.balance_usd_cents || 0) - (settlementPool?.reserved_usd_cents || 0),
      },
    });

  } catch (error) {
    console.error('Error fetching operator controls:', error);
    return NextResponse.json({ error: 'Failed to fetch operator controls' }, { status: 500 });
  }
}

// Update operator controls for a club
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // TODO: Add proper admin check when isAdmin is available
    // For now, allow authenticated users (add admin check later)

    const clubId = params.id;
    const body = await request.json() as any;
    
    // Validate operator controls
    const operatorControls = OperatorControlsSchema.parse(body.operator_controls || {});
    const statusMultipliers = StatusMultipliersSchema.parse(body.status_multipliers || []);

    // Update club operator controls
    if (Object.keys(operatorControls).length > 0) {
      const { error: clubError } = await supabase
        .from('clubs')
        .update(operatorControls)
        .eq('id', clubId);

      if (clubError) {
        throw clubError;
      }
    }

    // Update status multipliers
    if (statusMultipliers.length > 0) {
      for (const multiplier of statusMultipliers) {
        const { error: multiplierError } = await supabase
          .from('status_multipliers')
          .upsert({
            club_id: clubId,
            status: multiplier.status,
            earn_boost: multiplier.earn_boost,
            redeem_boost: multiplier.redeem_boost,
          }, {
            onConflict: 'club_id,status'
          });

        if (multiplierError) {
          throw multiplierError;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Operator controls updated successfully'
    });

  } catch (error) {
    console.error('Error updating operator controls:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to update operator controls' }, { status: 500 });
  }
}

// Test pricing calculation with current operator controls
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // TODO: Add proper admin check when isAdmin is available
    // For now, allow authenticated users (add admin check later)

    const clubId = params.id;
    const body = await request.json() as any;
    const { base_usd_cents, user_status } = body;

    if (!base_usd_cents || !user_status) {
      return NextResponse.json(
        { error: 'base_usd_cents and user_status are required' },
        { status: 400 }
      );
    }

    // Use the database function to calculate display price
    const { data: displayPrice, error: priceError } = await supabase
      .rpc('calculate_display_price', {
        p_base_usd_cents: base_usd_cents,
        p_club_id: clubId,
        p_user_status: user_status
      });

    if (priceError) {
      throw priceError;
    }

    return NextResponse.json({
      base_usd_cents,
      user_status,
      display_price_points: displayPrice,
      display_price_usd: `$${(displayPrice / 100).toFixed(2)}`,
      savings_points: Math.max(0, base_usd_cents - displayPrice),
      savings_usd: `$${(Math.max(0, base_usd_cents - displayPrice) / 100).toFixed(2)}`,
    });

  } catch (error) {
    console.error('Error calculating test price:', error);
    return NextResponse.json({ error: 'Failed to calculate test price' }, { status: 500 });
  }
}
