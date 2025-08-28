'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Coins, 
  CreditCard, 
  Gift, 
  Loader2, 
  Plus, 
  ShoppingCart,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useClubPointWallet, useClubPurchaseBundles, usePurchasePoints } from '@/hooks/use-points';
import { formatPoints, formatCurrency } from '@/lib/points';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PointsWalletWidgetProps {
  clubId: string;
  clubName: string;
  compact?: boolean;
  className?: string;
  showPurchaseOptions?: boolean;
}

export default function PointsWalletWidget({
  clubId,
  clubName,
  compact = false,
  className,
  showPurchaseOptions = false
}: PointsWalletWidgetProps) {
  const { toast } = useToast();
  const [showPurchase, setShowPurchase] = useState(showPurchaseOptions);
  
  const { data: wallet, isLoading } = useClubPointWallet(clubId);
  const bundles = useClubPurchaseBundles(clubId);
  const purchaseMutation = usePurchasePoints();
  
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);

  const handlePurchase = (bundleId: string) => {
    setSelectedBundle(bundleId);
    purchaseMutation.mutate(
      { communityId: clubId, bundleId },
      {
        onError: (error) => {
          toast({
            title: "Purchase Failed",
            description: error.message,
            variant: "destructive",
          });
          setSelectedBundle(null);
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const balance = wallet?.balance_pts || 0;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1 text-sm">
          <Coins className="h-4 w-4 text-yellow-500" />
          <span className="font-medium text-yellow-500">
            {formatPoints(balance)}
          </span>
        </div>
        {balance === 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPurchase(true)}
            className="h-6 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Buy
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Coins className="h-4 w-4 text-yellow-600" />
            {clubName} Points
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current Balance */}
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {formatPoints(balance)}
            </div>
            <div className="text-xs text-gray-600">Available Points</div>
          </div>

          {/* Recent Transaction */}
          {wallet?.recent_transactions && wallet.recent_transactions.length > 0 && (
            <div className="text-xs text-gray-600">
              Last activity: {new Date(wallet.recent_transactions[0].created_at).toLocaleDateString()}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPurchase(!showPurchase)}
              className="flex-1"
            >
              <CreditCard className="h-3 w-3 mr-1" />
              {showPurchase ? 'Hide' : 'Buy Points'}
            </Button>
            {balance > 0 && (
              <Button
                size="sm"
                variant="default"
                className="flex-1 bg-gradient-to-r from-purple-500 to-blue-500"
                onClick={() => {
                  // This could open a rewards modal or navigate to rewards
                  toast({
                    title: "Rewards",
                    description: "View available rewards in the club details",
                  });
                }}
              >
                <Gift className="h-3 w-3 mr-1" />
                Rewards
              </Button>
            )}
          </div>

          {/* Purchase Options */}
          <AnimatePresence>
            {showPurchase && bundles.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden space-y-2"
              >
                <div className="text-xs font-medium text-gray-700 mb-2">
                  Quick Purchase:
                </div>
                {bundles.map((bundle, index) => {
                  const bundleId = bundle.points.toString();
                  const isPopular = index === 1;
                  const isLoading = purchaseMutation.isPending && selectedBundle === bundleId;
                  
                  return (
                    <div
                      key={bundleId}
                      className={cn(
                        "relative flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all",
                        isPopular 
                          ? "border-purple-300 bg-purple-50 ring-1 ring-purple-200" 
                          : "border-gray-200 bg-white hover:border-gray-300"
                      )}
                      onClick={() => handlePurchase(bundleId)}
                    >
                      {isPopular && (
                        <Badge className="absolute -top-1 -right-1 text-xs bg-purple-500">
                          Popular
                        </Badge>
                      )}
                      
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {formatPoints(bundle.points)}
                          {bundle.bonus_pts && (
                            <span className="text-green-600 text-xs ml-1">
                              +{formatPoints(bundle.bonus_pts)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatCurrency(bundle.usd_cents)}
                        </div>
                      </div>
                      
                      <div className="flex items-center">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
