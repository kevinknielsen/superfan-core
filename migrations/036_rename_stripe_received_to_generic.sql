-- Migration 036: Rename p_increment_stripe_received_cents to p_increment_received_cents
-- This makes the parameter name generic to support both Stripe and USDC/Metal payments

-- Drop the existing function (required to change parameter names)
DROP FUNCTION IF EXISTS increment_campaigns_ticket_progress(uuid, integer, integer, integer);

-- Create the function with the new generic parameter name
CREATE OR REPLACE FUNCTION increment_campaigns_ticket_progress(
  p_campaign_id UUID,
  p_increment_current_funding_cents INTEGER,
  p_increment_received_cents INTEGER,  -- Renamed from p_increment_stripe_received_cents
  p_increment_total_tickets_sold INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  -- Perform all increments in a single atomic transaction
  UPDATE campaigns 
  SET 
    current_funding_cents = current_funding_cents + p_increment_current_funding_cents,
    stripe_received_cents = stripe_received_cents + p_increment_received_cents,  -- Column name unchanged for backwards compatibility
    updated_at = NOW()
  WHERE id = p_campaign_id;
  
  -- Check if the campaign was found and updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;
  
  -- Note: total_tickets_sold is computed in the v_campaign_progress view
  -- from reward_claims, so no direct column update needed
END;
$$ LANGUAGE plpgsql;

-- Update comment to reflect generic naming
COMMENT ON FUNCTION increment_campaigns_ticket_progress IS 'Migration 036 - Atomic campaign funding updates with generic payment tracking (Stripe, USDC, Metal)';

