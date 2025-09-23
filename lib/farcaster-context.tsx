"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

interface FarcasterContextType {
  isSDKLoaded: boolean;
  frameContext: Awaited<typeof sdk.context> | null;
  isInWalletApp: boolean; // Works for both Farcaster and Coinbase Wallet
  isInFarcaster: boolean;
  isInCoinbaseWallet: boolean;
  platform: 'farcaster' | 'coinbase' | 'web';
  user: any;
  addMiniApp: () => Promise<void>;
  openUrl: (url: string) => Promise<void>;
}

const FarcasterContext = createContext<FarcasterContextType | null>(null);

export function FarcasterProvider({ children }: { children: React.ReactNode }) {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [frameContext, setFrameContext] = useState<Awaited<
    typeof sdk.context
  > | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const initSDK = async () => {
      try {
        // Initialize the SDK first
        console.log('🚀 [FarcasterContext] Initializing SDK...');
        await sdk.init();
        console.log('✅ [FarcasterContext] SDK initialized');
        
        const result = await sdk.context;
        setFrameContext(result);
        setUser(result?.user);
        setIsSDKLoaded(true);

        // Store context globally for SDK access
        if (typeof window !== "undefined") {
          (window as any).frameContext = result;
          (window as any).farcaster = sdk;
        }

        // Call ready to dismiss splash screen in Wallet App context
        console.log('🔍 [FarcasterContext] Context result:', result);
        console.log('🔍 [FarcasterContext] User agent:', navigator.userAgent);
        
        if (result && result.client) {
          console.log('🚀 [FarcasterContext] In miniapp context, calling sdk.actions.ready()');
          console.log('🔍 [FarcasterContext] Client info:', result.client);
          
          // Give the UI a moment to render before calling ready
          setTimeout(async () => {
            try {
              await sdk.actions.ready({ disableNativeGestures: true });
              console.log('✅ [FarcasterContext] sdk.actions.ready() completed successfully');
            } catch (readyError) {
              console.error('❌ [FarcasterContext] Error calling ready():', readyError);
            }
          }, 100);
        } else {
          console.log('🌐 [FarcasterContext] Not in miniapp context, skipping ready() call');
          console.log('🔍 [FarcasterContext] Available context keys:', Object.keys(result || {}));
        }
      } catch (error) {
        console.error('❌ [FarcasterContext] SDK initialization error:', error);
        setIsSDKLoaded(true); // Still mark as loaded for web fallback
      }
    };

    initSDK();
  }, []);

  const addMiniApp = async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      console.error("Failed to add wallet app:", error);
    }
  };

  const openUrl = async (url: string) => {
    try {
      await sdk.actions.openUrl(url);
    } catch (error) {
      console.error("Failed to open URL:", error);
      // Fallback to regular window.open for web
      window.open(url, "_blank");
    }
  };

  // Platform detection using clientFid from Base docs
  const detectPlatform = (): 'farcaster' | 'coinbase' | 'web' => {
    if (!frameContext) return 'web';
    
    // Coinbase Wallet returns clientFid: 399519 according to Base docs
    if (frameContext.client?.clientFid === 399519) {
      return 'coinbase';
    }
    
    // All other wallet app contexts are Farcaster
    return frameContext ? 'farcaster' : 'web';
  };

  const platform = detectPlatform();
  const isInFarcaster = platform === 'farcaster';
  const isInCoinbaseWallet = platform === 'coinbase';
  const isInWalletApp = platform !== 'web'; // Works for both Farcaster and Coinbase Wallet

  return (
    <FarcasterContext.Provider
      value={{
        isSDKLoaded,
        frameContext,
        isInWalletApp,
        isInFarcaster,
        isInCoinbaseWallet,
        platform,
        user,
        addMiniApp,
        openUrl,
      }}
    >
      {children}
    </FarcasterContext.Provider>
  );
}

export function useFarcaster() {
  const context = useContext(FarcasterContext);
  if (!context) {
    throw new Error("useFarcaster must be used within a FarcasterProvider");
  }
  return context;
}

// Convenience hook - works for both Farcaster and Coinbase Wallet
export function useIsInWalletApp() {
  const { isInWalletApp } = useFarcaster();
  return isInWalletApp;
}
