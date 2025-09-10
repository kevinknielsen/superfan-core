-- Migration: Add claimed_at column to webhook_events for processing lease
-- This prevents concurrent processing of the same webhook event

-- Add claimed_at column to webhook_events table
ALTER TABLE webhook_events 
ADD COLUMN claimed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for claimed_at to optimize concurrent processing checks
CREATE INDEX idx_webhook_events_claimed ON webhook_events(claimed_at) 
WHERE claimed_at IS NOT NULL;

-- Add index for pending events (not processed and not claimed)
CREATE INDEX idx_webhook_events_available ON webhook_events(created_at) 
WHERE processed_at IS NULL AND claimed_at IS NULL;

-- Update the constraint to include claimed_at logic
ALTER TABLE webhook_events 
DROP CONSTRAINT chk_webhook_events_processing;

ALTER TABLE webhook_events 
ADD CONSTRAINT chk_webhook_events_processing CHECK (
  (processed_at IS NULL AND processing_attempts >= 0) OR
  (processed_at IS NOT NULL AND processing_attempts > 0)
);

-- Optional: Add a comment explaining the claimed_at column
COMMENT ON COLUMN webhook_events.claimed_at IS 
'Timestamp when webhook event was claimed for processing to prevent concurrent execution';
