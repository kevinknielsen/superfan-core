import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import { verifyUnifiedAuth } from "../../../auth";
import { isAdmin } from "@/lib/security.server";

// Helper function to get internal user by auth
async function getInternalUserByAuth(auth: { type: string; userId: string }) {
  const userIdField = auth.type === 'farcaster' ? 'farcaster_id' : 'privy_id';
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq(userIdField, auth.userId)
    .single();

  if (userError || !user) {
    throw new Error('User not found');
  }

  return user;
}

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
const urlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour

function getCachedUrl(key: string): string | null {
  const cached = urlCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.url;
  }
  urlCache.delete(key);
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: clubId } = params;

    console.log(`[Club Media API] Fetching media for club: ${clubId}`);

    // Get club media from database - select only needed fields
    const { data: media, error } = await supabaseTyped
      .from('club_media')
      .select('id, club_id, media_type, file_name, file_path, file_size, mime_type, display_order, is_primary, alt_text, caption, duration_seconds, thumbnail_path, created_at, updated_at')
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
      thumbnail_url: item.thumbnail_path ? getMediaUrl(item.thumbnail_path) : undefined,
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
  const cachedUrl = getCachedUrl(filePath);
  if (cachedUrl) {
    return cachedUrl;
  }
  
  // If it's already a full URL, return as is
  if (filePath.startsWith('http')) {
    urlCache.set(filePath, { url: filePath, timestamp: Date.now() });
    return filePath;
  }
  
  // Get public URL from Supabase storage
  const { data } = supabase.storage
    .from('club-media')
    .getPublicUrl(filePath);
  
  const url = data?.publicUrl || filePath;
  urlCache.set(filePath, { url, timestamp: Date.now() });
  return url;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: clubId } = params;
    
    // Authentication guard - BEFORE parsing formData
    const auth = await verifyUnifiedAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user ID (support both Privy and Farcaster auth)
    const user = await getInternalUserByAuth(auth).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is authorized for this club (owner or admin)
    const { data: clubAuth, error: clubAuthError } = await (supabase as any)
      .from('clubs')
      .select('owner_id')
      .eq('id', clubId)
      .single();

    if (clubAuthError || !clubAuth) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Check if user is club owner or admin
    const userIsAdmin = isAdmin(auth.userId);
    
    if (clubAuth.owner_id !== user.id && !userIsAdmin) {
      return NextResponse.json({ error: "Forbidden: Not authorized for this club" }, { status: 403 });
    }
    
    console.log(`[Club Media POST] Authorization passed`);
    
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
    
    // Validate MIME type and derive normalized media_type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: "Invalid file type. Allowed types: JPEG, PNG, WebP, GIF, MP4, WebM, QuickTime",
        allowed_types: allowedTypes
      }, { status: 400 });
    }
    
    const computedMediaType = file.type.startsWith('video/') ? 'video' : 'image';
    if (!['image', 'video'].includes(mediaType)) {
      return NextResponse.json({ error: "Invalid media_type" }, { status: 400 });
    }
    
    // Prefer server-derived media type
    const effectiveMediaType = computedMediaType;
    
    // File size validation (per-type limits)
    const MAX_IMAGE = 10 * 1024 * 1024;   // 10MB
    const MAX_VIDEO = 200 * 1024 * 1024;  // 200MB
    const limit = (file.type.startsWith('video/') ? MAX_VIDEO : MAX_IMAGE);
    if (file.size > limit) {
      return NextResponse.json({ 
        error: "File too large",
        max_size: limit,
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
        .eq('media_type', effectiveMediaType)
        .eq('is_primary', true);
    }

    // Use RPC function for atomic display order insertion
    const { data: insertResult, error: rpcError } = await (supabase as any)
      .rpc('insert_club_media_with_order', {
        p_club_id: clubId,
        p_media_type: effectiveMediaType,
        p_file_name: originalName,
        p_file_path: fileName,
        p_file_size: fileSize,
        p_mime_type: mimeType,
        p_is_primary: isPrimary,
        p_alt_text: altText || null,
        p_caption: caption || null
      });

    if (rpcError) {
      console.error("[Club Media API] RPC error:", rpcError);
      // Clean up uploaded file
      await supabase.storage.from('club-media').remove([fileName]);
      const code = (rpcError as any)?.code;
      const status = code === '23505' ? 409 : 500;
      const message = code === '23505'
        ? "A primary item for this media type already exists"
        : "Failed to save media record";
      return NextResponse.json({ error: message }, { status });
    }

    // Return media record with URL
    const mediaWithUrl = {
      ...(insertResult as any),
      file_url: getMediaUrl((insertResult as any).file_path),
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
    const { id: clubId } = params;
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

    // Get user ID (support both Privy and Farcaster auth)
    const user = await getInternalUserByAuth(auth).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user is authorized for this club (owner or admin)
    const { data: clubAuth, error: clubAuthError } = await (supabase as any)
      .from('clubs')
      .select('owner_id')
      .eq('id', clubId)
      .single();

    if (clubAuthError || !clubAuth) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Check if user is club owner or admin
    const userIsAdmin = isAdmin(auth.userId);
    
    if (clubAuth.owner_id !== user.id && !userIsAdmin) {
      return NextResponse.json({ error: "Forbidden: Not authorized for this club" }, { status: 403 });
    }

    // Get media record first - select only needed fields
    const { data: media, error: fetchError } = await supabaseTyped
      .from('club_media')
      .select('id, club_id, file_path, thumbnail_path')
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

    // Invalidate URL cache
    pathsToDelete.forEach((p) => urlCache.delete(p));

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[Club Media API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}