import { NextRequest, NextResponse } from 'next/server';

// Test endpoint to check Stripe configuration without making actual calls
export async function GET(request: NextRequest) {
  try {
    const config = {
      stripe_secret_key: !!process.env.STRIPE_SECRET_KEY,
      stripe_publishable_key: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      stripe_webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET,
      stripe_api_version: process.env.STRIPE_API_VERSION || '2024-10-28',
      app_url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    };

    // Check if Stripe can be imported
    let stripeImportError = null;
    try {
      const { stripe } = await import('@/lib/stripe');
      // Test if stripe client is working
      await stripe.accounts.retrieve(); // This will fail but tell us if Stripe is configured
    } catch (error) {
      stripeImportError = error instanceof Error ? error.message : 'Unknown Stripe error';
    }

    return NextResponse.json({
      environment_variables: config,
      stripe_import_error: stripeImportError,
      recommendations: {
        missing_vars: Object.entries(config)
          .filter(([key, value]) => !value && key !== 'stripe_api_version')
          .map(([key]) => key),
        next_steps: [
          'Set missing environment variables',
          'Verify Stripe keys are valid',
          'Check club pricing configuration'
        ]
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Configuration check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
