"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Gift, 
  Lock, 
  Check, 
  Crown, 
  Star, 
  Calendar,
  MapPin,
  Users,
  Ticket,
  Music,
  ShoppingBag,
  Award,
  Globe,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { STATUS_COLORS, STATUS_ICONS } from "@/types/club.types";
import confetti from "canvas-confetti";

interface Unlock {
  id: string;
  club_id: string;
  title: string;
  description: string;
  unlock_type: string;
  required_status: string;
  is_active: boolean;
  metadata?: {
    redemption_instructions?: string;
    expiry_date?: string;
    location?: string;
    capacity?: number;
  };
}

interface UnlockRedemptionProps {
  clubId: string;
  userStatus: string;
  userPoints: number;
  onRedemption?: () => void;
}

const UNLOCK_TYPE_ICONS: Record<string, any> = {
  presale_access: Ticket,
  line_skip: Users,
  backstage_pass: Star,
  studio_visit: Music,
  vinyl_lottery: Award,
  merch_discount: ShoppingBag,
  meet_greet: Crown,
  exclusive_content: Globe,
};

const STATUS_POINTS: Record<string, number> = {
  cadet: 0,
  resident: 500,
  headliner: 1500,
  superfan: 4000,
};

export default function UnlockRedemption({ 
  clubId, 
  userStatus, 
  userPoints, 
  onRedemption 
}: UnlockRedemptionProps) {
  const { toast } = useToast();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUnlock, setSelectedUnlock] = useState<Unlock | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    loadUnlocks();
  }, [clubId]);

  const loadUnlocks = async () => {
    try {
      const response = await fetch(`/api/unlocks?club_id=${clubId}`);
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

  const isUnlockAvailable = (unlock: Unlock) => {
    const requiredPoints = STATUS_POINTS[unlock.required_status] || 0;
    return userPoints >= requiredPoints;
  };

  const getStatusProgress = (requiredStatus: string) => {
    const requiredPoints = STATUS_POINTS[requiredStatus] || 0;
    const progress = Math.min((userPoints / requiredPoints) * 100, 100);
    return progress;
  };

  const handleRedeem = async (unlock: Unlock) => {
    if (!isUnlockAvailable(unlock)) {
      toast({
        title: "Unlock Not Available",
        description: `You need ${unlock.required_status} status to access this perk`,
        variant: "destructive",
      });
      return;
    }

    setIsRedeeming(true);

    try {
      const response = await fetch('/api/unlocks/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unlock_id: unlock.id,
          club_id: clubId
        }),
      });

      if (response.ok) {
        // Trigger celebration
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FFA500', '#FF69B4', '#9370DB'],
        });

        toast({
          title: "Unlock Redeemed! 🎉",
          description: unlock.title,
        });

        setSelectedUnlock(null);
        onRedemption?.();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to redeem unlock');
      }
    } catch (error) {
      toast({
        title: "Redemption Failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const getUnlockIcon = (type: string) => {
    const IconComponent = UNLOCK_TYPE_ICONS[type] || Gift;
    return IconComponent;
  };

  const getStatusIcon = (status: string) => {
    const IconComponent = STATUS_ICONS[status as keyof typeof STATUS_ICONS] || Users;
    return IconComponent;
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "text-gray-400";
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-muted rounded w-3/4 mb-4"></div>
              <div className="h-8 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (unlocks.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Unlocks Available</h3>
          <p className="text-muted-foreground">
            This club doesn't have any unlocks configured yet. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {unlocks.map((unlock, index) => {
          const IconComponent = getUnlockIcon(unlock.unlock_type);
          const StatusIconComponent = getStatusIcon(unlock.required_status);
          const isAvailable = isUnlockAvailable(unlock);
          const progress = getStatusProgress(unlock.required_status);

          return (
            <motion.div
              key={unlock.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  isAvailable ? 'border-primary/50 hover:border-primary' : 'opacity-75'
                }`}
                onClick={() => setSelectedUnlock(unlock)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <IconComponent className={`h-6 w-6 ${isAvailable ? 'text-primary' : 'text-muted-foreground'}`} />
                    {isAvailable ? (
                      <Badge variant="default">Available</Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Locked
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base">{unlock.title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-4">
                    {unlock.description}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <StatusIconComponent className={`h-3 w-3 ${getStatusColor(unlock.required_status)}`} />
                        Requires {unlock.required_status}
                      </span>
                      <span className="text-muted-foreground">
                        {STATUS_POINTS[unlock.required_status]}+ pts
                      </span>
                    </div>
                    
                    {!isAvailable && (
                      <div className="space-y-1">
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                          {userPoints} / {STATUS_POINTS[unlock.required_status]} points
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4">
                    <Button 
                      className="w-full" 
                      variant={isAvailable ? "default" : "secondary"}
                      disabled={!isAvailable}
                    >
                      {isAvailable ? 'Redeem' : 'Locked'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Redemption Modal */}
      <Dialog open={!!selectedUnlock} onOpenChange={() => setSelectedUnlock(null)}>
        {selectedUnlock && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(getUnlockIcon(selectedUnlock.unlock_type), { 
                  className: "h-5 w-5 text-primary" 
                })}
                {selectedUnlock.title}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {selectedUnlock.description}
              </p>
              
              {selectedUnlock.metadata?.redemption_instructions && (
                <div className="bg-muted p-3 rounded-lg">
                  <h4 className="font-medium mb-2">How to Redeem:</h4>
                  <p className="text-sm">
                    {selectedUnlock.metadata.redemption_instructions}
                  </p>
                </div>
              )}
              
              <div className="space-y-2 text-sm">
                {selectedUnlock.metadata?.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedUnlock.metadata.location}</span>
                  </div>
                )}
                
                {selectedUnlock.metadata?.expiry_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Valid until {new Date(selectedUnlock.metadata.expiry_date).toLocaleDateString()}</span>
                  </div>
                )}
                
                {selectedUnlock.metadata?.capacity && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Limited to {selectedUnlock.metadata.capacity} people</span>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedUnlock(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleRedeem(selectedUnlock)}
                  disabled={!isUnlockAvailable(selectedUnlock) || isRedeeming}
                >
                  {isRedeeming ? 'Redeeming...' : 'Redeem Now'}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
