"use client";

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Upload, X, Play, Image as ImageIcon, Video } from 'lucide-react';
import { getAccessToken } from "@privy-io/react-auth";

interface ClubMedia {
  id: string;
  club_id: string;
  media_type: 'image' | 'video';
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  is_primary: boolean;
  alt_text?: string;
  caption?: string;
  duration_seconds?: number;
  thumbnail_path?: string;
  created_at: string;
  updated_at: string;
}

interface ClubMediaManagerProps {
  clubId: string;
  isAdmin?: boolean;
}

export function ClubMediaManager({ clubId, isAdmin = false }: ClubMediaManagerProps) {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'image' | 'video'>('image');
  const [isPrimary, setIsPrimary] = useState(false);
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch club media
  const { data: media, isLoading, error } = useQuery({
    queryKey: ['club-media', clubId],
    queryFn: async (): Promise<ClubMedia[]> => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/clubs/${clubId}/media`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch media');
      }

      return response.json();
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/clubs/${clubId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload media');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-media', clubId] });
      setUploadFile(null);
      setAltText('');
      setCaption('');
      setIsPrimary(false);
      toast({
        title: 'Media uploaded!',
        description: 'Your media has been uploaded successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      // Auto-detect media type
      if (file.type.startsWith('image/')) {
        setUploadType('image');
      } else if (file.type.startsWith('video/')) {
        setUploadType('video');
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('mediaType', uploadType);
    formData.append('isPrimary', isPrimary.toString());
    formData.append('altText', altText);
    formData.append('caption', caption);

    try {
      await uploadMutation.mutateAsync(formData);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading media...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    console.error('ClubMediaManager error:', error);
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="text-destructive mb-2">Error loading media</div>
            <div className="text-sm text-muted-foreground">{error.message}</div>
            {error.message.includes('club_media') && (
              <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
                <p className="font-medium text-yellow-600">Database Setup Required</p>
                <p className="text-yellow-700 mt-1">
                  The club_media table may not exist. Please run the migration:
                  <br />
                  <code className="bg-black/20 px-1 rounded">migrations/005_club_media_storage.sql</code>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const images = media?.filter(m => m.media_type === 'image') || [];
  const videos = media?.filter(m => m.media_type === 'video') || [];
  const primaryImage = images.find(img => img.is_primary);
  const primaryVideo = videos.find(vid => vid.is_primary);

  return (
    <div className="space-y-6">
      {/* Media Gallery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Club Media Gallery
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Primary Media Display */}
          <div className="mb-6">
            <h4 className="font-medium mb-3">Featured Content</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Primary Image */}
              {primaryImage && (
                <div className="relative rounded-lg overflow-hidden bg-muted">
                  <img
                    src={primaryImage.file_path}
                    alt={primaryImage.alt_text || 'Club image'}
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs">
                    Primary Image
                  </div>
                  {primaryImage.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-sm">
                      {primaryImage.caption}
                    </div>
                  )}
                </div>
              )}

              {/* Primary Video */}
              {primaryVideo && (
                <div className="relative rounded-lg overflow-hidden bg-muted">
                  <video
                    src={primaryVideo.file_path}
                    className="w-full h-48 object-cover"
                    controls
                    preload="metadata"
                  />
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs">
                    Primary Video
                  </div>
                  {primaryVideo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-sm">
                      {primaryVideo.caption}
                    </div>
                  )}
                </div>
              )}

              {/* Placeholder if no primary media */}
              {!primaryImage && !primaryVideo && (
                <div className="flex items-center justify-center h-48 bg-muted rounded-lg border-2 border-dashed border-border">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                    <p>No primary media</p>
                    <p className="text-sm">Upload an image or video and set it as primary</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* All Media Grid */}
          {(images.length > 0 || videos.length > 0) && (
            <div>
              <h4 className="font-medium mb-3">All Media ({media?.length || 0})</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {media?.map((item) => (
                  <div key={item.id} className="relative group">
                    {item.media_type === 'image' ? (
                      <img
                        src={item.file_path}
                        alt={item.alt_text || 'Club image'}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="relative">
                        <video
                          src={item.file_path}
                          className="w-full h-24 object-cover rounded-lg"
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="h-6 w-6 text-white drop-shadow-lg" />
                        </div>
                      </div>
                    )}
                    
                    {item.is_primary && (
                      <div className="absolute top-1 left-1 bg-primary text-primary-foreground px-1 py-0.5 rounded text-xs">
                        Primary
                      </div>
                    )}
                    
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white px-1 py-0.5 rounded text-xs">
                      {item.media_type === 'image' ? (
                        <ImageIcon className="h-3 w-3" />
                      ) : (
                        <Video className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Section (Admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload New Media
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div>
              <Label htmlFor="media-upload">Select Image or Video</Label>
              <Input
                id="media-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,video/*"
                className="mt-1"
              />
              {uploadFile && (
                <div className="mt-2 p-2 bg-muted rounded flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadFile.size)} • {uploadFile.type}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {uploadFile && (
              <>
                {/* Alt Text */}
                <div>
                  <Label htmlFor="alt-text">Alt Text (for accessibility)</Label>
                  <Input
                    id="alt-text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Describe the image/video for screen readers"
                  />
                </div>

                {/* Caption */}
                <div>
                  <Label htmlFor="caption">Caption (optional)</Label>
                  <Textarea
                    id="caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption that will be displayed with the media"
                    rows={2}
                  />
                </div>

                {/* Primary Setting */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is-primary"
                    checked={isPrimary}
                    onCheckedChange={setIsPrimary}
                  />
                  <Label htmlFor="is-primary">
                    Set as primary {uploadType} (featured in club cards)
                  </Label>
                </div>

                {/* Upload Button */}
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !uploadFile}
                  className="w-full"
                >
                  {isUploading ? 'Uploading...' : `Upload ${uploadType}`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
