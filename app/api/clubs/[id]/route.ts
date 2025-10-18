import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/api/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';

// Type definitions for explicit response shapes
type PublicClubData = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AuthenticatedClubData = PublicClubData & {
  usdc_wallet_address: string | null;
};

/**
 * GET /api/clubs/[id]
 * Get a specific club's details
 * - Authenticated: Returns selected fields including sensitive data (usdc_wallet_address)
 * - Unauthenticated: Returns only public fields for active clubs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: clubId } = params;
  let isAuthenticated = false;
  
  try {
    // Check authentication status
    const auth = await verifyUnifiedAuth(request);
    isAuthenticated = !!auth;
    // Note: verifyUnifiedAuth returns null for unauthenticated users (not an error)
    // Any actual errors (token validation failures, etc.) will propagate

    // Build select query - only include sensitive fields for authenticated users
    const selectFields = isAuthenticated 
      ? 'id, name, description, city, image_url, is_active, created_at, updated_at, usdc_wallet_address'
      : 'id, name, description, city, image_url, is_active, created_at, updated_at';

    // Select only needed fields to avoid exposing unnecessary data
    // Note: Using 'as any' here because Supabase types don't include 'clubs' table
    // The explicit type definitions above (PublicClubData/AuthenticatedClubData) provide compile-time safety
    const { data: club, error } = await (supabase as any)
      .from('clubs')
      .select(selectFields)
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

    // Narrow type for the selected shape (usdc_wallet_address present for authenticated)
    const clubData: PublicClubData | AuthenticatedClubData = club;

    // For unauthenticated users, only return active clubs
    if (!isAuthenticated && !clubData.is_active) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Return the data as-is (already filtered by selectFields)
    return NextResponse.json(clubData);
  } catch (error) {
    console.error('[Club API] Error', { clubId, isAuthenticated }, error);
    return NextResponse.json(
      { error: 'Failed to fetch club' },
      { status: 500 }
    );
  }
}
