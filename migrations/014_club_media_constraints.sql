-- Add unique constraint to prevent multiple primary media of the same type per club
-- This prevents race conditions when setting is_primary = true

-- First, backfill any NULL display_order values to prevent constraint issues
UPDATE club_media 
SET display_order = 0 
WHERE display_order IS NULL;

-- Fix duplicate display_order values by reassigning them sequentially per club
WITH ranked_media AS (
  SELECT 
    id,
    club_id,
    ROW_NUMBER() OVER (PARTITION BY club_id ORDER BY created_at, id) - 1 as new_display_order
  FROM club_media
)
UPDATE club_media 
SET display_order = ranked_media.new_display_order
FROM ranked_media
WHERE club_media.id = ranked_media.id;

-- Make display_order NOT NULL to enforce proper ordering
ALTER TABLE club_media 
ALTER COLUMN display_order SET NOT NULL;

-- Ensure at most one primary per club and media_type
CREATE UNIQUE INDEX IF NOT EXISTS ux_club_media_primary 
ON club_media (club_id, media_type) 
WHERE is_primary = true;

-- Remove old non-unique ordering index
DROP INDEX IF EXISTS idx_club_media_order;

-- Enforce unique ordering per club to prevent race conditions
CREATE UNIQUE INDEX IF NOT EXISTS ux_club_media_order
ON club_media (club_id, display_order);

-- Add constraint to prevent negative display_order (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_display_order_positive' 
        AND conrelid = 'club_media'::regclass
    ) THEN
        ALTER TABLE club_media 
        ADD CONSTRAINT check_display_order_positive 
        CHECK (display_order >= 0);
    END IF;
END $$;

-- Add comments explaining the constraints
COMMENT ON INDEX ux_club_media_primary IS 'Ensures only one primary media item per club and media type';
COMMENT ON INDEX ux_club_media_order IS 'Ensures unique display order per club to prevent race conditions';
