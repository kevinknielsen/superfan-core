-- Migration: Add claimed_at column to webhook_events for processing lease
-- This prevents concurrent processing of the same webhook event

-- Add claimed_at column to webhook_events table
ALTER TABLE webhook_events 
ADD COLUMN claimed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE webhook_events 
ADD COLUMN claimed_by TEXT DEFAULT NULL;
ALTER TABLE webhook_events 
ADD COLUMN claim_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for claimed_at to optimize concurrent processing checks
CREATE INDEX idx_webhook_events_claimed ON webhook_events(claimed_at)
WHERE processed_at IS NULL AND claimed_at IS NOT NULL;

-- Add index for pending events (not processed and not claimed)
CREATE INDEX idx_webhook_events_available ON webhook_events(created_at) 
WHERE processed_at IS NULL AND claimed_at IS NULL INCLUDE (id);

-- Add index for stale claimed recovery
CREATE INDEX idx_webhook_events_stale_claim
  ON webhook_events (claim_expires_at)
  WHERE processed_at IS NULL AND claim_expires_at IS NOT NULL;

-- Update the constraint to include claimed_at logic
ALTER TABLE webhook_events 
DROP CONSTRAINT IF EXISTS chk_webhook_events_processing;

ALTER TABLE webhook_events 
ADD CONSTRAINT chk_webhook_events_processing CHECK (
  processing_attempts >= 0 AND
  (processed_at IS NULL OR processing_attempts > 0) AND
  -- If an event is marked processed, it must have been claimed at some point
  (processed_at IS NULL OR claimed_at IS NOT NULL)
);

-- Add comments explaining the new columns
COMMENT ON COLUMN webhook_events.claimed_at IS 
'Timestamp when a worker claimed this event; used to prevent concurrent processing of the same event.';

COMMENT ON COLUMN webhook_events.claimed_by IS 
'Identifier of the worker that claimed this event for processing.';

COMMENT ON COLUMN webhook_events.claim_expires_at IS 
'Timestamp when the claim expires; allows recovery of stale claims from crashed workers.';
