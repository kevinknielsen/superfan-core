import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { createPointsPurchaseSession } from '@/lib/stripe';
import { generatePurchaseBundles } from '@/lib/points';

const PurchaseRequestSchema = z.object({
  communityId: z.string().uuid(),
  bundleId: z.enum(['1000', '5000', '10000']), // Maps to bundle types
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { communityId, bundleId } = PurchaseRequestSchema.parse(body);

    // Get community details
    const { data: community, error: communityError } = await supabase
      .from('clubs')
      .select('id, name, point_sell_cents, point_settle_cents')
      .eq('id', communityId)
      .single();

    if (communityError || !community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Generate purchase bundles
    const bundles = generatePurchaseBundles(community.point_sell_cents);
    
    // Find the requested bundle
    let selectedBundle;
    switch (bundleId) {
      case '1000':
        selectedBundle = bundles[0];
        break;
      case '5000':
        selectedBundle = bundles[1];
        break;
      case '10000':
        selectedBundle = bundles[2];
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid bundle ID' },
          { status: 400 }
        );
    }

    // Create Stripe checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/points/${communityId}?success=true`;
    const cancelUrl = `${baseUrl}/points/${communityId}?canceled=true`;

    const session = await createPointsPurchaseSession({
      communityId: community.id,
      communityName: community.name,
      points: selectedBundle.points,
      bonusPoints: selectedBundle.bonus_pts || 0,
      usdCents: selectedBundle.usd_cents,
      unitSellCents: community.point_sell_cents,
      unitSettleCents: community.point_settle_cents,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      sessionId: session.sessionId,
      url: session.url,
    });

  } catch (error) {
    console.error('Points purchase error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create purchase session' },
      { status: 500 }
    );
  }
}
