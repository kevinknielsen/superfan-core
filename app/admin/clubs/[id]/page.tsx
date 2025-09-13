"use client";

import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { ArrowLeft, Upload, X, Save, Loader2, Check } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from "@/hooks/use-toast";
import { usePrivy } from "@privy-io/react-auth";
import Header from "@/components/header";
import ClubMediaManager from "@/components/admin/club-media-manager";

interface Club {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  image_url: string | null;
  is_active: boolean;
  point_sell_cents: number;
  point_settle_cents: number;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export default function ClubManagementPage() {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const clubId = params.id as string;

  const [club, setClub] = useState<Club | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [coverImagePreview, setCoverImagePreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const resetTimerRef = React.useRef<number | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    city: '',
    image_url: '',
    is_active: true
  });

  useEffect(() => {
    if (clubId) {
      fetchClub();
    }
  }, [clubId]);

  // Cleanup timeout and abort controller to avoid state updates after unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchClub = async () => {
    try {
      // Abort previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');
      
      abortControllerRef.current = new AbortController();
      const response = await fetch(`/api/admin/clubs/${clubId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        signal: abortControllerRef.current.signal,
      });

      if (response.ok) {
        const clubData = await response.json() as Club;
        setClub(clubData);
        setFormData({
          name: clubData.name,
          description: clubData.description || '',
          city: clubData.city || '',
          image_url: clubData.image_url || '',
          is_active: clubData.is_active
        });
        setCoverImagePreview(clubData.image_url || '');
      } else {
        toast({
          title: "Error",
          description: "Failed to load club",
          variant: "destructive",
        });
        // Stay on page and show the "Club not found" UI
      }
    } catch (error) {
      console.error('Error fetching club:', error);
      toast({
        title: "Error",
        description: "Failed to load club",
        variant: "destructive",
      });
      // Stay on page and show the "Club not found" UI
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file');
      }
      const maxBytes = 5 * 1024 * 1024; // 5MB
      if (file.size > maxBytes) {
        throw new Error('Image is too large (max 5MB)');
      }
      
      // Use data URL only for client-side preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setCoverImagePreview(result);
        // TODO: Upload file to media service and get hosted URL
        // For now, don't set image_url until we have a proper hosted URL
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    setCoverImagePreview("");
    // Don't clear image_url from formData - let it keep the original hosted URL
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!club) return;
    
    setSaveStatus("saving");
    setIsSaving(true);
    
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Not authenticated');
      
      const response = await fetch('/api/admin/clubs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: club.id,
          ...formData
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || 'Failed to update club');
      }

      const updatedClub = await response.json() as Club;
      setClub(updatedClub);
      setFormData({
        name: updatedClub.name,
        description: updatedClub.description || '',
        city: updatedClub.city || '',
        image_url: updatedClub.image_url || '',
        is_active: updatedClub.is_active
      });
      setCoverImagePreview(updatedClub.image_url || '');
      setSaveStatus("saved");
      toast({
        title: "Success",
        description: "Club updated successfully",
      });
      
      resetTimerRef.current = window.setTimeout(() => setSaveStatus("idle"), 2000);
      
    } catch (error) {
      console.error('Error updating club:', error);
      setSaveStatus("idle");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update club',
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (club) {
      setFormData({
        name: club.name,
        description: club.description || '',
        city: club.city || '',
        image_url: club.image_url || '',
        is_active: club.is_active
      });
      setCoverImagePreview(club.image_url || '');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading club...</p>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground text-lg mb-4">Club not found</p>
          <Button onClick={() => router.push('/admin')}>
            Back to Admin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Mobile Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mr-3 p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Edit Club</h1>
      </div>

      <div className="p-4 flex justify-center">
        <div className="w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-6"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Edit Club Profile</h2>
              <p className="text-sm text-muted-foreground">Update your club's essential information</p>
            </div>

            <div className="space-y-6">
              {/* Cover Image Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Cover Image</Label>
                <div className="relative">
                  {coverImagePreview ? (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                      <img 
                        src={coverImagePreview} 
                        alt="Cover preview" 
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-2 right-2 p-1 bg-background/80 rounded-full hover:bg-background transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Upload cover image"
                      className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
                    >
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground text-center">Click to upload cover image</p>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Club Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Club Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Enter club name"
                  className="input-field"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Tell people about your club..."
                  className="min-h-[100px] resize-none input-field"
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  {formData.description.length}/500 characters
                </p>
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  placeholder="Enter city"
                  className="input-field"
                />
              </div>

              {/* Media Management Section */}
              <div className="space-y-4 pt-6 border-t border-border">
                <ClubMediaManager clubId={clubId} />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 gap-2"
                  onClick={handleSave}
                  disabled={isSaving || !formData.name.trim()}
                >
                  {saveStatus === "saving" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saveStatus === "saved" && <Check className="w-4 h-4" />}
                  {saveStatus === "idle" && <Save className="w-4 h-4" />}
                  {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
