-- Enhanced club media storage with support for multiple images and videos
-- Replaces simple image_url with proper media management

-- Create media storage table for clubs
CREATE TABLE club_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- Media details
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video')),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, -- Path in Supabase storage
  file_size INTEGER, -- File size in bytes
  mime_type VARCHAR(100),
  
  -- Display properties
  display_order INTEGER DEFAULT 0, -- Order for gallery display
  is_primary BOOLEAN DEFAULT false, -- Main image/video for the club
  alt_text TEXT, -- Accessibility text
  caption TEXT, -- Optional caption
  
  -- Video-specific properties (only for videos)
  duration_seconds INTEGER, -- Video length
  thumbnail_path VARCHAR(500), -- Generated thumbnail for videos
  
  -- Metadata
  uploaded_by UUID, -- User who uploaded (for audit)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_club_media_club_id ON club_media(club_id);
CREATE INDEX idx_club_media_type ON club_media(media_type);
CREATE INDEX idx_club_media_primary ON club_media(club_id, is_primary) WHERE is_primary = true;
CREATE INDEX idx_club_media_order ON club_media(club_id, display_order);

-- Ensure only one primary media per club per type
CREATE UNIQUE INDEX idx_club_media_primary_unique 
ON club_media(club_id, media_type) 
WHERE is_primary = true;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_club_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER club_media_updated_at
  BEFORE UPDATE ON club_media
  FOR EACH ROW
  EXECUTE FUNCTION update_club_media_updated_at();

-- Migrate existing image_url data to new system
INSERT INTO club_media (club_id, media_type, file_name, file_path, is_primary, display_order)
SELECT 
  id as club_id,
  'image' as media_type,
  'legacy_image.jpg' as file_name,
  image_url as file_path,
  true as is_primary,
  0 as display_order
FROM clubs 
WHERE image_url IS NOT NULL AND image_url != '';

-- Note: Keep image_url column for backward compatibility during transition
-- DROP COLUMN image_url; -- Uncomment after confirming migration works

-- Create storage bucket (run this in Supabase dashboard if not exists)
-- CREATE BUCKET IF NOT EXISTS 'club-media';

-- Set up storage policies (run in Supabase dashboard)
-- CREATE POLICY "Club media is publicly readable" ON storage.objects
--   FOR SELECT USING (bucket_id = 'club-media');
-- 
-- CREATE POLICY "Authenticated users can upload club media" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'club-media' AND auth.role() = 'authenticated');
