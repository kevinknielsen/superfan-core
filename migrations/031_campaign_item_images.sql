-- Migration 031: Campaign Item Images Support
-- Adds image_url support to tier_rewards metadata for campaign items

-- ============================================================================
-- STORAGE BUCKET SETUP (Run in Supabase Dashboard → Storage)
-- ============================================================================
-- 
-- Bucket Name: campaign-items
-- Public: YES
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp
-- 
-- Folder structure:
--   campaign-items/
--     └── {campaign_id}/
--         ├── {item-name}.jpg
--         └── ...

-- ============================================================================
-- EXAMPLE: Add image to existing item
-- ============================================================================

-- Example: Update Digital Album with image URL
-- UPDATE tier_rewards 
-- SET metadata = jsonb_set(
--   COALESCE(metadata, '{}'::jsonb),
--   '{image_url}',
--   '"https://kkxhjlzqvvcwvlidqtam.supabase.co/storage/v1/object/public/campaign-items/41e19a80-b04f-4077-b68c-258bd0b7894c/digital-album.jpg"'
-- )
-- WHERE title = 'Digital Album';

-- ============================================================================
-- HELPER FUNCTION: Batch update campaign item images
-- ============================================================================

CREATE OR REPLACE FUNCTION update_campaign_item_image(
  p_item_id UUID,
  p_image_url TEXT,
  p_image_alt TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE tier_rewards 
  SET metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{image_url}',
      to_jsonb(p_image_url)
    ),
    '{image_alt}',
    to_jsonb(COALESCE(p_image_alt, title))
  )
  WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Add image to specific item:
-- SELECT update_campaign_item_image(
--   'item-uuid-here',
--   'https://kkxhjlzqvvcwvlidqtam.supabase.co/storage/v1/object/public/campaign-items/campaign-id/image.jpg',
--   'Digital Album Cover Art'
-- );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON FUNCTION update_campaign_item_image IS 'Helper function to update campaign item images in metadata - Migration 031';
