import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

/**
 * GET /api/clubs/[id]
 * Get a specific club's details
 * - Authenticated: Returns all fields including sensitive data (usdc_wallet_address)
 * - Unauthenticated: Returns only public fields for active clubs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await params;

    // Check authentication status
    let isAuthenticated = false;
    const auth = await verifyUnifiedAuth(request);
    isAuthenticated = !!auth;
    // Note: verifyUnifiedAuth returns null for unauthenticated users (not an error)
    // Any actual errors (token validation failures, etc.) will propagate

    // Select only needed fields to avoid exposing unnecessary data
    const { data: club, error } = await (supabase as any)
      .from('clubs')
      .select('id, name, description, city, image_url, is_active, created_at, updated_at, usdc_wallet_address')
      .eq('id', clubId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Club not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    // Narrow type for the selected shape
    const clubData: {
      id: string;
      name: string;
      description: string | null;
      city: string | null;
      image_url: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      usdc_wallet_address: string | null;
    } = club;

    // For unauthenticated users, only return active clubs
    if (!isAuthenticated && !clubData.is_active) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // For unauthenticated users, filter out sensitive fields
    if (!isAuthenticated) {
      const publicFields = {
        id: clubData.id,
        name: clubData.name,
        description: clubData.description,
        city: clubData.city,
        image_url: clubData.image_url,
        is_active: clubData.is_active,
        created_at: clubData.created_at,
        updated_at: clubData.updated_at
      };
      return NextResponse.json(publicFields);
    }

    // Authenticated users get all fields
    return NextResponse.json(clubData);
  } catch (error) {
    console.error('[Club API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch club' },
      { status: 500 }
    );
  }
}
