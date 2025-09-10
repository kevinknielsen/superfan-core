import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";
import { supabase } from "../../../supabase";
import { type } from "arktype";

// Type assertion for new tier rewards tables
const supabaseAny = supabase as any;

// Schema for pricing preview request
const pricingPreviewSchema = type({
  club_id: "string",
  tier: "'cadet'|'resident'|'headliner'|'superfan'",
  artist_cost_estimate_cents: "number",
  total_inventory: "number",
  max_free_allocation: "number",
  safety_factor: "number?",
  rolling_window_days: "number?"
});

// Preview pricing impact for a potential tier reward (admin only)
export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check - bypass only allowed in non-production
  if (process.env.NODE_ENV === 'production' && process.env.SKIP_ADMIN_CHECKS === 'true') {
    console.error('[Admin Tier Rewards Preview API] SKIP_ADMIN_CHECKS must not be enabled in production');
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const skipAdmin = process.env.NODE_ENV !== 'production' && process.env.SKIP_ADMIN_CHECKS === 'true';
  if (!skipAdmin && !isAdmin(auth.userId)) {
    return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    
    // Validate request body using try/catch for safe parsing
    let previewData;
    try {
      previewData = pricingPreviewSchema(body);
      
      // Check if validation failed
      if (previewData instanceof type.errors) {
        console.error("[Admin Tier Rewards Preview API] Invalid request body:", previewData.summary);
        return NextResponse.json(
          { error: "Invalid request body", details: previewData.summary },
          { status: 400 }
        );
      }
    } catch (validationError) {
      console.error("[Admin Tier Rewards Preview API] Validation error:", validationError);
      return NextResponse.json(
        { 
          error: "Invalid request body", 
          details: validationError instanceof Error ? validationError.message : "Validation failed" 
        },
        { status: 400 }
      );
    }

    // Use the preview function to calculate pricing impact
    const { data: pricingPreview, error: previewError } = await supabaseAny
      .rpc('preview_reward_pricing', {
        p_club_id: previewData.club_id,
        p_tier: previewData.tier,
        p_artist_cost_estimate_cents: previewData.artist_cost_estimate_cents,
        p_total_inventory: previewData.total_inventory,
        p_max_free_allocation: previewData.max_free_allocation,
        p_safety_factor: previewData.safety_factor ?? 1.25,
        p_rolling_window_days: previewData.rolling_window_days ?? 60
      });

    if (previewError) {
      console.error('Error calculating pricing preview:', previewError);
      return NextResponse.json({ 
        error: "Failed to calculate pricing preview",
        details: previewError.message 
      }, { status: 500 });
    }

    const result = pricingPreview?.[0];
    if (!result) {
      return NextResponse.json({ 
        error: "No pricing data returned" 
      }, { status: 500 });
    }

    // Format the response with helpful insights
    const response = {
      existing_tier_holders: result.existing_tier_holders,
      allocation_plan: {
        total_inventory: previewData.total_inventory,
        max_free_requested: previewData.max_free_allocation,
        calculated_free_allocation: result.calculated_free_allocation,
        expected_paid_purchases: result.expected_paid_purchases,
        free_allocation_percentage: result.calculated_free_allocation > 0 && previewData.total_inventory > 0
          ? Math.round((result.calculated_free_allocation / previewData.total_inventory) * 100)
          : 0
      },
      financial_analysis: {
        cost_per_unit_cents: previewData.artist_cost_estimate_cents,
        total_cogs_cents: result.total_cogs_cents,
        revenue_per_paid_unit_cents: result.revenue_per_paid_unit_cents,
        upgrade_price_cents: result.upgrade_price_cents,
        total_potential_revenue_cents: result.total_potential_revenue_cents,
        profit_margin_cents: result.profit_margin_cents,
        profit_margin_percentage: result.total_potential_revenue_cents > 0 
          ? Math.round((result.profit_margin_cents / result.total_potential_revenue_cents) * 100)
          : 0,
        is_profitable: result.is_profitable
      },
      insights: []
    };

    // Add helpful insights
    if (result.calculated_free_allocation < previewData.max_free_allocation) {
      response.insights.push({
        type: 'info',
        message: `Only ${result.calculated_free_allocation} existing tier holders, so ${previewData.max_free_allocation - result.calculated_free_allocation} fewer free units than requested`
      });
    }

    if (result.calculated_free_allocation === 0) {
      response.insights.push({
        type: 'warning',
        message: 'No existing tier holders - all units will need to be purchased'
      });
    }

    if (!result.is_profitable) {
      response.insights.push({
        type: 'error',
        message: 'Configuration is not profitable - consider reducing free allocation or increasing safety factor'
      });
    }

    if (result.profit_margin_cents > result.total_cogs_cents) {
      response.insights.push({
        type: 'success',
        message: `High profit margin (${response.financial_analysis.profit_margin_percentage}%) - consider reducing price or increasing free allocation`
      });
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error("[Admin Tier Rewards Preview API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
