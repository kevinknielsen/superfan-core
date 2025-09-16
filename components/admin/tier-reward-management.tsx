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
  Award,
  DollarSign,
  TrendingUp,
  Eye,
  EyeOff,
  BarChart3,
  Package,
  Zap,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/points";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useClubs } from "@/hooks/use-clubs";
import { getAccessToken } from "@privy-io/react-auth";

interface TierRewardManagementProps {
  onStatsUpdate?: () => void;
}

interface TierReward {
  id: string;
  club_id: string;
  title: string;
  description: string;
  tier: string;
  reward_type: string;
  artist_cost_estimate_cents: number;
  upgrade_price_cents: number | null;
  total_inventory?: number;
  max_free_allocation?: number;
  safety_factor: number;
  availability_type: string;
  available_start: string | null;
  available_end: string | null;
  inventory_limit: number | null;
  inventory_claimed: number;
  rolling_window_days: number;
  metadata: {
    instructions: string;
    redemption_url?: string;
    details?: string;
    estimated_shipping?: string;
    location?: string;
    requirements?: string;
  };
  is_active: boolean;
  created_at: string;
  club_name?: string;
  // Analytics fields from v_tier_rewards_with_stats
  total_claims?: number;
  tier_qualified_claims?: number;
  upgrade_claims?: number;
  total_upgrade_revenue_cents?: number;
  current_status?: string;
  inventory_status?: string;
}

const REWARD_TYPES = [
  { value: 'access', label: 'Access', icon: Ticket, description: 'Presale access, line skips, etc.' },
  { value: 'digital_product', label: 'Digital Product', icon: Globe, description: 'Downloads, exclusive content' },
  { value: 'physical_product', label: 'Physical Product', icon: Package, description: 'Vinyl, merch, collectibles' },
  { value: 'experience', label: 'Experience', icon: Star, description: 'Meet & greet, studio visits' },
];

const TIER_LEVELS = [
  { value: 'cadet', label: 'Cadet', color: 'bg-gray-500', points: '0+' },
  { value: 'resident', label: 'Resident', color: 'bg-blue-500', points: '5,000+' },
  { value: 'headliner', label: 'Headliner', color: 'bg-purple-500', points: '15,000+' },
  { value: 'superfan', label: 'Superfan', color: 'bg-pink-500', points: '40,000+' },
];

const AVAILABILITY_TYPES = [
  { value: 'permanent', label: 'Permanent', description: 'Always available' },
  { value: 'limited_time', label: 'Limited Time', description: 'Available between specific dates' },
  { value: 'seasonal', label: 'Seasonal', description: 'Recurring seasonal availability' },
];

export default function TierRewardManagement({ onStatsUpdate }: TierRewardManagementProps) {
  const { toast } = useToast();
  const [rewards, setRewards] = useState<TierReward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingReward, setEditingReward] = useState<TierReward | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Load clubs for selection
  const { data: clubs = [] } = useClubs();
  const activeClubs = clubs.filter(club => club.is_active);

  // Form state - enhanced with campaign fields
  const [formData, setFormData] = useState({
    club_id: '',
    title: '',
    description: '',
    tier: 'cadet' as string,
    reward_type: 'access' as string,
    artist_cost_estimate_cents: 0,
    total_inventory: 100,
    max_free_allocation: 0,
    safety_factor: 1.25,
    availability_type: 'permanent' as string,
    available_start: '',
    available_end: '',
    inventory_limit: '',
    rolling_window_days: 60,
    instructions: '',
    redemption_url: '',
    details: '',
    estimated_shipping: '',
    location: '',
    requirements: '',
    
    // New campaign fields
    is_campaign_tier: false,
    campaign_mode: 'new' as 'new' | 'existing', // New field to choose mode
    existing_campaign_id: '', // Select existing campaign
    campaign_title: '',
    campaign_funding_goal_cents: 0,
    campaign_deadline: '',
    resident_discount_percentage: 10.0,
    headliner_discount_percentage: 15.0,
    superfan_discount_percentage: 25.0
  });

  // State for existing campaigns
  const [existingCampaigns, setExistingCampaigns] = useState<Array<{
    campaign_id: string;
    campaign_title: string;
    campaign_funding_goal_cents: number;
    campaign_deadline: string;
    tier_count: number;
  }>>([]);

  useEffect(() => {
    loadRewards();
    loadExistingCampaigns();
  }, []);

  const loadExistingCampaigns = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch('/api/admin/tier-rewards', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json() as TierReward[];
        
        // Group by campaign_id to get unique campaigns
        const campaignMap = new Map();
        data.forEach(reward => {
          if (reward.campaign_id && reward.campaign_title) {
            if (!campaignMap.has(reward.campaign_id)) {
              campaignMap.set(reward.campaign_id, {
                campaign_id: reward.campaign_id,
                campaign_title: reward.campaign_title,
                campaign_funding_goal_cents: reward.campaign_funding_goal_cents || 0,
                campaign_deadline: reward.campaign_deadline || '',
                tier_count: 0
              });
            }
            campaignMap.get(reward.campaign_id).tier_count++;
          }
        });
        
        setExistingCampaigns(Array.from(campaignMap.values()));
      }
    } catch (error) {
      console.error('Error loading existing campaigns:', error);
    }
  };

  const loadRewards = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/admin/tier-rewards', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Handle authentication/authorization errors
          throw new Error('Authentication required. Please log in again.');
        } else if (response.status >= 500) {
          // Handle server errors
          throw new Error('Server error occurred. Please try again later.');
        } else {
          // Handle other HTTP errors
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || `Request failed with status ${response.status}`);
        }
      }

      const data = await response.json() as TierReward[];
      setRewards(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading tier rewards:', error);
      
      // Provide user-friendly error messages based on error type
      let errorMessage = "Failed to load tier rewards";
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/admin/tier-rewards/analytics', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleToggleAnalytics = () => {
    setShowAnalytics(!showAnalytics);
    if (!showAnalytics && !analyticsData) {
      loadAnalytics();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      // Validate required fields
      if (!formData.club_id || !formData.title || !formData.tier || !formData.reward_type) {
        throw new Error('Please fill in all required fields');
      }

      if (!formData.instructions) {
        throw new Error('Instructions are required for reward redemption');
      }

      // Validate dates for non-permanent availability
      if (formData.availability_type !== 'permanent') {
        if (!formData.available_start || !formData.available_end) {
          throw new Error('Start and end dates are required for limited time rewards');
        }
        if (new Date(formData.available_start) >= new Date(formData.available_end)) {
          throw new Error('Start date must be before end date');
        }
      }

      const payload = {
        club_id: formData.club_id,
        title: formData.title,
        description: formData.description,
        tier: formData.tier,
        reward_type: formData.reward_type,
        artist_cost_estimate_cents: formData.artist_cost_estimate_cents,
        total_inventory: formData.total_inventory,
        max_free_allocation: formData.max_free_allocation,
        safety_factor: formData.safety_factor,
        availability_type: formData.availability_type,
        available_start: formData.availability_type !== 'permanent' ? formData.available_start : null,
        available_end: formData.availability_type !== 'permanent' ? formData.available_end : null,
        inventory_limit: formData.inventory_limit ? parseInt(formData.inventory_limit) : formData.total_inventory,
        rolling_window_days: formData.rolling_window_days,
        
        // Campaign fields
        is_campaign_tier: formData.is_campaign_tier,
        campaign_id: formData.is_campaign_tier && formData.campaign_mode === 'existing' ? formData.existing_campaign_id : null,
        campaign_title: formData.is_campaign_tier ? formData.campaign_title : null,
        campaign_funding_goal_cents: formData.is_campaign_tier ? formData.campaign_funding_goal_cents : 0,
        campaign_deadline: formData.is_campaign_tier && formData.campaign_deadline ? formData.campaign_deadline : null,
        campaign_status: formData.is_campaign_tier ? 'campaign_active' : 'single_reward',
        resident_discount_percentage: formData.resident_discount_percentage,
        headliner_discount_percentage: formData.headliner_discount_percentage,
        superfan_discount_percentage: formData.superfan_discount_percentage,
        
        metadata: {
          instructions: formData.instructions,
          redemption_url: formData.redemption_url || undefined,
          details: formData.details || undefined,
          estimated_shipping: formData.estimated_shipping || undefined,
          location: formData.location || undefined,
          requirements: formData.requirements || undefined,
        }
      };

      const response = await fetch('/api/admin/tier-rewards', {
        method: editingReward ? 'PUT' : 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(editingReward ? { ...payload, id: editingReward.id } : payload),
      });

      if (response.ok) {
        await loadRewards();
        onStatsUpdate?.();
        resetForm();
        setIsCreateModalOpen(false); // Close the modal
        toast({
          title: "Success!",
          description: `Tier reward ${editingReward ? 'updated' : 'created'} successfully`,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save tier reward');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save tier reward",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      club_id: '',
      title: '',
      description: '',
      tier: 'cadet',
      reward_type: 'access',
      artist_cost_estimate_cents: 0,
      total_inventory: 100,
      max_free_allocation: 0,
      safety_factor: 1.25,
      availability_type: 'permanent',
      available_start: '',
      available_end: '',
      inventory_limit: '',
      rolling_window_days: 60,
      instructions: '',
      redemption_url: '',
      details: '',
      estimated_shipping: '',
      location: '',
      requirements: '',
      
      // Reset campaign fields
      is_campaign_tier: false,
      campaign_mode: 'new',
      existing_campaign_id: '',
      campaign_title: '',
      campaign_funding_goal_cents: 0,
      campaign_deadline: '',
      resident_discount_percentage: 10.0,
      headliner_discount_percentage: 15.0,
      superfan_discount_percentage: 25.0
    });
    setEditingReward(null);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const handleEdit = (reward: TierReward) => {
    setEditingReward(reward);
    setFormData({
      club_id: reward.club_id,
      title: reward.title,
      description: reward.description,
      tier: reward.tier,
      reward_type: reward.reward_type,
      artist_cost_estimate_cents: reward.artist_cost_estimate_cents,
      total_inventory: reward.total_inventory || 100,
      max_free_allocation: reward.max_free_allocation || 0,
      safety_factor: reward.safety_factor,
      availability_type: reward.availability_type,
      available_start: reward.available_start || '',
      available_end: reward.available_end || '',
      inventory_limit: reward.inventory_limit?.toString() || '',
      rolling_window_days: reward.rolling_window_days,
      instructions: reward.metadata.instructions,
      redemption_url: reward.metadata.redemption_url || '',
      details: reward.metadata.details || '',
      estimated_shipping: reward.metadata.estimated_shipping || '',
      location: reward.metadata.location || '',
      requirements: reward.metadata.requirements || ''
    });
  };

  const handleToggleActive = async (reward: TierReward) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/admin/tier-rewards/${reward.id}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        await loadRewards();
        onStatsUpdate?.();
        toast({
          title: "Reward Updated",
          description: `${reward.title} has been ${reward.is_active ? 'deactivated' : 'activated'}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reward",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (reward: TierReward) => {
    if (!confirm(`Are you sure you want to delete "${reward.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`/api/admin/tier-rewards/${reward.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        await loadRewards();
        onStatsUpdate?.();
        toast({
          title: "Reward Deleted",
          description: `${reward.title} has been deleted successfully`,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete reward');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete reward",
        variant: "destructive",
      });
    }
  };

  const getRewardTypeInfo = (type: string) => {
    return REWARD_TYPES.find(t => t.value === type) || REWARD_TYPES[0];
  };

  const getTierInfo = (tier: string) => {
    return TIER_LEVELS.find(t => t.value === tier) || TIER_LEVELS[0];
  };

  const formatCurrencyOrFree = (cents: number | null) => {
    if (!cents) return 'Free';
    return formatCurrency(cents);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'available': return 'default';
      case 'upcoming': return 'secondary';
      case 'expired': return 'destructive';
      case 'out_of_season': return 'outline';
      default: return 'secondary';
    }
  };

  const getInventoryBadgeVariant = (status: string) => {
    switch (status) {
      case 'unlimited': return 'secondary';
      case 'available': return 'default';
      case 'low_stock': return 'destructive';
      case 'sold_out': return 'destructive';
      default: return 'secondary';
    }
  };

  // PricingPreview component for real-time impact analysis
  const PricingPreview = ({ clubId, tier, artistCostCents, totalInventory, maxFreeAllocation, safetyFactor }: {
    clubId: string;
    tier: string;
    artistCostCents: number;
    totalInventory: number;
    maxFreeAllocation: number;
    safetyFactor: number;
  }) => {
    const [previewData, setPreviewData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
      const fetchPreview = async () => {
        setIsLoading(true);
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) return;

          const response = await fetch('/api/admin/tier-rewards/preview-pricing', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              club_id: clubId,
              tier: tier,
              artist_cost_estimate_cents: artistCostCents,
              total_inventory: totalInventory,
              max_free_allocation: maxFreeAllocation,
              safety_factor: safetyFactor
            })
          });

          if (response.ok) {
            const data = await response.json();
            setPreviewData(data);
          }
        } catch (error) {
          console.error('Error fetching pricing preview:', error);
        } finally {
          setIsLoading(false);
        }
      };

      const timeoutId = setTimeout(fetchPreview, 500); // Debounce
      return () => clearTimeout(timeoutId);
    }, [clubId, tier, artistCostCents, totalInventory, maxFreeAllocation, safetyFactor]);

    if (isLoading) {
      return (
        <div className="p-4 bg-muted rounded-lg">
          <div className="animate-pulse">
            <div className="h-4 bg-muted-foreground/20 rounded w-1/3 mb-2"></div>
            <div className="h-6 bg-muted-foreground/20 rounded w-1/2"></div>
          </div>
        </div>
      );
    }

    if (!previewData) return null;

    const { allocation_plan, financial_analysis, insights } = previewData;

    return (
      <div className="space-y-4">
        {/* Existing Tier Holders Info */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-900">Existing {tier.charAt(0).toUpperCase() + tier.slice(1)}s</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {previewData.existing_tier_holders} fans
          </p>
          <p className="text-xs text-blue-700">
            Currently qualify for this tier in this club
          </p>
        </div>

        {/* Allocation Plan */}
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-purple-600" />
            <span className="font-medium text-purple-900">Allocation Plan</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-purple-600 font-medium">{allocation_plan.calculated_free_allocation}</div>
              <div className="text-xs text-purple-700">Free units</div>
            </div>
            <div>
              <div className="text-purple-600 font-medium">{allocation_plan.expected_paid_purchases}</div>
              <div className="text-xs text-purple-700">Paid units</div>
            </div>
            <div>
              <div className="text-purple-600 font-medium">{allocation_plan.free_allocation_percentage}%</div>
              <div className="text-xs text-purple-700">Free allocation</div>
            </div>
          </div>
        </div>

        {/* Financial Analysis */}
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-900">Profitability Analysis</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-700">Upgrade Price:</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrencyOrFree(financial_analysis.upgrade_price_cents)}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-green-600 font-medium">
                  {formatCurrencyOrFree(financial_analysis.total_potential_revenue_cents)}
                </div>
                <div className="text-green-700">Total Revenue</div>
              </div>
              <div>
                <div className="text-green-600 font-medium">
                  {formatCurrencyOrFree(financial_analysis.total_cogs_cents)}
                </div>
                <div className="text-green-700">Total COGS</div>
              </div>
            </div>
            
            <div className="pt-2 border-t border-green-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-700">Profit:</span>
                <span className={`text-lg font-bold ${
                  financial_analysis.is_profitable ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrencyOrFree(financial_analysis.profit_margin_cents)}
                  <span className="text-xs ml-1">
                    ({financial_analysis.profit_margin_percentage}%)
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map((insight: any, index: number) => (
              <div
                key={index}
                className={`p-3 rounded-lg text-sm ${
                  insight.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
                  insight.type === 'warning' ? 'bg-yellow-50 border border-yellow-200 text-yellow-700' :
                  insight.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
                  'bg-blue-50 border border-blue-200 text-blue-700'
                }`}
              >
                {insight.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
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
          <h2 className="text-2xl font-bold mb-2">Tier Rewards Management</h2>
          <p className="text-muted-foreground">
            Create and manage tier-based rewards that members can unlock or purchase
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleToggleAnalytics}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreateModal}>
                <Plus className="h-4 w-4 mr-2" />
                Create Reward
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingReward ? 'Edit Tier Reward' : 'Create New Tier Reward'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="pricing">Pricing</TabsTrigger>
                    <TabsTrigger value="campaign">Campaign</TabsTrigger>
                    <TabsTrigger value="availability">Availability</TabsTrigger>
                    <TabsTrigger value="instructions">Instructions</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="club_id">Club *</Label>
                        <Select
                          value={formData.club_id}
                          onValueChange={(value) => setFormData({ ...formData, club_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a club" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeClubs.map((club) => (
                              <SelectItem key={club.id} value={club.id}>
                                {club.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="tier">Required Tier *</Label>
                        <Select
                          value={formData.tier}
                          onValueChange={(value) => setFormData({ ...formData, tier: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select tier" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIER_LEVELS.map((tier) => (
                              <SelectItem key={tier.value} value={tier.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${tier.color}`} />
                                  {tier.label} ({tier.points} points)
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="reward_type">Reward Type *</Label>
                      <Select
                        value={formData.reward_type}
                        onValueChange={(value) => setFormData({ ...formData, reward_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select reward type" />
                        </SelectTrigger>
                        <SelectContent>
                          {REWARD_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <type.icon className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">{type.label}</div>
                                  <div className="text-xs text-muted-foreground">{type.description}</div>
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g., Limited Edition Vinyl"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Describe the reward..."
                        rows={3}
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="pricing" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="artist_cost_estimate_cents">
                          Cost Per Unit (USD)
                          <span className="text-xs text-muted-foreground ml-1">
                            (Set to $0 for free-only rewards)
                          </span>
                        </Label>
                        <Input
                          id="artist_cost_estimate_cents"
                          type="number"
                          min="0"
                          max="1000"
                          step="0.01"
                          value={formData.artist_cost_estimate_cents / 100}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            artist_cost_estimate_cents: Math.round(parseFloat(e.target.value || '0') * 100)
                          })}
                          placeholder="0.00"
                        />
                        <p className="text-xs text-muted-foreground">
                          Your cost per unit (manufacturing, shipping, etc.)
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="total_inventory">
                          Total Inventory
                          <span className="text-xs text-muted-foreground ml-1">
                            (Total units to produce)
                          </span>
                        </Label>
                        <Input
                          id="total_inventory"
                          type="number"
                          min="1"
                          max="10000"
                          value={formData.total_inventory}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            total_inventory: parseInt(e.target.value || '100')
                          })}
                          placeholder="100"
                        />
                        <p className="text-xs text-muted-foreground">
                          Total units you'll produce (free + paid)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="max_free_allocation">
                          Max Free for Existing Fans
                          <span className="text-xs text-muted-foreground ml-1">
                            (Reward loyal tier holders)
                          </span>
                        </Label>
                        <Input
                          id="max_free_allocation"
                          type="number"
                          min="0"
                          max={formData.total_inventory}
                          value={formData.max_free_allocation}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            max_free_allocation: parseInt(e.target.value || '0')
                          })}
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground">
                          Max free units for existing tier holders
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="safety_factor">
                          Safety Factor
                          <span className="text-xs text-muted-foreground ml-1">
                            (1.1 - 2.0)
                          </span>
                        </Label>
                        <Input
                          id="safety_factor"
                          type="number"
                          min="1.1"
                          max="2.0"
                          step="0.05"
                          value={formData.safety_factor}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            safety_factor: parseFloat(e.target.value || '1.25')
                          })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Profit margin multiplier
                        </p>
                      </div>
                    </div>

                    {/* Real-time Pricing Preview */}
                    {formData.club_id && formData.tier && formData.artist_cost_estimate_cents > 0 && formData.total_inventory > 0 && (
                      <PricingPreview
                        clubId={formData.club_id}
                        tier={formData.tier}
                        artistCostCents={formData.artist_cost_estimate_cents}
                        totalInventory={formData.total_inventory}
                        maxFreeAllocation={formData.max_free_allocation}
                        safetyFactor={formData.safety_factor}
                      />
                    )}
                  </TabsContent>
                  
                  <TabsContent value="availability" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="availability_type">Availability Type</Label>
                      <Select
                        value={formData.availability_type}
                        onValueChange={(value) => setFormData({ ...formData, availability_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select availability" />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABILITY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div>
                                <div className="font-medium">{type.label}</div>
                                <div className="text-xs text-muted-foreground">{type.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {formData.availability_type !== 'permanent' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="available_start">Start Date *</Label>
                          <Input
                            id="available_start"
                            type="datetime-local"
                            value={formData.available_start}
                            onChange={(e) => setFormData({ ...formData, available_start: e.target.value })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="available_end">End Date *</Label>
                          <Input
                            id="available_end"
                            type="datetime-local"
                            value={formData.available_end}
                            onChange={(e) => setFormData({ ...formData, available_end: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="inventory_limit">
                          Inventory Limit
                          <span className="text-xs text-muted-foreground ml-1">
                            (Leave empty for unlimited)
                          </span>
                        </Label>
                        <Input
                          id="inventory_limit"
                          type="number"
                          min="1"
                          value={formData.inventory_limit}
                          onChange={(e) => setFormData({ ...formData, inventory_limit: e.target.value })}
                          placeholder="Unlimited"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="rolling_window_days">Rolling Window (Days)</Label>
                        <Input
                          id="rolling_window_days"
                          type="number"
                          min="1"
                          max="365"
                          value={formData.rolling_window_days}
                          onChange={(e) => setFormData({ 
                            ...formData, 
                            rolling_window_days: parseInt(e.target.value || '60')
                          })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Days to look back for tier qualification
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="campaign" className="space-y-4">
                    <div className="space-y-4 border rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.is_campaign_tier}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, is_campaign_tier: checked })
                          }
                        />
                        <Label htmlFor="is_campaign_tier">Part of Campaign</Label>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        Campaign tiers allow fans to support collective funding goals with instant discounts for earned status holders.
                      </p>
                      
                      {formData.is_campaign_tier && (
                        <div className="space-y-4 pt-4 border-t">
                          {/* Campaign Mode Selection */}
                          <div className="space-y-3">
                            <Label>Campaign Setup</Label>
                            <div className="flex gap-4">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="campaign_mode"
                                  value="new"
                                  checked={formData.campaign_mode === 'new'}
                                  onChange={(e) => setFormData({ ...formData, campaign_mode: 'new', existing_campaign_id: '' })}
                                  className="text-primary"
                                />
                                <span>Create New Campaign</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="campaign_mode"
                                  value="existing"
                                  checked={formData.campaign_mode === 'existing'}
                                  onChange={(e) => setFormData({ ...formData, campaign_mode: 'existing' })}
                                  className="text-primary"
                                />
                                <span>Add to Existing Campaign</span>
                              </label>
                            </div>
                          </div>
                          
                          {formData.campaign_mode === 'existing' ? (
                            /* Select Existing Campaign */
                            <div className="space-y-2">
                              <Label htmlFor="existing_campaign">Select Campaign *</Label>
                              <Select
                                value={formData.existing_campaign_id}
                                onValueChange={(value) => {
                                  const campaign = existingCampaigns.find(c => c.campaign_id === value);
                                  setFormData({ 
                                    ...formData, 
                                    existing_campaign_id: value,
                                    campaign_title: campaign?.campaign_title || '',
                                    campaign_funding_goal_cents: campaign?.campaign_funding_goal_cents || 0,
                                    campaign_deadline: campaign?.campaign_deadline || ''
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose existing campaign" />
                                </SelectTrigger>
                                <SelectContent>
                                  {existingCampaigns.map((campaign) => (
                                    <SelectItem key={campaign.campaign_id} value={campaign.campaign_id}>
                                      <div>
                                        <div className="font-medium">{campaign.campaign_title}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {campaign.tier_count} tiers • Goal: ${(campaign.campaign_funding_goal_cents / 100).toFixed(0)}
                                        </div>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {existingCampaigns.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No existing campaigns found. Create a new campaign instead.
                                </p>
                              )}
                            </div>
                          ) : (
                            /* Create New Campaign */
                            <div className="space-y-2">
                              <Label htmlFor="campaign_title">Campaign Title *</Label>
                              <Input
                                id="campaign_title"
                                value={formData.campaign_title}
                                onChange={(e) => setFormData({ ...formData, campaign_title: e.target.value })}
                                placeholder="e.g., Spring 2024 Collection"
                                required={formData.is_campaign_tier && formData.campaign_mode === 'new'}
                              />
                              <p className="text-xs text-muted-foreground">
                                Name for the overall campaign that groups related tiers
                              </p>
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="campaign_funding_goal">Funding Goal (USD)</Label>
                              <Input
                                id="campaign_funding_goal"
                                type="number"
                                min="0"
                                step="1"
                                value={formData.campaign_funding_goal_cents / 100}
                                onChange={(e) => setFormData({ 
                                  ...formData, 
                                  campaign_funding_goal_cents: Math.round(parseFloat(e.target.value || '0') * 100)
                                })}
                                placeholder="1000"
                              />
                              <p className="text-xs text-muted-foreground">
                                Total funding target for the campaign
                              </p>
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="campaign_deadline">Campaign Deadline</Label>
                              <Input
                                id="campaign_deadline"
                                type="datetime-local"
                                value={formData.campaign_deadline}
                                onChange={(e) => setFormData({ ...formData, campaign_deadline: e.target.value })}
                              />
                              <p className="text-xs text-muted-foreground">
                                When the campaign ends (automatic refunds if goal not met)
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-4">
                            <Label>Tier Discount Percentages</Label>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="resident_discount">Resident Discount (%)</Label>
                                <Input
                                  id="resident_discount"
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.1"
                                  value={formData.resident_discount_percentage}
                                  onChange={(e) => setFormData({ 
                                    ...formData, 
                                    resident_discount_percentage: parseFloat(e.target.value || '10.0')
                                  })}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="headliner_discount">Headliner Discount (%)</Label>
                                <Input
                                  id="headliner_discount"
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.1"
                                  value={formData.headliner_discount_percentage}
                                  onChange={(e) => setFormData({ 
                                    ...formData, 
                                    headliner_discount_percentage: parseFloat(e.target.value || '15.0')
                                  })}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="superfan_discount">Superfan Discount (%)</Label>
                                <Input
                                  id="superfan_discount"
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.1"
                                  value={formData.superfan_discount_percentage}
                                  onChange={(e) => setFormData({ 
                                    ...formData, 
                                    superfan_discount_percentage: parseFloat(e.target.value || '25.0')
                                  })}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Instant discounts for earned tier holders. Higher tiers get bigger discounts.
                            </p>
                          </div>
                          
                          {/* Campaign preview */}
                          {formData.campaign_funding_goal_cents > 0 && formData.upgrade_price_cents > 0 && (
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                              <h4 className="font-medium text-blue-900 mb-2">Campaign Preview</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Resident pays:</span>
                                  <span className="font-medium text-blue-600">
                                    ${((formData.upgrade_price_cents * (100 - formData.resident_discount_percentage)) / 10000).toFixed(0)} 
                                    (${formData.resident_discount_percentage}% off)
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Headliner pays:</span>
                                  <span className="font-medium text-blue-600">
                                    ${((formData.upgrade_price_cents * (100 - formData.headliner_discount_percentage)) / 10000).toFixed(0)} 
                                    (${formData.headliner_discount_percentage}% off)
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-blue-700">Superfan pays:</span>
                                  <span className="font-medium text-blue-600">
                                    ${((formData.upgrade_price_cents * (100 - formData.superfan_discount_percentage)) / 10000).toFixed(0)} 
                                    (${formData.superfan_discount_percentage}% off)
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-blue-200 flex justify-between">
                                  <span className="text-blue-700 font-medium">Campaign gets:</span>
                                  <span className="font-bold text-blue-600">${(formData.upgrade_price_cents / 100).toFixed(0)} (full value)</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="instructions" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="instructions">Redemption Instructions *</Label>
                      <Textarea
                        id="instructions"
                        value={formData.instructions}
                        onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                        placeholder="e.g., Use this link to claim your vinyl with free shipping"
                        rows={3}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Instructions shown to users when they claim this reward
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="redemption_url">Redemption URL</Label>
                      <Input
                        id="redemption_url"
                        type="url"
                        value={formData.redemption_url}
                        onChange={(e) => setFormData({ ...formData, redemption_url: e.target.value })}
                        placeholder="https://your-shop.com/exclusive-item?access_code=..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Direct link to unlisted item, download, or booking form
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="details">Additional Details</Label>
                      <Textarea
                        id="details"
                        value={formData.details}
                        onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                        placeholder="e.g., 180g vinyl, gatefold sleeve, limited to 100 units"
                        rows={2}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          placeholder="e.g., Studio A, Nashville"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="estimated_shipping">Estimated Shipping</Label>
                        <Input
                          id="estimated_shipping"
                          value={formData.estimated_shipping}
                          onChange={(e) => setFormData({ ...formData, estimated_shipping: e.target.value })}
                          placeholder="e.g., 2-3 weeks"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="requirements">Requirements</Label>
                      <Input
                        id="requirements"
                        value={formData.requirements}
                        onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                        placeholder="e.g., Must be 18+, valid ID required"
                      />
                    </div>
                    
                  </TabsContent>
                </Tabs>
                
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setIsCreateModalOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        {editingReward ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      editingReward ? 'Update Reward' : 'Create Reward'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Analytics Section */}
      {showAnalytics && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4"
        >
          {analyticsLoading ? (
            <Card>
              <CardContent className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading analytics...</p>
              </CardContent>
            </Card>
          ) : analyticsData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Gift className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Total Rewards</span>
                    </div>
                    <div className="text-2xl font-bold">{analyticsData.summary.total_rewards}</div>
                    <div className="text-xs text-muted-foreground">
                      {analyticsData.summary.active_rewards} active
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Total Claims</span>
                    </div>
                    <div className="text-2xl font-bold">{analyticsData.summary.total_claims}</div>
                    <div className="text-xs text-muted-foreground">
                      All time claims
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Upgrade Revenue</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrencyOrFree(analyticsData.summary.total_upgrade_revenue_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      From paid upgrades
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium">Conversion Rate</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {(analyticsData.summary.average_upgrade_conversion_rate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Upgrade purchase rate
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* By Tier Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    Performance by Tier
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData.by_tier.map((tierData: any) => {
                      const tierInfo = getTierInfo(tierData.tier);
                      return (
                        <div key={tierData.tier} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${tierInfo.color}`} />
                            <div>
                              <div className="font-medium">{tierInfo.label}</div>
                              <div className="text-sm text-muted-foreground">
                                {tierData.reward_count} rewards
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{tierData.total_claims} claims</div>
                            <div className="text-sm text-green-600">
                              {formatCurrencyOrFree(tierData.upgrade_revenue_cents)} revenue
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* By Reward Type Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Performance by Reward Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData.by_reward_type.map((typeData: any) => {
                      const typeInfo = getRewardTypeInfo(typeData.reward_type);
                      return (
                        <div key={typeData.reward_type} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <typeInfo.icon className="h-4 w-4 text-primary" />
                            <div>
                              <div className="font-medium">{typeInfo.label}</div>
                              <div className="text-sm text-muted-foreground">
                                {typeData.reward_count} rewards
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">{typeData.total_claims} claims</div>
                            <div className="text-sm text-green-600">
                              {formatCurrencyOrFree(typeData.upgrade_revenue_cents)} revenue
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No analytics data available</p>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Rewards List */}
      <div className="grid gap-4">
        {rewards.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No tier rewards yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first tier reward to start generating revenue from your community
              </p>
            </CardContent>
          </Card>
        ) : (
          rewards.map((reward) => {
            const tierInfo = getTierInfo(reward.tier);
            const typeInfo = getRewardTypeInfo(reward.reward_type);
            
            return (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={!reward.is_active ? "opacity-60" : ""}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <typeInfo.icon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg truncate">
                              {reward.title}
                            </h3>
                            <Badge
                              variant={reward.is_active ? "default" : "secondary"}
                            >
                              {reward.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${tierInfo.color}`} />
                              {tierInfo.label}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {typeInfo.label}
                            </Badge>
                            <span>{reward.club_name}</span>
                          </div>
                          
                          {reward.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {reward.description}
                            </p>
                          )}
                          
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              <span className="font-medium">
                                {formatCurrencyOrFree(reward.upgrade_price_cents)}
                              </span>
                            </div>
                            
                            {reward.inventory_limit && (
                              <div className="flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                <span>
                                  {reward.inventory_claimed} / {reward.inventory_limit}
                                </span>
                              </div>
                            )}
                            
                            {reward.total_claims !== undefined && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{reward.total_claims} claims</span>
                              </div>
                            )}
                            
                            {reward.total_upgrade_revenue_cents && reward.total_upgrade_revenue_cents > 0 && (
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-green-600" />
                                <span className="text-green-600 font-medium">
                                  {formatCurrencyOrFree(reward.total_upgrade_revenue_cents)} revenue
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {(reward.current_status || reward.inventory_status) && (
                            <div className="flex items-center gap-2 mt-2">
                              {reward.current_status && (
                                <Badge variant={getStatusBadgeVariant(reward.current_status)} className="text-xs">
                                  {reward.current_status.replace('_', ' ')}
                                </Badge>
                              )}
                              {reward.inventory_status && reward.inventory_status !== 'unlimited' && (
                                <Badge variant={getInventoryBadgeVariant(reward.inventory_status)} className="text-xs">
                                  {reward.inventory_status.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(reward)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(reward)}
                        >
                          {reward.is_active ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(reward)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
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
