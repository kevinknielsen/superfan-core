"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Users, 
  MapPin, 
  Globe, 
  Search,
  MoreHorizontal,
  Eye,
  Settings
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useClubs } from "@/hooks/use-clubs";
import { ClubMediaManager } from "@/components/club-media-manager";
import type { Club } from "@/types/club.types";
import { getAccessToken } from "@privy-io/react-auth";

interface ClubManagementProps {
  onStatsUpdate?: () => void;
}

export default function ClubManagement({ onStatsUpdate }: ClubManagementProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);

  // Form state for club creation/editing
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    city: '',
    point_sell_cents: 100, // Default: $1 = 1000 points
    point_settle_cents: 50,  // Default: 50% of sell price
    image_url: ''
  });

  // Load clubs data
  const { data: clubs = [], isLoading, refetch } = useClubs();

  // Filter clubs based on search
  const filteredClubs = clubs.filter(club => 
    club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset form data
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

  const handleCreateClub = async () => {
    setShowCreateModal(true);
    resetForm();
  };

  const handleEditClub = (club: Club) => {
    setEditingClub(club);
    setFormData({
      name: club.name,
      description: club.description || '',
      city: club.city || '',
      point_sell_cents: club.point_sell_cents || 100,
      point_settle_cents: club.point_settle_cents || 50,
      image_url: club.image_url || ''
    });
    setShowEditModal(true);
  };

  const handleSubmitClub = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate point prices
    if (formData.point_settle_cents > formData.point_sell_cents) {
      toast({
        title: "Invalid Pricing",
        description: "Settle price cannot be higher than sell price",
        variant: "destructive",
      });
      return;
    }
    
    const isEdit = !!editingClub;
    const setLoading = isEdit ? setIsEditing : setIsCreating;
    
    setLoading(true);
    
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication required');
      }

      const payload = isEdit 
        ? { id: editingClub.id, ...formData }
        : formData;

      const response = await fetch('/api/admin/clubs', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Failed to ${isEdit ? 'update' : 'create'} club`);
      }

      const club = await response.json() as Club;
      
      // Refresh clubs list and stats
      await refetch();
      onStatsUpdate?.();
      
      // Close modals and reset state
      setShowCreateModal(false);
      setShowEditModal(false);
      setEditingClub(null);
      resetForm();
      
      toast({
        title: `Club ${isEdit ? 'Updated' : 'Created'}! 🎉`,
        description: `${club.name} has been ${isEdit ? 'updated' : 'created'} successfully`,
      });

    } catch (error) {
      console.error('Club operation error:', error);
      toast({
        title: `${isEdit ? 'Update' : 'Creation'} Failed`,
        description: error instanceof Error ? error.message : 'Please try again',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewClub = (club: Club) => {
    setSelectedClub(club);
  };

  const handleToggleActive = async (club: Club) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/admin/clubs/${club.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          is_active: !club.is_active
        }),
      });

      if (response.ok) {
        await refetch();
        onStatsUpdate?.();
        toast({
          title: "Club Updated",
          description: `${club.name} has been ${club.is_active ? 'deactivated' : 'activated'}`,
        });
      } else {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || 'Failed to update club');
      }
    } catch (error) {
      console.error('Toggle club error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update club status",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // If a club is selected, show detailed view
  if (selectedClub) {
    return (
      <div className="space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => setSelectedClub(null)}
            className="flex items-center gap-2"
          >
            ← Back to Clubs
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{selectedClub.name}</h2>
            <p className="text-muted-foreground">{selectedClub.description}</p>
          </div>
        </div>

        {/* Club Details & Media Manager */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Club Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Club Information
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleEditClub(selectedClub)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Details
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <p className="text-lg">{selectedClub.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <p className="text-muted-foreground">{selectedClub.description || 'No description'}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <p className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedClub.city || 'No location set'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Pricing</label>
                <div className="text-sm space-y-1">
                  <p>Sell: {selectedClub.point_sell_cents || 100}¢ per 1000 points</p>
                  <p>Settle: {selectedClub.point_settle_cents || 50}¢ per 1000 points</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Badge variant={selectedClub.is_active ? "default" : "secondary"}>
                  {selectedClub.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium">Members</label>
                <p className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {selectedClub.member_count || 0} members
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Media Manager */}
          <div>
            <ClubMediaManager clubId={selectedClub.id} isAdmin={true} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clubs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Dialog open={showCreateModal || showEditModal} onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false);
            setShowEditModal(false);
            setEditingClub(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={handleCreateClub}>
              <Plus className="h-4 w-4 mr-2" />
              Create Club
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingClub ? 'Edit Club' : 'Create New Club'}</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmitClub} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Club Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., PHAT Club"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    placeholder="e.g., Los Angeles"
                  />
                </div>
              </div>
              
              <div>
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
                <div>
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.point_sell_cents}¢ = ${(formData.point_sell_cents / 100).toFixed(2)} for 1000 points
                  </p>
                </div>
                
                <div>
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Artist gets {formData.point_settle_cents}¢ per 1000 points spent
                  </p>
                </div>
              </div>
              
              <div>
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
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clubs</p>
                <p className="text-2xl font-bold">{clubs.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Clubs</p>
                <p className="text-2xl font-bold">{clubs.filter(c => c.is_active).length}</p>
              </div>
              <Globe className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Filtered Results</p>
                <p className="text-2xl font-bold">{filteredClubs.length}</p>
              </div>
              <Search className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clubs List */}
      <div className="space-y-4">
        {filteredClubs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No clubs found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? "Try adjusting your search terms" : "Get started by creating your first club"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredClubs.map((club, index) => (
            <motion.div
              key={club.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{club.name}</h3>
                        <Badge variant={club.is_active ? "default" : "secondary"}>
                          {club.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      
                      <p className="text-muted-foreground text-sm mb-3">
                        {club.description || "No description available"}
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {club.city && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {club.city}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {club.member_count || 0} members
                        </div>
                        <div className="text-xs">
                          Created {new Date(club.created_at || '').toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewClub(club)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditClub(club)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Club
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(club)}>
                          <Settings className="h-4 w-4 mr-2" />
                          {club.is_active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>


    </div>
  );
}
