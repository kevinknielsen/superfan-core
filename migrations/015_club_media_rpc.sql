-- Create RPC function for atomic display order increment
-- This prevents race conditions when inserting media with sequential display_order

CREATE OR REPLACE FUNCTION insert_club_media_with_order(
  p_club_id UUID,
  p_media_type TEXT,
  p_file_name TEXT,
  p_file_path TEXT,
  p_file_size BIGINT,
  p_mime_type TEXT,
  p_is_primary BOOLEAN,
  p_alt_text TEXT DEFAULT NULL,
  p_caption TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  club_id UUID,
  media_type TEXT,
  file_name TEXT,
  file_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  display_order INTEGER,
  is_primary BOOLEAN,
  alt_text TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_order INTEGER;
  new_record RECORD;
BEGIN
  -- Get next display order atomically
  SELECT COALESCE(MAX(cm.display_order), 0) + 1 
  INTO next_order
  FROM club_media cm 
  WHERE cm.club_id = p_club_id;
  
  -- Insert with computed display order
  INSERT INTO club_media (
    club_id,
    media_type,
    file_name,
    file_path,
    file_size,
    mime_type,
    display_order,
    is_primary,
    alt_text,
    caption
  ) VALUES (
    p_club_id,
    p_media_type,
    p_file_name,
    p_file_path,
    p_file_size,
    p_mime_type,
    next_order,
    p_is_primary,
    p_alt_text,
    p_caption
  )
  RETURNING * INTO new_record;
  
  -- Return the inserted record
  RETURN QUERY SELECT 
    new_record.id,
    new_record.club_id,
    new_record.media_type,
    new_record.file_name,
    new_record.file_path,
    new_record.file_size,
    new_record.mime_type,
    new_record.display_order,
    new_record.is_primary,
    new_record.alt_text,
    new_record.caption,
    new_record.created_at,
    new_record.updated_at;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION insert_club_media_with_order IS 'Atomically inserts club media with sequential display_order to prevent race conditions';
