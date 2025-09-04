import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { createPointsPurchaseSession } from '@/lib/stripe';
import { generateUnifiedPurchaseBundles } from '@/lib/points';
import { verifyUnifiedAuth } from '@/app/api/auth';

const PurchaseRequestSchema = z.object({
  communityId: z.string().uuid(),
  bundleId: z.enum(['1000', '5000', '10000']), // Maps to bundle types
});

export async function POST(request: NextRequest) {
  let communityId: string | undefined;
  let bundleId: '1000' | '5000' | '10000' | undefined;
  
  try {
    // Verify authentication
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    ({ communityId, bundleId } = PurchaseRequestSchema.parse(body));

    // Get community details (simplified for unified peg)
    const { data: community, error: communityError } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', communityId)
      .single();

    if (communityError || !community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Generate purchase bundles using unified peg (1 cent per point)
    const bundles = generateUnifiedPurchaseBundles();
    
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
    // Use Vercel URL in production, fallback to localhost in development
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    // Redirect back to dashboard with modal state to preserve UX context
    const successUrl = `${baseUrl}/dashboard?club=${communityId}&purchase=success`;
    const cancelUrl = `${baseUrl}/dashboard?club=${communityId}&purchase=canceled`;

    const session = await createPointsPurchaseSession({
      communityId: community.id,
      communityName: community.name,
      points: selectedBundle.points,
      bonusPoints: selectedBundle.bonus_pts || 0,
      usdCents: selectedBundle.usd_cents,
      unitSellCents: 1, // Unified peg: 1 cent per point
      unitSettleCents: 1, // Unified peg: 1 cent per point
      successUrl,
      cancelUrl,
      userId: auth.userId,
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

    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Detailed purchase error:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      communityId,
      bundleId,
    });

    return NextResponse.json(
      { 
        error: 'Failed to create purchase session',
        details: errorMessage,
        hint: 'Check Stripe configuration and club pricing settings'
      },
      { status: 500 }
    );
  }
}
