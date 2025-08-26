import { NextRequest, NextResponse } from 'next/server';
import { errorLog } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const violation = await request.json();
    
    // Log CSP violations for security monitoring
    errorLog('CSP Violation Detected', {
      violation,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    // In production, you might want to send this to a security monitoring service
    // like Sentry, DataDog, or your own logging infrastructure
    
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    errorLog('Failed to process CSP report', error);
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  }
} 