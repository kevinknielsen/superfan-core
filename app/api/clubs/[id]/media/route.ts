import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import { verifyUnifiedAuth } from "../../../auth";

// Define the expected shape for club media
interface ClubMedia {
  id: string;
  club_id: string;
  media_type: string;
  file_path: string;
  thumbnail_path?: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  is_primary: boolean;
  alt_text?: string;
  caption?: string;
  created_at?: string;
  updated_at?: string;
}

// Type-safe Supabase client for club_media operations
const supabaseTyped = supabase as unknown as {
  from: (table: 'club_media') => {
    select: (columns: string) => any;
    insert: (data: any) => any;
    update: (data: any) => any;
    delete: () => any;
  };
  storage: typeof supabase.storage;
};

// URL cache to reduce repeated Supabase API calls
const urlCache = new Map<string, string>();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clubId = params.id;

    console.log(`[Club Media API] Fetching media for club: ${clubId}`);

    // Get club media from database
    const { data: media, error } = await supabaseTyped
      .from('club_media')
      .select('*')
      .eq('club_id', clubId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error("[Club Media API] Database error:", error);
      return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
    }

    // Convert file paths to full URLs
    const mediaWithUrls = media?.map((item: any) => ({
      ...item,
      file_url: getMediaUrl(item.file_path),
      thumbnail_url: item.thumbnail_path ? getMediaUrl(item.thumbnail_path) : null,
    })) || [];

    console.log(`[Club Media API] Found ${mediaWithUrls.length} media items for club ${clubId}`);

    return NextResponse.json(mediaWithUrls);

  } catch (error) {
    console.error("[Club Media API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Helper function to get full media URL from Supabase storage
function getMediaUrl(filePath: string): string {
  if (!filePath) return '';
  
  // Check cache first
  if (urlCache.has(filePath)) {
    return urlCache.get(filePath)!;
  }
  
  // If it's already a full URL, return as is
  if (filePath.startsWith('http')) {
    urlCache.set(filePath, filePath);
    return filePath;
  }
  
  // Get public URL from Supabase storage
  const { data } = supabase.storage
    .from('club-media')
    .getPublicUrl(filePath);
  
  const url = data?.publicUrl || filePath;
  urlCache.set(filePath, url);
  return url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clubId = params.id;
    
    // Authentication guard - BEFORE parsing formData
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check when role column is added to users table
    // For now, just verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // Only parse formData after authentication succeeds
    const formData = await request.formData();
    
    const file = formData.get('file') as File;
    const mediaType = formData.get('media_type') as string;
    const altText = formData.get('alt_text') as string;
    const caption = formData.get('caption') as string;
    const isPrimary = formData.get('is_primary') === 'true';
    
    // Input validation
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    if (!mediaType) {
      return NextResponse.json({ error: "Media type is required" }, { status: 400 });
    }
    
    // Validate media type against whitelist
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: "Invalid file type. Allowed types: JPEG, PNG, WebP, GIF, MP4, WebM, QuickTime",
        allowed_types: allowedTypes
      }, { status: 400 });
    }
    
    // File size validation (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: "File too large. Maximum size is 10MB",
        max_size: maxSize,
        file_size: file.size
      }, { status: 413 });
    }

    console.log(`[Club Media API] Uploading ${mediaType} for club: ${clubId}`);

    // Generate unique filename
    const timestamp = Date.now();
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_'); // Sanitize filename
    const fileName = `${clubId}/${timestamp}_${originalName}`;

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('club-media')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (uploadError) {
      console.error("[Club Media API] Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
    }

    // Get file size
    const fileSize = file.size;
    const mimeType = file.type;

    // If this is set as primary, unset other primary media of the same type
    if (isPrimary) {
      await supabaseTyped
        .from('club_media')
        .update({ is_primary: false })
        .eq('club_id', clubId)
        .eq('media_type', mediaType);
    }

    // Get next display order (TODO: Use RPC function when TypeScript types are updated)
    const { data: lastMedia } = await supabaseTyped
      .from('club_media')
      .select('display_order')
      .eq('club_id', clubId)
      .order('display_order', { ascending: false })
      .limit(1);

    const displayOrder = (lastMedia?.[0]?.display_order || 0) + 1;

    // Save media record to database
    const { data: mediaRecord, error: dbError } = await supabaseTyped
      .from('club_media')
      .insert({
        club_id: clubId,
        media_type: mediaType,
        file_name: originalName,
        file_path: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        display_order: displayOrder,
        is_primary: isPrimary,
        alt_text: altText || null,
        caption: caption || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[Club Media API] Database error:", dbError);
      // Clean up uploaded file
      await supabase.storage.from('club-media').remove([fileName]);
      return NextResponse.json({ error: "Failed to save media record" }, { status: 500 });
    }

    // Return media record with URL
    const mediaWithUrl = {
      ...mediaRecord,
      file_url: getMediaUrl(mediaRecord.file_path),
    };

    console.log(`[Club Media API] Successfully uploaded media:`, mediaWithUrl.id);

    return NextResponse.json(mediaWithUrl);

  } catch (error) {
    console.error("[Club Media API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clubId = params.id;
    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get('media_id');

    if (!mediaId) {
      return NextResponse.json({ error: "Media ID required" }, { status: 400 });
    }

    // Authentication guard
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add admin role check when role column is added to users table
    // For now, just verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', auth.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`[Club Media API] Deleting media ${mediaId} for club: ${clubId}`);

    // Get media record first
    const { data: media, error: fetchError } = await supabaseTyped
      .from('club_media')
      .select('*')
      .eq('id', mediaId)
      .eq('club_id', clubId)
      .single();

    if (fetchError || !media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    // Delete from storage (including thumbnails)
    const pathsToDelete = [media.file_path];
    if (media.thumbnail_path) {
      pathsToDelete.push(media.thumbnail_path);
    }
    
    const { error: storageError } = await supabase.storage
      .from('club-media')
      .remove(pathsToDelete);

    if (storageError) {
      console.warn("[Club Media API] Storage deletion warning:", storageError);
      // Continue with database deletion even if storage fails
    }

    // Delete from database
    const { error: dbError } = await supabaseTyped
      .from('club_media')
      .delete()
      .eq('id', mediaId)
      .eq('club_id', clubId);

    if (dbError) {
      console.error("[Club Media API] Database deletion error:", dbError);
      return NextResponse.json({ error: "Failed to delete media record" }, { status: 500 });
    }

    console.log(`[Club Media API] Successfully deleted media: ${mediaId}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Club Media API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}