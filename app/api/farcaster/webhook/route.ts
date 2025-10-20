import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    // Reset or create new record
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  
  record.count++;
  return false;
}

// Schema for webhook payload validation
const webhookSchema = z.object({
  type: z.string().min(1),
  data: z.any().optional(),
});

// HMAC signature verification
async function verifySignature(request: NextRequest, body: string): Promise<boolean> {
  const signature = request.headers.get('X-Farcaster-Signature');
  const secret = process.env.FARCASTER_WEBHOOK_SECRET;
  
  if (!signature || !secret) {
    console.warn('Missing signature or webhook secret');
    return false;
  }
  
  try {
    // Remove 'sha256=' prefix if present
    const receivedSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    // Compute expected signature
    const expectedSignature = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');
    
    // Timing-safe comparison
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    return receivedBuffer.length === expectedBuffer.length &&
           timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    
    // Rate limiting check
    if (isRateLimited(ip)) {
      console.warn(`Rate limit exceeded for IP: ${ip}`);
      return NextResponse.json(
        { error: 'Rate limit exceeded' }, 
        { status: 429 }
      );
    }
    
    // Get raw body
    const rawBody = await request.text();
    
    // Optional: Verify HMAC signature only if secret is configured
    // The docs don't require this, but we'll support it if you add a secret later
    const hasSecret = !!process.env.FARCASTER_WEBHOOK_SECRET;
    if (hasSecret) {
      const isValidSignature = await verifySignature(request, rawBody);
      if (!isValidSignature) {
        console.error('Invalid webhook signature');
        return NextResponse.json(
          { error: 'Unauthorized' }, 
          { status: 401 }
        );
      }
    }
    
    // Parse and validate JSON payload
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Invalid JSON in webhook payload:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON payload' }, 
        { status: 400 }
      );
    }
    
    // Validate payload structure
    const validationResult = webhookSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      console.error('Webhook payload validation failed:', validationResult.error);
      return NextResponse.json(
        { error: 'Invalid payload structure', details: validationResult.error.issues }, 
        { status: 400 }
      );
    }
    
    const body = validationResult.data;
    
    // Log the webhook event for debugging
    console.log('Farcaster webhook received:', {
      type: body.type,
      timestamp: new Date().toISOString(),
      event: body
    });

    // Handle different webhook events
    switch (body.type) {
      case 'frame_added':
        console.log('User added wallet app:', body.data);
        // TODO: Store user preference, send welcome notification, etc.
        break;
        
      case 'frame_removed':
        console.log('User removed wallet app:', body.data);
        // TODO: Handle cleanup
        break;
        
      case 'notifications_enabled':
        console.log('User enabled notifications:', body.data);
        break;
        
      case 'notifications_disabled':
        console.log('User disabled notifications:', body.data);
        break;
        
      default:
        console.log('Unknown webhook event type:', body.type);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' }, 
      { status: 500 }
    );
  }
} 