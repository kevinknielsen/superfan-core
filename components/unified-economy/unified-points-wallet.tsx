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

import { useUnifiedPoints, useStatusInfo, type PointsBreakdown } from '@/hooks/unified-economy/use-unified-points';
import { getAccessToken } from '@privy-io/react-auth';
import SpendPointsModal from './spend-points-modal';

interface UnifiedPointsWalletProps {
  clubId: string;
  clubName: string;
  showPurchaseOptions?: boolean;
  showTransferOptions?: boolean;
  className?: string;
}





export default function UnifiedPointsWallet({ 
  clubId, 
  clubName, 
  showPurchaseOptions = false,
  showTransferOptions = false,
  className = ""
}: UnifiedPointsWalletProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Use the hook instead of manual fetch
  const { 
    breakdown, 
    isLoading, 
    error,
    refetch,
    spendPoints,
    transferPoints,
    isSpending,
    isTransferring,
    canSpend,
    formatPoints,
    totalBalance,
    currentStatus
  } = useUnifiedPoints(clubId);

  const { getStatusInfo } = useStatusInfo();

  // Handle buy points flow
  const handleBuyPoints = async () => {
    try {
      console.log('Starting buy points flow for club:', clubId);
      
      // For now, redirect to 1000 point bundle (smallest option)
      const response = await fetch('/api/points/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAccessToken() || ''}`,
        },
        body: JSON.stringify({
          communityId: clubId,
          bundleId: '1000' // Default to 1000 point bundle
        }),
      });

      console.log('Purchase API response status:', response.status);

      if (response.ok) {
        const data = await response.json() as { url: string };
        const { url } = data;
        // Redirect to Stripe checkout
        window.location.href = url;
      } else {
        const error = await response.json().catch(() => ({})) as any;
        console.error('Purchase API error:', error, 'Status:', response.status);
        throw new Error(error.error || `HTTP ${response.status}: Failed to create checkout session`);
      }
    } catch (error) {
      console.error('Buy points error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to start purchase'}`);
    }
  };

  if (isLoading) {
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

  // Fallback if unified system is not ready yet
  if (!breakdown) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-6 text-center">
          <div className="space-y-3">
            <Wallet className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-medium">Unified Points System</h3>
              <p className="text-sm text-muted-foreground">
                Coming soon! Enhanced points system with spending breakdown.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { wallet, status, spending_power } = breakdown;
  const statusInfo = getStatusInfo(status.current);

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
              <span>Progress to {status.next_status ? getStatusInfo(status.next_status).label : 'Max Status'}</span>
              <span>{status.points_to_next} points needed</span>
            </div>
            <Progress value={status.progress_to_next} className="h-2" />
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {showPurchaseOptions && (
            <Button 
              variant="default" 
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                handleBuyPoints();
              }}
            >
              <ArrowDownRight className="h-4 w-4 mr-2" />
              Buy Points
            </Button>
          )}
          
          <Button 
            variant="outline" 
            onClick={(e) => {
              e.stopPropagation();
              setShowSpendModal(true);
            }}
            disabled={wallet.total_balance === 0}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Spend Points
          </Button>

          {showTransferOptions && (
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setShowTransferModal(true);
              }}
              disabled={spending_power.purchased_available === 0}
            >
              <Users className="h-4 w-4 mr-2" />
              Transfer
            </Button>
          )}

          <Button 
            variant="ghost" 
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(!showDetails);
            }}
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
              {breakdown.recent_activity && breakdown.recent_activity.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Recent Activity
                  </h4>
                  
                  <div className="space-y-2">
                    {breakdown.recent_activity.slice(0, 3).map((tx, index) => (
                      <div key={tx.id || `tx-${index}-${tx.created_at || Date.now()}`} className="flex justify-between items-center text-sm">
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
      <SpendPointsModal
        clubId={clubId}
        clubName={clubName}
        isOpen={showSpendModal}
        onClose={() => setShowSpendModal(false)}
        onSuccess={() => {
          refetch();
          setShowSpendModal(false);
        }}
      />

      {/* Transfer Points Modal */}
      <TransferPointsModal
        clubId={clubId}
        clubName={clubName}
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onSuccess={() => {
          refetch();
          setShowTransferModal(false);
        }}
      />
    </Card>
  );
}

// Placeholder for Transfer Modal (to be implemented in Phase 2)
function TransferPointsModal({ isOpen, onClose, onSuccess, clubId, clubName, ...props }: any) {
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" 
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-modal="transfer-points"
    >
      <div 
        className="bg-white p-6 rounded-lg max-w-md w-full mx-4" 
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Transfer Points</h3>
        <p className="text-muted-foreground mb-4">Point transfer modal coming soon in Phase 2...</p>
        <p className="text-sm text-gray-600 mb-4">Club: {clubName}</p>
        <Button onClick={(e) => { e.stopPropagation(); onClose(); }}>Close</Button>
      </div>
    </div>
  );
}
