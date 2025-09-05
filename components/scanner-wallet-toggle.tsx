"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Wallet, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QRScanner from './qr-scanner';
import BillfoldWallet from './billfold-wallet';

interface ScannerWalletToggleProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'scanner' | 'wallet';
}

export default function ScannerWalletToggle({ 
  isOpen, 
  onClose, 
  defaultMode = 'scanner' 
}: ScannerWalletToggleProps) {
  const [mode, setMode] = useState<'scanner' | 'wallet'>(defaultMode);

  // Sync internal state with prop changes
  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  if (!isOpen) return null;

  // Scanner mode - render custom scanner interface
  if (mode === 'scanner') {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="fixed inset-0 bg-black"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Toggle */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center justify-between">
                              <div className="flex items-center">
                <Camera className="h-6 w-6 text-white mr-2" />
                <h2 className="text-lg font-semibold text-white">Scan</h2>
              </div>
              
              <div className="flex items-center space-x-3">
                {/* Mode Toggle */}
                <div className="flex bg-white/20 rounded-lg p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMode('scanner')}
                    className="px-3 py-1.5 text-xs text-white bg-white/20 hover:bg-white/30 border-0"
                  >
                    <Camera className="h-3 w-3 mr-1" />
                    Scanner
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMode('wallet')}
                    className="px-3 py-1.5 text-xs text-white bg-transparent hover:bg-white/20 border-0"
                  >
                    <Wallet className="h-3 w-3 mr-1" />
                    Wallet
                  </Button>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="p-2 bg-white/20 text-white hover:bg-white/30"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              </div>
            </div>

            {/* Scanner Content */}
            <div className="pt-20 h-full">
              <QRScanner 
                isOpen={true} 
                onClose={() => {}} // Don't close, let parent handle
                embedded={true} // Use embedded mode to avoid layout conflicts
              />
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Wallet mode - show the Billfold wallet
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="fixed inset-0 bg-background"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center">
              <Wallet className="h-6 w-6 text-primary mr-2" />
              <h2 className="text-lg font-semibold">Your Wallet</h2>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Mode Toggle */}
              <div className="flex bg-muted rounded-lg p-1">
                <Button
                  variant={mode === 'scanner' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('scanner')}
                  className="px-3 py-1.5 text-xs"
                >
                  <Camera className="h-3 w-3 mr-1" />
                  Scanner
                </Button>
                <Button
                  variant={mode === 'wallet' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('wallet')}
                  className="px-3 py-1.5 text-xs"
                >
                  <Wallet className="h-3 w-3 mr-1" />
                  Wallet
                </Button>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="p-2"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-md mx-auto">
              <BillfoldWallet />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-muted/30">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Toggle between scanning QR codes and showing your payment QR
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
