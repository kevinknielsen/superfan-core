-- Create club_media table for storing club images and videos
CREATE TABLE IF NOT EXISTS club_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video')),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, -- Path in Supabase storage
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  alt_text TEXT, -- For accessibility
  caption TEXT, -- Optional caption
  duration_seconds INTEGER, -- For videos
  thumbnail_path VARCHAR(500), -- Thumbnail for videos
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_club_media_club_id ON club_media(club_id);
CREATE INDEX IF NOT EXISTS idx_club_media_type ON club_media(media_type);
CREATE INDEX IF NOT EXISTS idx_club_media_primary ON club_media(club_id, media_type, is_primary);
CREATE INDEX IF NOT EXISTS idx_club_media_order ON club_media(club_id, display_order);

-- Add unique constraint to ensure only one primary media per type per club
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_media_unique_primary 
  ON club_media(club_id, media_type) 
  WHERE is_primary = true;

-- Add RLS policies
ALTER TABLE club_media ENABLE ROW LEVEL SECURITY;

-- Public can view club media (for public club pages)
CREATE POLICY "Anyone can view club media" ON club_media
  FOR SELECT USING (true);

-- Only admins can insert/update/delete club media
CREATE POLICY "Admins can manage club media" ON club_media
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.privy_id = auth.jwt() ->> 'sub' 
      AND users.role = 'admin'
    )
  );

-- Add helpful comment
COMMENT ON TABLE club_media IS 'Stores images and videos for clubs, uploaded via admin dashboard and displayed in club pages';
