"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  QrCode, 
  Maximize2, 
  Sun, 
  Wallet, 
  Globe
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from '@privy-io/react-auth';

interface BillfoldWalletProps {
  className?: string;
}

interface GlobalPointsData {
  global_balance: {
    total_points: number;
    total_usd_value: number;
    active_clubs_count: number;
  };
}

// Placeholder QR code data URL (you can replace this with actual user QR)
const PLACEHOLDER_QR = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0icXIiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjZmZmIi8+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMDAwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMwMDAiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI3FyKSIvPjx0ZXh0IHg9IjEwMCIgeT0iMTEwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0ibW9ub3NwYWNlIj5TdXBlcmZhbiBRUjwvdGV4dD48L3N2Zz4=";

export default function BillfoldWallet({ className = "" }: BillfoldWalletProps) {
  const [showEnlargedQR, setShowEnlargedQR] = useState(false);
  const [brightnessBoost, setBrightnessBoost] = useState(false);

  // Get global points balance for display
  const {
    data: globalData,
    isLoading
  } = useQuery<GlobalPointsData>({
    queryKey: ['global-points-balance'],
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/points/global-balance', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch global balance');
      }
      
      return response.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    enabled: typeof window !== 'undefined', // Only run on client side
  });

  const handleQRTap = () => {
    setShowEnlargedQR(true);
  };

  const toggleBrightness = () => {
    setBrightnessBoost(!brightnessBoost);
  };

  return (
    <>
      <div className={`space-y-6 ${className}`}>
        {/* QR Code Card */}
        <Card className="overflow-hidden bg-gradient-to-br from-primary/5 to-blue-500/5 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20">
                <QrCode className="h-4 w-4 text-primary" />
              </div>
              Your Payment QR
              <Badge variant="secondary" className="ml-auto">
                Billfold Ready
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* QR Code Display */}
            <div className="flex flex-col items-center">
              <motion.div
                className="relative cursor-pointer group"
                onClick={handleQRTap}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className={`p-4 bg-white rounded-2xl shadow-lg transition-all duration-300 ${
                  brightnessBoost ? 'brightness-150' : ''
                }`}>
                  <img
                    src={PLACEHOLDER_QR}
                    alt="Your Billfold QR Code"
                    className="w-48 h-48 rounded-lg"
                  />
                </div>
                
                {/* Tap to enlarge hint */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-2xl transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="bg-black/80 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                    <Maximize2 className="h-3 w-3" />
                    Tap to enlarge
                  </div>
                </div>
              </motion.div>

              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Show this QR to vendors for payments
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Works with cash or points • Billfold POS compatible
                </p>
              </div>
            </div>

            {/* Brightness Control */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleBrightness}
                className="flex items-center gap-2"
              >
                <Sun className="h-4 w-4" />
                {brightnessBoost ? 'Normal Brightness' : 'Boost Brightness'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Points Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Points Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-6 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/20">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="text-lg font-medium">Superfan Points</h4>
                  <p className="text-sm text-muted-foreground">
                    Across {globalData?.global_balance.active_clubs_count || 0} active club{(globalData?.global_balance.active_clubs_count || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {isLoading ? (
                  <div className="text-2xl font-bold text-muted-foreground">Loading...</div>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {globalData?.global_balance.total_points.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-primary font-medium">
                      ${globalData?.global_balance.total_usd_value.toFixed(2) || '0.00'} USD
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enlarged QR Modal */}
      {showEnlargedQR && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowEnlargedQR(false)}
        >
          <motion.div
            className="relative"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowEnlargedQR(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white"
            >
              <span className="text-sm">Close</span>
            </button>
            
            {/* Enlarged QR */}
            <div className={`p-8 bg-white rounded-3xl shadow-2xl transition-all duration-300 ${
              brightnessBoost ? 'brightness-150' : ''
            }`}>
              <img
                src={PLACEHOLDER_QR}
                alt="Your Billfold QR Code - Enlarged"
                className="w-80 h-80 rounded-xl"
              />
            </div>

            {/* Controls */}
            <div className="flex justify-center mt-4 space-x-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleBrightness}
                className="bg-white/20 text-white border-white/30 hover:bg-white/30"
              >
                <Sun className="h-4 w-4 mr-2" />
                {brightnessBoost ? 'Normal' : 'Boost'} Brightness
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
