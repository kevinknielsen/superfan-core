'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Gift, 
  Lock, 
  Clock, 
  Package, 
  Ticket, 
  CheckCircle,
  Loader2,
  ExternalLink,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useClubRewards, useRedeemReward } from '@/legacy/hooks/use-points';
import { formatPoints } from '@/lib/points';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RewardsDisplayProps {
  clubId: string;
  userBalance: number;
  compact?: boolean;
  maxItems?: number;
  className?: string;
}

export default function RewardsDisplay({
  clubId,
  userBalance,
  compact = false,
  maxItems = 6,
  className
}: RewardsDisplayProps) {
  const { toast } = useToast();
  const [selectedReward, setSelectedReward] = useState<string | null>(null);
  
  const { data: rewardsData, isLoading } = useClubRewards(clubId);
  const redeemMutation = useRedeemReward();

  const handleRedeem = (rewardId: string) => {
    setSelectedReward(rewardId);
    redeemMutation.mutate(rewardId, {
      onSuccess: (data) => {
        toast({
          title: "Reward Redeemed! 🎉",
          description: data.message,
          variant: "default",
        });
      },
      onError: (error) => {
        toast({
          title: "Redemption Failed",
          description: error.message,
          variant: "destructive",
        });
      },
      onSettled: () => {
        setSelectedReward(null);
      }
    });
  };

  const getRewardIcon = (kind: string) => {
    switch (kind) {
      case 'ACCESS':
        return <ExternalLink className="h-4 w-4" />;
      case 'PRESALE_LOCK':
        return <Ticket className="h-4 w-4" />;
      case 'VARIANT':
        return <Package className="h-4 w-4" />;
      default:
        return <Gift className="h-4 w-4" />;
    }
  };

  const getRewardTypeLabel = (kind: string) => {
    switch (kind) {
      case 'ACCESS':
        return 'Access';
      case 'PRESALE_LOCK':
        return 'Presale';
      case 'VARIANT':
        return 'Physical';
      default:
        return 'Reward';
    }
  };

  const getAvailabilityStatus = (reward: any) => {
    if (!reward.available) {
      return {
        status: 'unavailable',
        text: reward.availability_reason,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        canRedeem: false,
      };
    }
    
    if (userBalance < reward.points_price) {
      return {
        status: 'insufficient',
        text: `Need ${formatPoints(reward.points_price - userBalance)} more`,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        canRedeem: false,
      };
    }

    return {
      status: 'available',
      text: 'Available',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      canRedeem: true,
    };
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!rewardsData || rewardsData.rewards.length === 0) {
    return (
      <div className={cn("text-center p-4", className)}>
        <Gift className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600">No rewards available yet</p>
      </div>
    );
  }

  const rewards = rewardsData.rewards.slice(0, maxItems);

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        {rewards.map((reward) => {
          const availabilityStatus = getAvailabilityStatus(reward);
          const isLoading = redeemMutation.isPending && selectedReward === reward.id;
          
          return (
            <div
              key={reward.id}
              className="flex items-center justify-between p-2 rounded-lg border bg-white"
            >
              <div className="flex items-center gap-2 flex-1">
                {getRewardIcon(reward.kind)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {reward.title}
                  </div>
                  <div className="text-xs text-gray-600">
                    {formatPoints(reward.points_price)} points
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getRewardTypeLabel(reward.kind)}
                </Badge>
                
                {availabilityStatus.canRedeem && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRedeem(reward.id)}
                    disabled={isLoading}
                    className="h-6 px-2 text-xs"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Gift className="h-4 w-4 text-purple-600" />
          Available Rewards
        </h3>
        <Badge variant="secondary">
          {rewardsData.available_count} available
        </Badge>
      </div>

      <div className="grid gap-3">
        {rewards.map((reward) => {
          const availabilityStatus = getAvailabilityStatus(reward);
          const isLoading = redeemMutation.isPending && selectedReward === reward.id;
          
          return (
            <Card key={reward.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getRewardIcon(reward.kind)}
                    <Badge variant="outline" className="text-xs">
                      {getRewardTypeLabel(reward.kind)}
                    </Badge>
                  </div>
                  {reward.inventory !== null && (
                    <Badge variant="secondary" className="text-xs">
                      {reward.inventory} left
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base">{reward.title}</CardTitle>
                {reward.description && (
                  <p className="text-sm text-gray-600">{reward.description}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Price and Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {formatPoints(reward.points_price)} Points
                    </span>
                    <span className="text-xs text-gray-600">
                      {Math.min(100, (userBalance / reward.points_price) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(100, (userBalance / reward.points_price) * 100)} 
                    className="h-1"
                  />
                </div>

                {/* Time Window */}
                {reward.is_timed && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Clock className="h-3 w-3" />
                    {reward.window_start && (
                      <span>
                        Starts: {new Date(reward.window_start).toLocaleDateString()}
                      </span>
                    )}
                    {reward.window_end && (
                      <span>
                        Ends: {new Date(reward.window_end).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Status */}
                <div className={cn("p-2 rounded text-xs font-medium", availabilityStatus.bgColor)}>
                  <div className={cn("flex items-center gap-1", availabilityStatus.color)}>
                    {availabilityStatus.canRedeem ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                    {availabilityStatus.text}
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleRedeem(reward.id)}
                  disabled={!availabilityStatus.canRedeem || isLoading}
                  className="w-full"
                  size="sm"
                  variant={availabilityStatus.canRedeem ? "default" : "secondary"}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Redeeming...
                    </>
                  ) : availabilityStatus.canRedeem ? (
                    <>
                      <Gift className="h-3 w-3 mr-1" />
                      Redeem Now
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3 mr-1" />
                      {availabilityStatus.status === 'insufficient' ? 'Need More Points' : 'Unavailable'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
