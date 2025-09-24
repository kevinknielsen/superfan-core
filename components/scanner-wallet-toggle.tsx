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
  if (!isOpen) return null;

  // Only show scanner mode - wallet modal hidden
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
          {/* Header - Simplified without toggle */}
          <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Camera className="h-6 w-6 text-white mr-2" />
                <h2 className="text-lg font-semibold text-white">QR Scanner</h2>
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
