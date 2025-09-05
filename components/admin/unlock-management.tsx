"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Gift, 
  Plus, 
  Edit, 
  Trash2, 
  Users, 
  Crown, 
  Star, 
  Calendar,
  MapPin,
  Globe,
  Ticket,
  Music,
  ShoppingBag,
  Award
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useClubs } from "@/hooks/use-clubs";

interface UnlockManagementProps {
  onStatsUpdate?: () => void;
}

interface Unlock {
  id: string;
  club_id: string;
  title: string;
  description: string;
  unlock_type: string;
  required_status: string;
  is_active: boolean;
  created_at: string;
  club_name?: string;
  metadata?: {
    icon?: string;
    redemption_instructions?: string;
    expiry_date?: string;
    location?: string;
    capacity?: number;
  };
}

const UNLOCK_TYPES = [
  { value: 'presale_access', label: 'Presale Access', icon: Ticket },
  { value: 'line_skip', label: 'Line Skip', icon: Users },
  { value: 'backstage_pass', label: 'Backstage Pass', icon: Star },
  { value: 'studio_visit', label: 'Studio Visit', icon: Music },
  { value: 'vinyl_lottery', label: 'Vinyl Lottery', icon: Award },
  { value: 'merch_discount', label: 'Merch Discount', icon: ShoppingBag },
  { value: 'meet_greet', label: 'Meet & Greet', icon: Crown },
  { value: 'exclusive_content', label: 'Exclusive Content', icon: Globe },
];

const STATUS_LEVELS = [
  { value: 'cadet', label: 'Cadet (0+ points)', color: 'bg-gray-500' },
  { value: 'resident', label: 'Resident (500+ points)', color: 'bg-blue-500' },
  { value: 'headliner', label: 'Headliner (1500+ points)', color: 'bg-purple-500' },
  { value: 'superfan', label: 'Superfan (4000+ points)', color: 'bg-pink-500' },
];

export default function UnlockManagement({ onStatsUpdate }: UnlockManagementProps) {
  const { toast } = useToast();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingUnlock, setEditingUnlock] = useState<Unlock | null>(null);
  
  // Load clubs for selection
  const { data: clubs = [] } = useClubs();
  const activeClubs = clubs.filter(club => club.is_active);

  // Form state
  const [formData, setFormData] = useState({
    club_id: '',
    title: '',
    description: '',
    unlock_type: '',
    required_status: 'cadet',
    redemption_instructions: '',
    expiry_date: '',
    location: '',
    capacity: ''
  });

  useEffect(() => {
    loadUnlocks();
  }, []);

  const loadUnlocks = async () => {
    try {
      const response = await fetch('/api/admin/unlocks');
      if (response.ok) {
        const data = await response.json();
        setUnlocks(data);
      }
    } catch (error) {
      console.error('Error loading unlocks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const payload = {
        ...formData,
        metadata: {
          redemption_instructions: formData.redemption_instructions,
          expiry_date: formData.expiry_date,
          location: formData.location,
          capacity: formData.capacity ? parseInt(formData.capacity) : undefined,
        }
      };

      const response = await fetch('/api/admin/unlocks', {
        method: editingUnlock ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUnlock ? { ...payload, id: editingUnlock.id } : payload),
      });

      if (response.ok) {
        await loadUnlocks();
        onStatsUpdate?.();
        setFormData({
          club_id: '',
          title: '',
          description: '',
          unlock_type: '',
          required_status: 'cadet',
          redemption_instructions: '',
          expiry_date: '',
          location: '',
          capacity: ''
        });
        setEditingUnlock(null);
        toast({
          title: "Success!",
          description: `Unlock ${editingUnlock ? 'updated' : 'created'} successfully`,
        });
      } else {
        throw new Error('Failed to save unlock');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save unlock",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (unlock: Unlock) => {
    setEditingUnlock(unlock);
    setFormData({
      club_id: unlock.club_id,
      title: unlock.title,
      description: unlock.description,
      unlock_type: unlock.unlock_type,
      required_status: unlock.required_status,
      redemption_instructions: unlock.metadata?.redemption_instructions || '',
      expiry_date: unlock.metadata?.expiry_date || '',
      location: unlock.metadata?.location || '',
      capacity: unlock.metadata?.capacity?.toString() || ''
    });
  };

  const handleToggleActive = async (unlock: Unlock) => {
    try {
      const response = await fetch(`/api/admin/unlocks/${unlock.id}/toggle`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadUnlocks();
        onStatsUpdate?.();
        toast({
          title: "Unlock Updated",
          description: `${unlock.title} has been ${unlock.is_active ? 'deactivated' : 'activated'}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update unlock",
        variant: "destructive",
      });
    }
  };

  const getUnlockTypeInfo = (type: string) => {
    return UNLOCK_TYPES.find(t => t.value === type) || UNLOCK_TYPES[0];
  };

  const getStatusInfo = (status: string) => {
    return STATUS_LEVELS.find(s => s.value === status) || STATUS_LEVELS[0];
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Unlock Management</h2>
          <p className="text-muted-foreground">
            Create and manage perks that members can unlock based on their status
          </p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Unlock
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingUnlock ? 'Edit' : 'Create'} Unlock
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="club_id">Club</Label>
                  <Select value={formData.club_id} onValueChange={(value) => setFormData({...formData, club_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select club..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeClubs.map((club, index) => (
                        <SelectItem key={club.id || `club-${index}`} value={club.id}>
                          {club.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="unlock_type">Unlock Type</Label>
                  <Select value={formData.unlock_type} onValueChange={(value) => setFormData({...formData, unlock_type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {UNLOCK_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g., Presale Access to Summer Tour"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe what this unlock provides..."
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="required_status">Required Status</Label>
                <Select value={formData.required_status} onValueChange={(value) => setFormData({...formData, required_status: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_LEVELS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="redemption_instructions">Redemption Instructions</Label>
                <Textarea
                  id="redemption_instructions"
                  value={formData.redemption_instructions}
                  onChange={(e) => setFormData({...formData, redemption_instructions: e.target.value})}
                  placeholder="How members can redeem this unlock..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location (optional)</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    placeholder="e.g., The Echo, Los Angeles"
                  />
                </div>
                
                <div>
                  <Label htmlFor="capacity">Capacity (optional)</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => setFormData({...formData, capacity: e.target.value})}
                    placeholder="e.g., 50"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="expiry_date">Expiry Date (optional)</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({...formData, expiry_date: e.target.value})}
                />
              </div>
              
              <Button type="submit" disabled={isCreating} className="w-full">
                {isCreating ? 'Creating...' : (editingUnlock ? 'Update' : 'Create')} Unlock
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Unlocks</p>
                <p className="text-2xl font-bold">{unlocks.length}</p>
              </div>
              <Gift className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Unlocks</p>
                <p className="text-2xl font-bold">{unlocks.filter(u => u.is_active).length}</p>
              </div>
              <Star className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clubs with Unlocks</p>
                <p className="text-2xl font-bold">
                  {new Set(unlocks.map(u => u.club_id)).size}
                </p>
              </div>
              <Crown className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unlocks List */}
      <div className="space-y-4">
        {unlocks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No unlocks created yet</h3>
              <p className="text-muted-foreground">
                Create your first unlock to start offering perks to members
              </p>
            </CardContent>
          </Card>
        ) : (
          unlocks.map((unlock, index) => {
            const typeInfo = getUnlockTypeInfo(unlock.unlock_type);
            const statusInfo = getStatusInfo(unlock.required_status);
            const IconComponent = typeInfo.icon;
            
            return (
              <motion.div
                key={unlock.id || `unlock-${index}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <IconComponent className="h-5 w-5 text-primary" />
                          <h3 className="text-lg font-semibold">{unlock.title}</h3>
                          <Badge variant={unlock.is_active ? "default" : "secondary"}>
                            {unlock.is_active ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline" className={statusInfo.color}>
                            {statusInfo.label.split(' ')[0]}
                          </Badge>
                        </div>
                        
                        <p className="text-muted-foreground text-sm mb-3">
                          {unlock.description}
                        </p>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{typeInfo.label}</span>
                          {unlock.club_name && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {unlock.club_name}
                            </div>
                          )}
                          {unlock.metadata?.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {unlock.metadata.location}
                            </div>
                          )}
                          {unlock.metadata?.expiry_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Expires {new Date(unlock.metadata.expiry_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(unlock)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(unlock)}
                        >
                          {unlock.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
