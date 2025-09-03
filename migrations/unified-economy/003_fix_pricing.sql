-- Migration: Fix Point Pricing for Testing
-- Make points affordable for testing ($1 for 1000 points)

BEGIN;

-- Update pricing to be reasonable for testing
-- 0.1 cents per point = $1 for 1000 points
UPDATE clubs SET 
  point_sell_cents = 10, -- 0.1 cents per point = $1 per 1000 points
  point_settle_cents = 5  -- 0.05 cents per point = $0.50 per 1000 points
WHERE name IN ('PHAT Club', 'Vault Records');

-- For any other clubs, set reasonable default pricing (fix logic bug)
UPDATE clubs SET
  point_sell_cents   = CASE WHEN point_sell_cents   IS NULL OR point_sell_cents   > 50 THEN 10 ELSE point_sell_cents   END,
  point_settle_cents = CASE WHEN point_settle_cents IS NULL OR point_settle_cents > 25 THEN 5  ELSE point_settle_cents END
WHERE (point_sell_cents IS NULL OR point_sell_cents > 50)
   OR (point_settle_cents IS NULL OR point_settle_cents > 25);

-- Add guardrails for reasonable pricing (prevent clubs from setting crazy prices)
UPDATE clubs SET
  guardrail_min_sell = 5,   -- Minimum 0.05 cents per point
  guardrail_max_sell = 50,  -- Maximum 0.5 cents per point
  guardrail_min_settle = 2, -- Minimum 0.02 cents per point  
  guardrail_max_settle = 25 -- Maximum 0.25 cents per point
WHERE guardrail_min_sell IS NULL;

COMMIT;
