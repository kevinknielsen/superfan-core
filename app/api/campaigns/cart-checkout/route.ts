import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { supabase } from "../../supabase";
import { stripe } from "@/lib/stripe";
import { createHash } from "crypto";

// Type assertion for enhanced schema features not in generated types
const supabaseAny = supabase as any;

// Resilient base URL resolution
function resolveBaseUrl(): string {
  const explicit = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit;

  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
    return 'https://superfan.one';
  }

  return 'http://localhost:3000';
}

// Calculate discount based on user tier
function getDiscountPercentage(userTier: string, tierReward: any): number {
  const getTierRank = (tier: string): number => {
    const ranks = { cadet: 0, resident: 1, headliner: 2, superfan: 3 };
    return ranks[tier as keyof typeof ranks] || 0;
  };

  const userRank = getTierRank(userTier);
  const rewardRank = getTierRank(tierReward.tier);
  
  if (userRank < rewardRank) {
    return 0;
  }

  switch (userTier) {
    case 'superfan': return 40;
    case 'headliner': return 30;
    case 'resident': return 20;
    case 'cadet': return 10;
    default: return 0;
  }
}

/**
 * POST /api/campaigns/cart-checkout
 * Create a unified Stripe checkout session for cart items (credits + tier rewards)
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json() as {
      club_id: string;
      total_credits: number;
      items: Array<{
        tier_reward_id: string;
        quantity: number;
        final_price_cents?: number;
        original_price_cents?: number;
        discount_cents?: number;
        campaign_id?: string;
      }>;
      success_url: string;
      cancel_url: string;
    };
    
    const { club_id, total_credits, items, success_url, cancel_url } = body;

    // Validate inputs
    if (!club_id || typeof club_id !== 'string') {
      return NextResponse.json({ error: 'club_id is required' }, { status: 400 });
    }

    if (total_credits < 0 || !Number.isInteger(total_credits)) {
      return NextResponse.json({ error: 'total_credits must be a non-negative integer' }, { status: 400 });
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    // Validate each item in the array
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (!item || typeof item !== 'object') {
        return NextResponse.json({ 
          error: `Invalid item at index ${i}: must be an object` 
        }, { status: 400 });
      }
      
      if (!item.tier_reward_id || typeof item.tier_reward_id !== 'string') {
        return NextResponse.json({ 
          error: `Invalid item at index ${i}: tier_reward_id is required and must be a string` 
        }, { status: 400 });
      }
      
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json({ 
          error: `Invalid item at index ${i} (tier_reward_id: ${item.tier_reward_id}): quantity must be a positive integer` 
        }, { status: 400 });
      }
    }

    if (total_credits === 0 && items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Get the user from database
    const userColumn = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
    const { data: user, error: userError } = await supabaseAny
      .from('users')
      .select('id')
      .eq(userColumn, auth.userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify club exists
    const { data: club, error: clubError } = await supabaseAny
      .from('clubs')
      .select('id, name')
      .eq('id', club_id)
      .single();

    if (clubError || !club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    // Get user's actual earned tier from database (for server-side discount calculation)
    const { data: userTierData, error: tierError } = await supabaseAny
      .rpc('check_tier_qualification', {
        p_user_id: user.id,
        p_club_id: club_id,
        p_target_tier: 'superfan',
        p_rolling_window_days: 60
      });
      
    if (tierError) {
      console.error('Error checking user tier:', tierError);
      return NextResponse.json({ error: 'Failed to validate user tier' }, { status: 500 });
    }
    
    const userTier = userTierData?.[0]?.effective_tier || userTierData?.[0]?.earned_tier || 'cadet';
    
    // Validate and normalize redirect URLs
    const serverOrigin = resolveBaseUrl();
    const validateAndNormalizeUrl = (urlInput: string, fieldName: string): string => {
      // Accept only relative paths or same-origin URLs
      if (urlInput.startsWith('/')) {
        // Relative path - build full URL
        return new URL(urlInput, serverOrigin).toString();
      }
      
      // Full URL - verify it matches server origin
      try {
        const url = new URL(urlInput);
        const serverUrl = new URL(serverOrigin);
        if (url.origin !== serverUrl.origin) {
          throw new Error(`${fieldName} must be same origin as server (got ${url.origin}, expected ${serverUrl.origin})`);
        }
        return url.toString();
      } catch (error) {
        throw new Error(`Invalid ${fieldName}: ${error instanceof Error ? error.message : 'malformed URL'}`);
      }
    };
    
    let validatedSuccessUrl: string;
    let validatedCancelUrl: string;
    try {
      validatedSuccessUrl = validateAndNormalizeUrl(success_url, 'success_url');
      validatedCancelUrl = validateAndNormalizeUrl(cancel_url, 'cancel_url');
    } catch (error) {
      return NextResponse.json({ 
        error: error instanceof Error ? error.message : 'Invalid redirect URLs' 
      }, { status: 400 });
    }

    // Build Stripe line items
    const lineItems = [];

    // Add credits as one line item
    if (total_credits > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${total_credits} Credits`,
            description: `Credits for ${club.name}`
          },
          unit_amount: total_credits * 100 // 1 credit = $1
        },
        quantity: 1
      });
    }

    // Batch fetch all tier rewards for better performance (with pricing fields)
    const rewardIds = items.map(item => item.tier_reward_id);
    const { data: rewards, error: rewardsError } = await supabaseAny
      .from('tier_rewards')
      .select('id, title, description, tier, upgrade_price_cents, ticket_cost, is_ticket_campaign, campaign_id')
      .in('id', rewardIds);

    if (rewardsError) {
      console.error('Error fetching tier rewards:', rewardsError);
      return NextResponse.json({ 
        error: 'Failed to fetch cart items',
        details: rewardsError.message 
      }, { status: 500 });
    }

    const rewardMap = new Map(rewards?.map((r: any) => [r.id, r]) || []);

    // Add each tier reward item with SERVER-SIDE price computation
    for (const item of items) {
      const reward = rewardMap.get(item.tier_reward_id) as any;
      if (!reward) {
        return NextResponse.json({ 
          error: `Cart item not found: tier_reward_id ${item.tier_reward_id}` 
        }, { status: 400 });
      }

      // Compute price SERVER-SIDE (don't trust client)
      const isCreditCampaign = reward.is_ticket_campaign && reward.campaign_id;
      let unitPriceCents: number;
      
      if (isCreditCampaign) {
        // Credit campaign: use ticket_cost as credit_cost
        if (!reward.ticket_cost || !Number.isInteger(reward.ticket_cost) || reward.ticket_cost <= 0) {
          return NextResponse.json({ 
            error: `Invalid credit campaign item ${item.tier_reward_id}: credit_cost must be a positive integer` 
          }, { status: 400 });
        }
        unitPriceCents = reward.ticket_cost * 100; // 1 credit = $1
      } else {
        // Regular tier reward: apply discount based on user tier
        const upgradePriceCents = Number(reward.upgrade_price_cents);
        if (!upgradePriceCents || upgradePriceCents <= 0 || !isFinite(upgradePriceCents)) {
          return NextResponse.json({ 
            error: `Invalid tier pricing for ${item.tier_reward_id}: upgrade_price_cents not set` 
          }, { status: 400 });
        }
        
        const discountPercentage = getDiscountPercentage(userTier, reward);
        const discountCents = Math.round(upgradePriceCents * discountPercentage / 100);
        unitPriceCents = Math.max(0, upgradePriceCents - discountCents);
      }
      
      // Validate computed price
      if (!Number.isInteger(unitPriceCents) || unitPriceCents < 50) {
        return NextResponse.json({ 
          error: `Computed price for ${item.tier_reward_id} is below Stripe minimum ($0.50)` 
        }, { status: 400 });
      }

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: reward.title,
            description: reward.description || `Item from ${club.name}`
          },
          unit_amount: unitPriceCents // Use SERVER-COMPUTED price
        },
        quantity: item.quantity
      });
    }

    // Generate deterministic idempotency key from stable request data
    // Sort items by tier_reward_id (with secondary sort by campaign_id) to ensure canonical ordering
    const sortedItems = [...items].sort((a, b) => {
      const primaryCompare = a.tier_reward_id.localeCompare(b.tier_reward_id, 'en-US', { numeric: true });
      if (primaryCompare !== 0) return primaryCompare;
      // Tie-breaker: campaign_id
      const aCampaign = a.campaign_id || '';
      const bCampaign = b.campaign_id || '';
      return aCampaign.localeCompare(bCampaign, 'en-US', { numeric: true });
    });
    
    const canonicalData = JSON.stringify({
      user_id: user.id,
      club_id: club_id,
      total_credits: total_credits,
      success_url: success_url,
      cancel_url: cancel_url,
      items: sortedItems.map(i => ({
        tier_reward_id: i.tier_reward_id,
        quantity: i.quantity,
        final_price_cents: i.final_price_cents,
        original_price_cents: i.original_price_cents,
        campaign_id: i.campaign_id
      }))
    });
    const hash = createHash('sha256').update(canonicalData).digest('hex');
    const idempotencyKey = `cart_checkout_${hash}`;
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: validatedSuccessUrl,
      cancel_url: validatedCancelUrl,
      metadata: {
        type: 'cart_checkout',
        club_id: club_id,
        user_id: user.id,
        total_credits: total_credits.toString(),
        item_count: items.length.toString(),
        items: JSON.stringify(sortedItems.map(i => ({
          id: i.tier_reward_id,
          qty: i.quantity,
          campaign_id: i.campaign_id
        }))),
        idempotency_key: idempotencyKey
      }
    }, {
      idempotencyKey
    });
    
    return NextResponse.json({
      stripe_session_url: session.url,
      total_amount: getTotalCartAmount(total_credits, items),
      item_count: lineItems.length
    });

  } catch (error) {
    console.error('Error creating cart checkout:', error);
    return NextResponse.json({ 
      error: 'Failed to create cart checkout',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function getTotalCartAmount(credits: number, items: Array<{ final_price_cents?: number; original_price_cents?: number; quantity: number }>) {
  const creditsCents = credits * 100;
  const itemsCents = items.reduce((sum, item) => 
    sum + ((item.final_price_cents || item.original_price_cents || 0) * item.quantity), 0
  );
  return creditsCents + itemsCents;
}

