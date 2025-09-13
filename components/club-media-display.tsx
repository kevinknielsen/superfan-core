"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClubMedia, ClubMedia } from '@/hooks/use-club-media';

interface ClubMediaDisplayProps {
  clubId: string;
  className?: string;
  showControls?: boolean; // Show carousel controls
  autoPlay?: boolean; // Auto-play videos
  fallbackImage?: string; // Fallback if no media
}

export function ClubMediaDisplay({ 
  clubId, 
  className = "", 
  showControls = false,
  autoPlay = false,
  fallbackImage = "/placeholder.svg"
}: ClubMediaDisplayProps) {
  const { data: media, isLoading, error } = useClubMedia(clubId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(!autoPlay);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // (optional) Add back a debug-only ID if needed during local debugging
  // const componentId = React.useMemo(() => Math.random().toString(36).substr(2, 9), []);

  // Get primary media first, then fallback to ordered media
  const displayMedia = React.useMemo(() => {
    if (!media?.length) return [];
    
    const primaryImage = media.find(m => m.media_type === 'image' && m.is_primary);
    const primaryVideo = media.find(m => m.media_type === 'video' && m.is_primary);
    const otherMedia = media.filter(m => !m.is_primary).sort((a, b) => a.display_order - b.display_order);
    
    const orderedMedia: ClubMedia[] = [];
    if (primaryImage) orderedMedia.push(primaryImage);
    if (primaryVideo) orderedMedia.push(primaryVideo);
    orderedMedia.push(...otherMedia);
    
    return orderedMedia;
  }, [media]);

  const currentMedia = displayMedia[currentIndex];

  // Auto-play video when it becomes current
  useEffect(() => {
    if (currentMedia?.media_type === 'video' && videoRef.current && autoPlay) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [currentIndex, currentMedia, autoPlay]);

  const handleVideoToggle = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(error => {
          console.error('Error playing video:', error);
        });
      }
      // Don't set state manually - let onPlay/onPause events handle it
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const nextMedia = () => {
    setCurrentIndex((prev) => (prev + 1) % displayMedia.length);
  };

  const prevMedia = () => {
    setCurrentIndex((prev) => (prev - 1 + displayMedia.length) % displayMedia.length);
  };

  if (isLoading) {
    return (
      <div className={`bg-muted animate-pulse ${className}`}>
        <div className="w-full h-full" />
      </div>
    );
  }

  if (error || !displayMedia.length) {
    return (
      <div className={`bg-primary/20 flex items-center justify-center ${className}`}>
        <img
          src={fallbackImage}
          alt="Club"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden group ${className}`}>
      {currentMedia?.media_type === 'image' ? (
        <img
          src={currentMedia.file_url ?? currentMedia.file_path}
          alt={currentMedia.alt_text || 'Club image'}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="relative">
          <video
            ref={videoRef}
            src={currentMedia.file_url ?? currentMedia.file_path}
            className="w-full h-full object-cover"
            poster={currentMedia.thumbnail_url ?? undefined}
            muted={isMuted}
            loop
            playsInline
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          
          {/* Video Controls */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Button
                aria-label="Play video"
                variant="secondary"
                size="sm"
                onClick={handleVideoToggle}
                className="bg-black/70 hover:bg-black/90 text-white"
              >
                <Play className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {/* Pause Controls - only show on hover when playing */}
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
              <Button
                aria-label="Pause video"
                variant="secondary"
                size="sm"
                onClick={handleVideoToggle}
                className="bg-black/70 hover:bg-black/90 text-white"
              >
                <Pause className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Mute Toggle - moved to bottom right */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMuteToggle}
            className="absolute bottom-2 right-2 bg-black/70 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </Button>
        </div>
      )}

      {/* Caption overlay */}
      {currentMedia?.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-white text-sm">{currentMedia.caption}</p>
        </div>
      )}

      {/* Carousel Controls */}
      {showControls && displayMedia.length > 1 && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={prevMedia}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={nextMedia}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/70 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Media indicators - positioned to not overlap with mute button */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {displayMedia.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Show media ${index + 1} of ${displayMedia.length}`}
                aria-pressed={index === currentIndex}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
