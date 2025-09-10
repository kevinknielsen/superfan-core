import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { STATUS_THRESHOLDS, computeStatus, nextStatus as computeNext } from '@/lib/status';
import { getCachedUser, queryCache, cacheKeys } from '@/lib/query-cache';

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clubIds } = body;

    if (!Array.isArray(clubIds) || clubIds.length === 0) {
      return NextResponse.json({ error: 'clubIds array required' }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (clubIds.length > 50) {
      return NextResponse.json({ error: 'Too many clubs requested (max 50)' }, { status: 400 });
    }

    // Get user ID with caching
    const { data: user, error: userError } = await getCachedUser(supabase, auth.userId);
    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check cache for any existing points data
    const cachedResults: Record<string, any> = {};
    const uncachedClubIds: string[] = [];

    for (const clubId of clubIds) {
      const cacheKey = cacheKeys.pointsBreakdown(user.id, clubId);
      const cached = queryCache.get(cacheKey);
      
      if (cached) {
        cachedResults[clubId] = cached;
      } else {
        uncachedClubIds.push(clubId);
      }
    }

    // Fetch uncached data in batch
    let batchResults: Record<string, any> = {};
    if (uncachedClubIds.length > 0) {
      const { data: walletsData, error: walletsError } = await supabase
        .from('v_point_wallets')
        .select('club_id, balance_pts, earned_pts, purchased_pts, spent_pts, status_pts, last_activity_at')
        .eq('user_id', user.id)
        .in('club_id', uncachedClubIds);

      if (walletsError) {
        console.error('Error fetching wallet data:', walletsError);
        // Don't fail the entire request, just log the error
      }

      // Process each wallet and cache the results
      (walletsData || []).forEach(wallet => {
        const statusPoints = wallet.status_pts || 0;
        const current = computeStatus(statusPoints);
        const next = computeNext(current);
        const currentThreshold = STATUS_THRESHOLDS[current];
        const nextThreshold = next ? STATUS_THRESHOLDS[next] : null;

        const result = {
          club_id: wallet.club_id,
          total_balance: wallet.balance_pts || 0,
          earned_points: wallet.earned_pts || 0,
          purchased_points: wallet.purchased_pts || 0,
          spent_points: wallet.spent_pts || 0,
          status_points: statusPoints,
          current_status: current,
          next_status: next,
          progress_to_next: nextThreshold
            ? Math.min(100, Math.max(0, ((statusPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
            : 100,
          points_to_next: nextThreshold ? Math.max(0, nextThreshold - statusPoints) : 0,
          last_activity: wallet.last_activity_at,
        };

        batchResults[wallet.club_id] = result;
        
        // Cache individual result for 30 seconds
        const cacheKey = cacheKeys.pointsBreakdown(user.id, wallet.club_id);
        queryCache.set(cacheKey, result, 30000);
      });

      // For clubs with no wallet data, add empty state
      uncachedClubIds.forEach(clubId => {
        if (!batchResults[clubId]) {
          const emptyResult = {
            club_id: clubId,
            total_balance: 0,
            earned_points: 0,
            purchased_points: 0,
            spent_points: 0,
            status_points: 0,
            current_status: 'cadet',
            next_status: 'resident',
            progress_to_next: 0,
            points_to_next: STATUS_THRESHOLDS.resident,
            last_activity: null,
          };
          
          batchResults[clubId] = emptyResult;
          
          // Cache empty results for shorter time (10 seconds)
          const cacheKey = cacheKeys.pointsBreakdown(user.id, clubId);
          queryCache.set(cacheKey, emptyResult, 10000);
        }
      });
    }

    // Combine cached and batch results
    const allResults = { ...cachedResults, ...batchResults };

    // Ensure we return data for all requested clubs
    const finalResults: Record<string, any> = {};
    clubIds.forEach(clubId => {
      finalResults[clubId] = allResults[clubId] || {
        club_id: clubId,
        total_balance: 0,
        earned_points: 0,
        purchased_points: 0,
        spent_points: 0,
        status_points: 0,
        current_status: 'cadet',
        next_status: 'resident',
        progress_to_next: 0,
        points_to_next: STATUS_THRESHOLDS.resident,
        last_activity: null,
      };
    });

    return NextResponse.json({
      success: true,
      points_data: finalResults,
      cache_hits: Object.keys(cachedResults).length,
      fresh_fetches: uncachedClubIds.length,
    });

  } catch (error) {
    console.error('Error in batch points lookup:', error);
    return NextResponse.json({ error: 'Failed to fetch points data' }, { status: 500 });
  }
}
