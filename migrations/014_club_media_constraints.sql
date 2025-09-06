-- Add unique constraint to prevent multiple primary media of the same type per club
-- This prevents race conditions when setting is_primary = true

-- Ensure at most one primary per club and media_type
CREATE UNIQUE INDEX IF NOT EXISTS ux_club_media_primary 
ON club_media (club_id, media_type) 
WHERE is_primary = true;

-- Add constraint to prevent negative display_order
ALTER TABLE club_media 
ADD CONSTRAINT check_display_order_positive 
CHECK (display_order >= 0);

-- Add comment explaining the constraint
COMMENT ON INDEX ux_club_media_primary IS 'Ensures only one primary media item per club and media type';
