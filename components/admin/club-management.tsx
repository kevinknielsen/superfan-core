"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Settings, UserPlus, Calendar, MessageSquare, Plus, Edit3, Trash2, MapPin, DollarSign } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

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

interface ClubManagementProps {
  onStatsUpdate?: () => void;
}

export default function ClubManagement({ onStatsUpdate }: ClubManagementProps) {
  const { getAccessToken } = usePrivy();
  const { toast } = useToast();
  const router = useRouter();
  
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    city: '',
    point_sell_cents: 100,
    point_settle_cents: 50,
    image_url: ''
  });

  useEffect(() => {
    fetchClubs();
  }, []);

  const fetchClubs = async () => {
    try {
      const accessToken = await getAccessToken();
      
      const response = await fetch('/api/admin/clubs', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const clubsData = await response.json() as Club[];
        setClubs(Array.isArray(clubsData) ? clubsData : []);
      } else {
        toast({
          title: "Error",
          description: "Failed to load clubs",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
      toast({
        title: "Error",
        description: "Failed to load clubs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      city: '',
      point_sell_cents: 100,
      point_settle_cents: 50,
      image_url: ''
    });
  };

  const handleCreateClub = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleEditClub = (club: Club) => {
    // Navigate to dedicated club management page
    router.push(`/admin/clubs/${club.id}`);
  };

  const handleSubmitClub = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine if we're editing (either modal edit or inline edit)
    const isEdit = !!editingClub || isEditingDetails;
    const currentClub = editingClub || (clubs.length === 1 ? clubs[0] : null);
    
    // Validate point prices
    const sellPrice = formData.point_sell_cents || (currentClub?.point_sell_cents || 100);
    const settlePrice = formData.point_settle_cents || (currentClub?.point_settle_cents || 50);
    
    if (settlePrice > sellPrice) {
      toast({
        title: "Invalid Pricing",
        description: "Settle price cannot be higher than sell price",
        variant: "destructive",
      });
      return;
    }
    
    const setLoading = isEdit ? setIsEditing : setIsCreating;
    
    setLoading(true);
    
    try {
      const accessToken = await getAccessToken();
      const url = isEdit ? '/api/admin/clubs' : '/api/admin/clubs';
      const method = isEdit ? 'PUT' : 'POST';
      
      const requestBody = isEdit 
        ? { 
            ...formData, 
            id: currentClub?.id,
            // Fill in any missing fields with current club data
            name: formData.name || currentClub?.name,
            description: formData.description || currentClub?.description,
            city: formData.city || currentClub?.city,
            point_sell_cents: formData.point_sell_cents || currentClub?.point_sell_cents,
            point_settle_cents: formData.point_settle_cents || currentClub?.point_settle_cents,
            image_url: formData.image_url || currentClub?.image_url
          }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Failed to ${isEdit ? 'update' : 'create'} club`);
      }

      const club = await response.json() as Club;
      
      // Refresh clubs list and stats
      await fetchClubs();
      if (onStatsUpdate) {
        onStatsUpdate();
      }
      
      // Close modals and reset form
      setShowCreateModal(false);
      setShowEditModal(false);
      setEditingClub(null);
      setIsEditingDetails(false);
      resetForm();
      
      toast({
        title: "Success",
        description: `Club ${isEdit ? 'updated' : 'created'} successfully`,
      });
      
    } catch (error) {
      console.error(`Error ${isEdit ? 'updating' : 'creating'} club:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${isEdit ? 'update' : 'create'} club`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (club: Club) => {
    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/admin/clubs', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: club.id,
          is_active: !club.is_active
        }),
      });

      if (response.ok) {
        await fetchClubs();
        if (onStatsUpdate) {
          onStatsUpdate();
        }
        toast({
          title: "Success",
          description: `${club.name} has been ${club.is_active ? 'deactivated' : 'activated'}`,
        });
      } else {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || 'Failed to update club');
      }
    } catch (error) {
      console.error('Error toggling club status:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update club status",
        variant: "destructive",
      });
    }
  };

  // Club creation/editing modal (shared for both create and edit)
  const ClubFormModal = () => (
    <Dialog open={showCreateModal || showEditModal} onOpenChange={(open) => {
      if (!open) {
        setShowCreateModal(false);
        setShowEditModal(false);
        setEditingClub(null);
        resetForm();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingClub ? 'Edit Club' : 'Create New Club'}</DialogTitle>
          <DialogDescription>
            {editingClub ? 'Update your club information' : 'Set up your club with basic information'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmitClub} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Club Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., PHAT Club"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({...formData, city: e.target.value})}
                placeholder="e.g., Los Angeles"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe the artist, label, or curator community..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="point_sell_cents">Point Sell Price (cents)</Label>
              <Input
                id="point_sell_cents"
                type="number"
                value={formData.point_sell_cents}
                onChange={(e) => setFormData({...formData, point_sell_cents: parseInt(e.target.value) || 100})}
                min="50"
                max="500"
                placeholder="100"
              />
              <p className="text-xs text-muted-foreground">
                {formData.point_sell_cents}¢ = ${(formData.point_sell_cents / 100).toFixed(2)} for 1000 points
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="point_settle_cents">Point Settle Price (cents)</Label>
              <Input
                id="point_settle_cents"
                type="number"
                value={formData.point_settle_cents}
                onChange={(e) => setFormData({...formData, point_settle_cents: parseInt(e.target.value) || 50})}
                min="25"
                max="250"
                placeholder="50"
              />
              <p className="text-xs text-muted-foreground">
                Artist gets {formData.point_settle_cents}¢ per 1000 points spent
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="image_url">Club Logo URL (optional)</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData({...formData, image_url: e.target.value})}
              placeholder="https://example.com/logo.png"
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowCreateModal(false);
                setShowEditModal(false);
                setEditingClub(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || isEditing}>
              {editingClub 
                ? (isEditing ? 'Updating...' : 'Update Club')
                : (isCreating ? 'Creating...' : 'Create Club')
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // If no clubs exist, show onboarding
  if (clubs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6"
          >
            <Users className="w-12 h-12 text-primary" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold text-foreground mb-4"
          >
            Create Your First Club
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg mb-8 max-w-md"
          >
            Start building your community by creating a club. You can manage members, organize events, and track engagement.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              onClick={handleCreateClub}
              size="lg"
              className="gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Your First Club
            </Button>
          </motion.div>
        </div>
        
        <ClubFormModal />
      </div>
    );
  }

  // If user has exactly one club, show inline editing interface
  if (clubs.length === 1) {
    const club = clubs[0];
    
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Club Details Card - Editable */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{club.name}</CardTitle>
                    <CardDescription className="text-base mt-1">{club.description}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={club.is_active ? "default" : "secondary"}>
                    {club.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2" 
                    onClick={() => setIsEditingDetails(!isEditingDetails)}
                  >
                    <Edit3 className="w-4 h-4" />
                    {isEditingDetails ? 'Cancel' : 'Edit'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {isEditingDetails ? (
              <CardContent>
                <form onSubmit={handleSubmitClub} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Club Name</Label>
                      <Input
                        id="name"
                        value={formData.name || club.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="Enter club name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city || club.city || ''}
                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                        placeholder="Enter city"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description || club.description || ''}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Describe your club"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="point_sell_cents">Point Price (cents per 1000 points)</Label>
                      <Input
                        id="point_sell_cents"
                        type="number"
                        value={formData.point_sell_cents || club.point_sell_cents}
                        onChange={(e) => setFormData({...formData, point_sell_cents: parseInt(e.target.value) || 100})}
                        min="50"
                        max="500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="point_settle_cents">Artist Payout (cents per 1000 points)</Label>
                      <Input
                        id="point_settle_cents"
                        type="number"
                        value={formData.point_settle_cents || club.point_settle_cents}
                        onChange={(e) => setFormData({...formData, point_settle_cents: parseInt(e.target.value) || 50})}
                        min="25"
                        max="250"
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsEditingDetails(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isEditing}>
                      {isEditing ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            ) : (
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                    <p className="text-foreground">{club.city || 'Not specified'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Point Price</p>
                    <p className="text-foreground">${(club.point_sell_cents / 100).toFixed(2)} per 1000 points</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Artist Payout</p>
                    <p className="text-foreground">${(club.point_settle_cents / 100).toFixed(2)} per 1000 points</p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>

        {/* Stats Overview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <Card className="card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{club.member_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Members</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">0</p>
                  <p className="text-xs text-muted-foreground">Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">0</p>
                  <p className="text-xs text-muted-foreground">Unlocks</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">$0</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Management Actions */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="card">
            <CardHeader>
              <CardTitle className="text-lg">Club Management</CardTitle>
              <CardDescription>Manage your club details and settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Button 
                  className="w-full justify-start gap-3"
                  onClick={() => router.push(`/admin/clubs/${club.id}`)}
                >
                  <Settings className="w-4 h-4" />
                  Manage Club Details
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  onClick={() => handleToggleActive(club)}
                >
                  <Users className="w-4 h-4" />
                  {club.is_active ? 'Deactivate Club' : 'Activate Club'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // If user has multiple clubs, show simplified list
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Your Clubs</h1>
          <p className="text-muted-foreground mt-1">Manage your clubs and communities</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchClubs} className="gap-2">
            Refresh
          </Button>
          <Button onClick={handleCreateClub} className="gap-2">
            <Plus className="w-4 h-4" />
            Create Club
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.isArray(clubs) && clubs.map((club) => (
          <motion.div
            key={club.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="card cursor-pointer" onClick={() => router.push(`/admin/clubs/${club.id}`)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{club.name}</CardTitle>
                    <CardDescription className="mt-2">{club.description}</CardDescription>
                  </div>
                  <Badge variant={club.is_active ? "default" : "secondary"}>
                    {club.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{club.member_count || 0} members</span>
                  <span>${(club.point_sell_cents / 100).toFixed(2)} per 1000 points</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      
      <ClubFormModal />
    </div>
  );
}