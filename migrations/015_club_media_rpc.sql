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
  retry_count INTEGER := 0;
  max_retries INTEGER := 5;
BEGIN
  -- Set secure search_path to prevent privilege escalation
  SET LOCAL search_path = public, pg_temp;
  
  -- If this is set as primary, unset other primary media of the same type first
  IF p_is_primary THEN
    UPDATE club_media 
    SET is_primary = false 
    WHERE club_id = p_club_id 
      AND media_type = p_media_type 
      AND is_primary = true;
  END IF;
  
  -- Retry loop to handle race conditions on display_order
  LOOP
    BEGIN
      -- Get next display order with advisory lock to prevent race conditions
      PERFORM pg_advisory_xact_lock(hashtext(p_club_id::TEXT));
      
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
      
      -- If we get here, the insert was successful
      EXIT;
      
    EXCEPTION
      WHEN unique_violation THEN
        -- Handle unique constraint violation on display_order
        retry_count := retry_count + 1;
        IF retry_count > max_retries THEN
          RAISE EXCEPTION 'Failed to insert media after % retries due to display_order conflicts', max_retries;
        END IF;
        
        -- Wait a random short time before retry to reduce collision probability
        PERFORM pg_sleep(random() * 0.1);
        
        -- Continue the loop to retry
        CONTINUE;
    END;
  END LOOP;
  
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
COMMENT ON FUNCTION insert_club_media_with_order IS 'Securely inserts club media with sequential display_order, handles primary media conflicts, and prevents race conditions using advisory locks and retry logic';
