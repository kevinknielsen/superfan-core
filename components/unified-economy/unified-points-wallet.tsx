"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  TrendingUp, 
  Shield, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users, 
  History,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface UnifiedPointsWalletProps {
  clubId: string;
  clubName: string;
  showPurchaseOptions?: boolean;
  showTransferOptions?: boolean;
  className?: string;
}

interface PointsBreakdown {
  wallet: {
    id: string;
    total_balance: number;
    earned_points: number;
    purchased_points: number;
    spent_points: number;
    escrowed_points: number;
    status_points: number;
  };
  status: {
    current: string;
    current_threshold: number;
    next_status: string | null;
    next_threshold: number | null;
    progress_to_next: number;
    points_to_next: number;
  };
  spending_power: {
    total_spendable: number;
    purchased_available: number;
    earned_available: number;
    earned_locked_for_status: number;
    escrowed: number;
  };
  recent_activity: any[];
}

const statusConfig = {
  cadet: { color: 'bg-gray-500', label: 'Cadet', icon: '🌟' },
  resident: { color: 'bg-blue-500', label: 'Resident', icon: '🏠' },
  headliner: { color: 'bg-purple-500', label: 'Headliner', icon: '🎤' },
  superfan: { color: 'bg-gold-500', label: 'Superfan', icon: '👑' }
};

export default function UnifiedPointsWallet({ 
  clubId, 
  clubName, 
  showPurchaseOptions = false,
  showTransferOptions = false,
  className = ""
}: UnifiedPointsWalletProps) {
  const [breakdown, setBreakdown] = useState<PointsBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const { toast } = useToast();

  // Fetch points breakdown
  const fetchBreakdown = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/points/breakdown?clubId=${clubId}`);
      if (response.ok) {
        const data = await response.json();
        setBreakdown(data);
      } else {
        throw new Error('Failed to fetch points breakdown');
      }
    } catch (error) {
      console.error('Error fetching points breakdown:', error);
      toast({
        title: "Error",
        description: "Failed to load points breakdown",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load breakdown on mount
  React.useEffect(() => {
    fetchBreakdown();
  }, [clubId]);

  if (loading || !breakdown) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { wallet, status, spending_power } = breakdown;
  const statusInfo = statusConfig[status.current as keyof typeof statusConfig];

  return (
    <Card className={`${className} overflow-hidden`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5" />
            Points Wallet
          </CardTitle>
          <Badge variant="secondary" className={`${statusInfo.color} text-white`}>
            {statusInfo.icon} {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Balance Display */}
        <div className="text-center space-y-2">
          <div className="text-3xl font-bold text-foreground">
            {wallet.total_balance.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground">Total Points</div>
          
          {/* Quick breakdown */}
          <div className="flex justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {wallet.earned_points.toLocaleString()} earned
            </span>
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              {wallet.purchased_points.toLocaleString()} purchased
            </span>
          </div>
        </div>

        {/* Status Progress */}
        {status.next_status && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress to {statusConfig[status.next_status as keyof typeof statusConfig]?.label}</span>
              <span>{status.points_to_next} points needed</span>
            </div>
            <Progress value={status.progress_to_next} className="h-2" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {showPurchaseOptions && (
            <Button variant="default" className="w-full">
              <ArrowDownRight className="h-4 w-4 mr-2" />
              Buy Points
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={() => setShowSpendModal(true)}
            disabled={wallet.total_balance === 0}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Spend Points
          </Button>

          {showTransferOptions && (
            <Button 
              variant="outline" 
              onClick={() => setShowTransferModal(true)}
              disabled={spending_power.purchased_available === 0}
            >
              <Users className="h-4 w-4 mr-2" />
              Transfer
            </Button>
          )}

          <Button 
            variant="ghost" 
            onClick={() => setShowDetails(!showDetails)}
          >
            <Info className="h-4 w-4 mr-2" />
            Details
            {showDetails ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
        </div>

        {/* Detailed Breakdown */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <Separator />
              
              {/* Spending Power Breakdown */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Spending Power
                </h4>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available to spend:</span>
                      <span className="font-medium">{spending_power.total_spendable.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">• Purchased:</span>
                      <span className="text-green-600">{spending_power.purchased_available.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">• Earned (flexible):</span>
                      <span className="text-blue-600">{spending_power.earned_available.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protected for status:</span>
                      <span className="font-medium">{spending_power.earned_locked_for_status.toLocaleString()}</span>
                    </div>
                    {spending_power.escrowed > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Escrowed:</span>
                        <span className="text-orange-600">{spending_power.escrowed.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Transaction History Preview */}
              {breakdown.recent_activity.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Activity
                  </h4>
                  
                  <div className="space-y-2">
                    {breakdown.recent_activity.slice(0, 3).map((tx, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                          {tx.source === 'earned' ? '🎯 Earned' :
                           tx.source === 'purchased' ? '💳 Purchased' :
                           tx.source === 'spent' ? '🛒 Spent' :
                           tx.source === 'transferred' ? '👥 Transfer' : '📝 Transaction'}
                        </span>
                        <span className={`font-medium ${
                          tx.type === 'PURCHASE' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.type === 'PURCHASE' ? '+' : '-'}{tx.pts.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {/* Spend Points Modal */}
      {showSpendModal && (
        <SpendPointsModal
          clubId={clubId}
          clubName={clubName}
          availablePoints={spending_power.total_spendable}
          statusProtectedPoints={spending_power.earned_locked_for_status}
          onClose={() => setShowSpendModal(false)}
          onSuccess={fetchBreakdown}
        />
      )}

      {/* Transfer Points Modal */}
      {showTransferModal && (
        <TransferPointsModal
          clubId={clubId}
          clubName={clubName}
          availablePoints={spending_power.purchased_available}
          onClose={() => setShowTransferModal(false)}
          onSuccess={fetchBreakdown}
        />
      )}
    </Card>
  );
}

// Placeholder components for modals (to be implemented next)
function SpendPointsModal({ onClose, onSuccess, ...props }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Spend Points</h3>
        <p className="text-muted-foreground mb-4">Spending modal coming soon...</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function TransferPointsModal({ onClose, onSuccess, ...props }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Transfer Points</h3>
        <p className="text-muted-foreground mb-4">Transfer modal coming soon...</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
