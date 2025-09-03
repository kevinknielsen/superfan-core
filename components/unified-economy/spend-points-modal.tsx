"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Shield, AlertTriangle, Wallet, TrendingUp, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useUnifiedPoints, useStatusInfo } from '@/hooks/unified-economy/use-unified-points';

interface SpendPointsModalProps {
  clubId: string;
  clubName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  // Optional pre-filled values for specific spending scenarios
  prefilledAmount?: number;
  prefilledDescription?: string;
  prefilledReferenceId?: string;
  hideDescriptionField?: boolean;
}

export default function SpendPointsModal({
  clubId,
  clubName,
  isOpen,
  onClose,
  onSuccess,
  prefilledAmount,
  prefilledDescription,
  prefilledReferenceId,
  hideDescriptionField = false
}: SpendPointsModalProps) {
  const [pointsToSpend, setPointsToSpend] = useState<string>(prefilledAmount?.toString() || '');
  const [description, setDescription] = useState(prefilledDescription || '');
  const [preserveStatus, setPreserveStatus] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { 
    breakdown, 
    spendPoints, 
    isSpending, 
    canSpend,
    formatPoints 
  } = useUnifiedPoints(clubId);
  
  const { getStatusInfo } = useStatusInfo();

  if (!isOpen || !breakdown) return null;

  const amount = parseInt(pointsToSpend) || 0;
  const canAffordSpending = canSpend(amount, preserveStatus);
  const statusInfo = getStatusInfo(breakdown.status.current);

  // Calculate max spendable based on status protection toggle
  const maxSpendable = preserveStatus 
    ? breakdown.spending_power.purchased_available + breakdown.spending_power.earned_available
    : breakdown.spending_power.total_spendable;

  // Calculate spending breakdown
  const calculateSpendingBreakdown = (amount: number, preserveStatus: boolean) => {
    const { spending_power } = breakdown;
    
    if (amount <= 0) return { purchased: 0, earned: 0, valid: false };
    
    const availablePurchased = spending_power.purchased_available;
    const availableEarned = spending_power.earned_available + 
      (preserveStatus ? 0 : (spending_power.earned_locked_for_status ?? 0));
    
    const spendPurchased = Math.min(amount, availablePurchased);
    const spendEarned = Math.max(0, amount - spendPurchased);
    
    const valid = spendPurchased + spendEarned <= spending_power.total_spendable && 
                  spendEarned <= availableEarned;
    
    return { purchased: spendPurchased, earned: spendEarned, valid };
  };

  const spendingBreakdown = calculateSpendingBreakdown(amount, preserveStatus);

  const handleSpend = async () => {
    if (!canAffordSpending || (!hideDescriptionField && !description.trim()) || amount <= 0) return;

    try {
      await spendPoints({
        clubId,
        pointsToSpend: amount,
        preserveStatus,
        description: description.trim(),
        referenceId: prefilledReferenceId
      });
      
      onSuccess?.();
      onClose();
      
      // Reset form
      setPointsToSpend('');
      setDescription('');
      setPreserveStatus(true);
    } catch (error) {
      // Error is handled by the hook's toast
      console.error('Spending failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Spend Points</h2>
            <p className="text-sm text-muted-foreground">{clubName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Balance Display */}
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                  <p className="text-2xl font-bold">
                    {formatPoints(breakdown.spending_power.total_spendable)}
                  </p>
                </div>
                <Badge variant="secondary" className={`${statusInfo.color} text-white`}>
                  {statusInfo.icon} {statusInfo.label}
                </Badge>
              </div>
              
              {/* Quick breakdown */}
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3 w-3" />
                  {formatPoints(breakdown.spending_power.purchased_available)} purchased
                </span>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {formatPoints(breakdown.spending_power.earned_available)} earned
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Points to Spend</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount..."
              value={pointsToSpend}
              onChange={(e) => setPointsToSpend(e.target.value)}
              min="1"
              max={maxSpendable}
              className="text-lg"
            />
            
            {/* Quick amount buttons */}
            <div className="flex gap-2">
              {[100, 500, 1000].map((quickAmount) => (
                <Button
                  key={quickAmount}
                  variant="outline"
                  size="sm"
                  onClick={() => setPointsToSpend(quickAmount.toString())}
                  disabled={quickAmount > maxSpendable}
                >
                  {formatPoints(quickAmount)}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPointsToSpend(maxSpendable.toString())}
              >
                Max
              </Button>
            </div>
          </div>

          {/* Description Input */}
          {!hideDescriptionField && (
            <div className="space-y-2">
              <Label htmlFor="description">What are you spending on?</Label>
              <Textarea
                id="description"
                placeholder="e.g., Vinyl pre-order, merch, unlock..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={255}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/255 characters
              </p>
            </div>
          )}

          {/* Status Protection Toggle */}
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-sm">Protect Status</p>
                <p className="text-xs text-muted-foreground">
                  Keep enough earned points to maintain your {statusInfo.label} status
                </p>
              </div>
            </div>
            <Switch
              checked={preserveStatus}
              onCheckedChange={setPreserveStatus}
            />
          </div>

          {/* Spending Breakdown Preview */}
          {amount > 0 && (
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium text-sm">Spending Breakdown</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBreakdown(!showBreakdown)}
                  >
                    {showBreakdown ? 'Hide' : 'Show'} Details
                  </Button>
                </div>
                
                {spendingBreakdown.valid ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>From purchased points:</span>
                      <span className="font-medium text-green-600">
                        {formatPoints(spendingBreakdown.purchased)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>From earned points:</span>
                      <span className="font-medium text-blue-600">
                        {formatPoints(spendingBreakdown.earned)}
                      </span>
                    </div>
                    
                    {showBreakdown && (
                      <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                        <p>• Purchased points are always available for spending</p>
                        <p>• Earned points{preserveStatus ? ' above status threshold' : ''} can be spent</p>
                        {preserveStatus && (
                          <p>• {formatPoints(breakdown.spending_power.earned_locked_for_status)} earned points protected for status</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Insufficient points for this transaction</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Warning if status protection is off */}
          {!preserveStatus && amount > 0 && spendingBreakdown.earned > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-700">
                This spending may lower your status tier. Consider enabling status protection.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={isSpending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSpend}
            className="flex-1"
            disabled={
              !canAffordSpending || 
              (!hideDescriptionField && !description.trim()) || 
              amount <= 0 || 
              isSpending ||
              !spendingBreakdown.valid
            }
          >
            {isSpending ? (
              'Processing...'
            ) : (
              <>
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Spend {formatPoints(amount)} Points
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
