import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clubId = params.id;

    // Get club details with owner info
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select(`
        id,
        name,
        description,
        city,
        image_url,
        is_active,
        created_at,
        updated_at,
        owner_id,
        users!clubs_owner_id_fkey (
          id
        )
      `)
      .eq('id', clubId)
      .eq('is_active', true)
      .single();

    if (clubError || !club) {
      return NextResponse.json(
        { error: 'Club not found' },
        { status: 404 }
      );
    }

    // Get club membership count
    const { count: memberCount, error: countError } = await supabase
      .from('club_memberships')
      .select('*', { head: true, count: 'exact' })
      .eq('club_id', clubId)
      .eq('status', 'active');

    if (countError) {
      console.error('Error fetching member count:', countError);
    }

    // Get active rewards count
    const { count: rewardsCount, error: rewardsError } = await supabase
      .from('rewards')
      .select('*', { head: true, count: 'exact' })
      .eq('club_id', clubId)
      .eq('status', 'active');

    if (rewardsError) {
      console.error('Error fetching rewards count:', rewardsError);
    }

    // Get unlocks for this club
    const { data: unlocks, error: unlocksError } = await supabase
      .from('unlocks')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('min_status');

    if (unlocksError) {
      console.error('Error fetching unlocks:', unlocksError);
    }

    return NextResponse.json({
      ...club,
      unlocks: unlocks || [],
      stats: {
        member_count: memberCount || 0,
        active_rewards: rewardsCount || 0,
        unlock_count: unlocks?.length || 0,
      },
    });

  } catch (error) {
    console.error('Error fetching club:', error);
    return NextResponse.json(
      { error: 'Failed to fetch club' },
      { status: 500 }
    );
  }
}
