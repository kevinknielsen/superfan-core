-- Migration 030: Campaign Atomic Updates
-- Adds PostgreSQL RPC for atomic campaign funding updates
-- Run this in Supabase SQL editor

-- ============================================================================
-- CREATE ATOMIC CAMPAIGN UPDATE FUNCTION
-- ============================================================================

-- Function to atomically increment campaign funding and ticket progress
CREATE OR REPLACE FUNCTION increment_campaigns_ticket_progress(
  p_campaign_id UUID,
  p_increment_current_funding_cents INTEGER,
  p_increment_stripe_received_cents INTEGER,
  p_increment_total_tickets_sold INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  -- Perform all three increments in a single atomic transaction
  UPDATE campaigns 
  SET 
    current_funding_cents = current_funding_cents + p_increment_current_funding_cents,
    stripe_received_cents = stripe_received_cents + p_increment_stripe_received_cents,
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

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON FUNCTION increment_campaigns_ticket_progress IS 'Migration 030 - Atomic campaign funding updates for webhook safety';
