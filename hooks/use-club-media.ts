import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from "@privy-io/react-auth";

export interface ClubMedia {
  id: string;
  club_id: string;
  media_type: 'image' | 'video';
  file_name: string;
  file_path: string;
  file_url?: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  is_primary: boolean;
  alt_text?: string;
  caption?: string;
  duration_seconds?: number;
  thumbnail_path?: string;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

// Get media for a club
export function useClubMedia(clubId: string | null) {
  return useQuery({
    queryKey: ['club-media', clubId],
    queryFn: async (): Promise<ClubMedia[]> => {
      if (!clubId) return [];

      console.log('[useClubMedia] Fetching media for club:', clubId);

      // For public club media, we don't require auth
      // But if user is authenticated, include auth header for better permissions
      let headers: Record<string, string> = {};
      
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
          console.log('[useClubMedia] Using auth token for request');
        }
      } catch (error) {
        // Ignore auth errors for public media access
        console.log('[useClubMedia] No auth token for club media request');
      }

      const response = await fetch(`/api/clubs/${clubId}/media`, {
        headers,
      });

      console.log('[useClubMedia] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useClubMedia] Error response:', errorText);
        throw new Error(`Failed to fetch media: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[useClubMedia] Fetched media:', result);
      return result;
    },
    enabled: !!clubId,
    retry: 3,
    retryDelay: 1000,
  });
}

// Helper to get primary media of a specific type
export function usePrimaryClubMedia(clubId: string | null, mediaType?: 'image' | 'video') {
  const { data: media, ...query } = useClubMedia(clubId);
  
  const primaryMedia = media?.find(m => 
    m.is_primary && (!mediaType || m.media_type === mediaType)
  );
  
  return {
    data: primaryMedia,
    ...query
  };
}

// Helper to get all images
export function useClubImages(clubId: string | null) {
  const { data: media, ...query } = useClubMedia(clubId);
  
  const images = media?.filter(m => m.media_type === 'image') || [];
  
  return {
    data: images,
    primaryImage: images.find(img => img.is_primary),
    ...query
  };
}

// Helper to get all videos
export function useClubVideos(clubId: string | null) {
  const { data: media, ...query } = useClubMedia(clubId);
  
  const videos = media?.filter(m => m.media_type === 'video') || [];
  
  return {
    data: videos,
    primaryVideo: videos.find(vid => vid.is_primary),
    ...query
  };
}
