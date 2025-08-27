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
import { useToast } from "@/hooks/use-toast";
import { useClubs } from "@/hooks/use-clubs";
import { ClubMediaManager } from "@/components/club-media-manager";
import type { Club } from "@/types/club.types";

interface ClubManagementProps {
  onStatsUpdate?: () => void;
}

export default function ClubManagement({ onStatsUpdate }: ClubManagementProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load clubs data
  const { data: clubs = [], isLoading, refetch } = useClubs();

  // Filter clubs based on search
  const filteredClubs = clubs.filter(club => 
    club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    club.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateClub = async () => {
    setIsCreating(true);
    // TODO: Implement club creation modal
    toast({
      title: "Coming Soon",
      description: "Club creation interface will be available soon",
    });
    setIsCreating(false);
  };

  const handleEditClub = (club: Club) => {
    setSelectedClub(club);
    // TODO: Implement club editing modal
    toast({
      title: "Coming Soon", 
      description: "Club editing interface will be available soon",
    });
  };

  const handleViewClub = (club: Club) => {
    setSelectedClub(club);
  };

  const handleToggleActive = async (club: Club) => {
    try {
      const response = await fetch(`/api/admin/clubs/${club.id}/toggle-active`, {
        method: 'POST',
      });

      if (response.ok) {
        await refetch();
        onStatsUpdate?.();
        toast({
          title: "Club Updated",
          description: `${club.name} has been ${club.is_active ? 'deactivated' : 'activated'}`,
        });
      } else {
        throw new Error('Failed to update club');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update club status",
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
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Club Information
              </CardTitle>
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
        
        <Button onClick={handleCreateClub} disabled={isCreating}>
          <Plus className="h-4 w-4 mr-2" />
          Create Club
        </Button>
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
