"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon, Video, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useClubMedia, ClubMedia } from "@/hooks/use-club-media";
import { getAccessToken } from "@privy-io/react-auth";

interface ClubMediaManagerProps {
  clubId: string;
}

const ClubMediaManager: React.FC<ClubMediaManagerProps> = ({ clubId }) => {
  const { toast } = useToast();
  const { data: existingMedia, isLoading, refetch } = useClubMedia(clubId);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      // Upload each file
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('media_type', file.type.startsWith('image/') ? 'image' : 'video');
        formData.append('alt_text', file.name);

        const response = await fetch(`/api/clubs/${clubId}/media`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload file');
        }
      }

      toast({
        title: "Success! 🎉",
        description: `Uploaded ${files.length} file${files.length > 1 ? 's' : ''} successfully`,
      });

      // Refresh the media list
      refetch();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Failed to upload files',
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const deleteMedia = async (mediaId: string) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/clubs/${clubId}/media?media_id=${mediaId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete media');
      }

      toast({
        title: "Deleted! 🗑️",
        description: "Media item deleted successfully",
      });

      // Refresh the media list
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : 'Failed to delete media',
        variant: "destructive",
      });
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const getFileIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      default:
        return <ImageIcon className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Media Management</h3>
        <p className="text-sm text-muted-foreground">Manage media for the "Latest" section</p>
      </div>

      {/* Upload Button */}
      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button
            onClick={openFileDialog}
            disabled={isUploading}
            variant="outline"
            size="sm"
            className="transition-all duration-200 hover:shadow-md"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <motion.div
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                </motion.div>
                Add Media
              </>
            )}
          </Button>
        </motion.div>
        
        <motion.span 
          className="text-xs text-muted-foreground"
          initial={{ opacity: 0.7 }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          Supports images and videos
        </motion.span>
      </div>

      {/* Media List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : existingMedia && existingMedia.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {existingMedia.map((media, index) => (
              <motion.div
                key={media.id}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1, 
                  y: 0,
                  transition: {
                    delay: index * 0.1,
                    type: "spring",
                    stiffness: 300,
                    damping: 20
                  }
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.8,
                  y: -20,
                  transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                  }
                }}
                whileHover={{ 
                  scale: 1.05,
                  y: -5,
                  transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 10
                  }
                }}
                className="relative group bg-card border border-border rounded-lg overflow-hidden aspect-square cursor-pointer shadow-sm hover:shadow-lg transition-shadow duration-300"
              >
                {/* Media Preview */}
                <motion.div 
                  className="w-full h-full relative"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {media.media_type === 'image' ? (
                    <img
                      src={media.file_url || media.file_path}
                      alt={media.alt_text || 'Club media'}
                      className="w-full h-full object-cover transition-transform duration-300"
                    />
                  ) : (
                    <video
                      src={media.file_url || media.file_path}
                      className="w-full h-full object-cover transition-transform duration-300"
                      muted
                    />
                  )}
                  
                  {/* Delete Button - Always Visible */}
                  <motion.div 
                    className="absolute top-2 right-2 z-10"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <motion.button
                      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium bg-destructive text-white shadow-lg hover:bg-destructive/90 h-8 w-8 hover:shadow-xl"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMedia(media.id);
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.div
                        animate={{ rotate: [0, -5, 5, -5, 0] }}
                        transition={{ duration: 0.5 }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </motion.div>
                    </motion.button>
                  </motion.div>
                  
                  {/* Media Type Indicator */}
                  <motion.div 
                    className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    whileHover={{ scale: 1.1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      {getFileIcon(media.media_type)}
                    </motion.div>
                    {media.media_type}
                  </motion.div>
                </motion.div>
                
                {/* Media Info */}
                <motion.div 
                  className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent text-white p-2"
                  initial={{ y: 20, opacity: 0 }}
                  whileHover={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <motion.p 
                    className="text-xs truncate font-medium"
                    whileHover={{ scale: 1.02 }}
                  >
                    {media.file_name}
                  </motion.p>
                  <motion.p 
                    className="text-xs text-gray-300"
                    whileHover={{ scale: 1.02 }}
                  >
                    {formatFileSize(media.file_size)}
                  </motion.p>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div 
          className="text-center py-8 border border-border rounded-lg bg-muted/20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <motion.div
            animate={{ 
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          >
            <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          </motion.div>
          <motion.p 
            className="text-sm text-muted-foreground"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            No media files yet
          </motion.p>
          <motion.p 
            className="text-xs text-muted-foreground"
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            Upload some images or videos to get started
          </motion.p>
        </motion.div>
      )}
    </div>
  );
};

export default ClubMediaManager;
