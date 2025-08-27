import { NextRequest } from 'next/server';
import { verifyUnifiedAuth } from '@/app/api/auth';
import { createServiceClient } from '@/app/api/supabase';

// Get media for a club
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params;
    const supabase = createServiceClient();
    
    const { data: media, error } = await supabase
      .from('club_media')
      .select('*')
      .eq('club_id', clubId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching club media:', error);
      return Response.json({ error: 'Failed to fetch media' }, { status: 500 });
    }

    return Response.json(media || []);
  } catch (error) {
    console.error('Error in GET /api/clubs/[clubId]/media:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Upload new media to a club
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await params;
  console.log('[POST /api/clubs/[clubId]/media] === ROUTE HIT ===');
  console.log('[POST /api/clubs/[clubId]/media] clubId:', clubId);
  console.log('[POST /api/clubs/[clubId]/media] request method:', request.method);
  
  try {
    console.log('[POST /api/clubs/[clubId]/media] Starting upload for clubId:', clubId);
    
    // Verify authentication
    const authResult = await verifyUnifiedAuth(request);
    console.log('[POST /api/clubs/[clubId]/media] Auth result:', authResult);
    if (!authResult) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Extract privy ID from auth result
    const privyId = typeof authResult === 'string' ? authResult : authResult.userId;
    console.log('[POST /api/clubs/[clubId]/media] Privy ID extracted:', privyId);

    const supabase = createServiceClient();
    console.log('[POST /api/clubs/[clubId]/media] Created Supabase client');
    
    // Get user's UUID from their Privy ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', privyId)
      .single();
    
    if (userError || !user) {
      console.log('[POST /api/clubs/[clubId]/media] User not found in database:', userError);
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userUuid = user.id;
    console.log('[POST /api/clubs/[clubId]/media] User UUID:', userUuid);
    
    // Check if user has permission to upload to this club
    // For now, any authenticated user can upload, but you might want to restrict this
    const { data: club } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', clubId)
      .single();

    if (!club) {
      return Response.json({ error: 'Club not found' }, { status: 404 });
    }

    const formData = await request.formData();
    console.log('[POST /api/clubs/[clubId]/media] Parsed form data');
    
    const file = formData.get('file') as File;
    const mediaType = formData.get('mediaType') as string; // 'image' or 'video'
    const isPrimary = formData.get('isPrimary') === 'true';
    const altText = formData.get('altText') as string;
    const caption = formData.get('caption') as string;

    console.log('[POST /api/clubs/[clubId]/media] File details:', {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      mediaType,
      isPrimary
    });

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    
    if (mediaType === 'image' && !validImageTypes.includes(file.type)) {
      return Response.json({ error: 'Invalid image format' }, { status: 400 });
    }
    
    if (mediaType === 'video' && !validVideoTypes.includes(file.type)) {
      return Response.json({ error: 'Invalid video format' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${clubId}/${mediaType}s/${timestamp}_${sanitizedName}`;

    console.log('[POST /api/clubs/[clubId]/media] Uploading to storage with fileName:', fileName);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('club-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    console.log('[POST /api/clubs/[clubId]/media] Storage upload result:', {
      success: !uploadError,
      uploadData,
      uploadError
    });

    if (uploadError) {
      console.error('[POST /api/clubs/[clubId]/media] Storage upload error:', uploadError);
      return Response.json({ 
        error: 'Failed to upload file', 
        details: uploadError.message 
      }, { status: 500 });
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('club-media')
      .getPublicUrl(fileName);

    // If this is set as primary, unset other primary media of the same type
    if (isPrimary) {
      await supabase
        .from('club_media')
        .update({ is_primary: false })
        .eq('club_id', clubId)
        .eq('media_type', mediaType);
    }

    // Get the next display order
    const { data: lastMedia } = await supabase
      .from('club_media')
      .select('display_order')
      .eq('club_id', clubId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (lastMedia?.display_order || 0) + 1;

    // Save media record to database
    const { data: mediaRecord, error: dbError } = await supabase
      .from('club_media')
      .insert({
        club_id: clubId,
        media_type: mediaType,
        file_name: file.name,
        file_path: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        is_primary: isPrimary,
        alt_text: altText,
        caption: caption,
        display_order: isPrimary ? 0 : nextOrder,
        uploaded_by: userUuid
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('club-media').remove([fileName]);
      return Response.json({ error: 'Failed to save media record' }, { status: 500 });
    }

    return Response.json(mediaRecord);
  } catch (error) {
    console.error('[POST /api/clubs/[clubId]/media] === CATCH BLOCK ===');
    console.error('[POST /api/clubs/[clubId]/media] Error type:', typeof error);
    console.error('[POST /api/clubs/[clubId]/media] Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('[POST /api/clubs/[clubId]/media] Full error:', error);
    console.error('[POST /api/clubs/[clubId]/media] Stack:', error instanceof Error ? error.stack : 'No stack');
    
    return Response.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      type: typeof error
    }, { status: 500 });
  }
}
