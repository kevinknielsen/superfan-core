"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

// Coinbase Wallet client FID from Base docs
const COINBASE_WALLET_CLIENT_FID = 399519;

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
        // Detect platform using clientFid from Base docs
        const isCoinbaseWallet = result?.client?.clientFid === COINBASE_WALLET_CLIENT_FID;
        
        if (result && result.client) {
          const platformName = isCoinbaseWallet ? 'Coinbase Wallet (Base)' : 'Farcaster miniapp';
          const disableGestures = !isCoinbaseWallet; // Enable gestures for Coinbase (allow scroll), disable for Farcaster
          
          console.log(`🚀 [FarcasterContext] In ${platformName} context, calling sdk.actions.ready()`);
          
          // Defer ready() call slightly to ensure render cycle is complete and DOM is ready
          setTimeout(async () => {
            try {
              await sdk.actions.ready({ disableNativeGestures: disableGestures });
              console.log(`✅ [FarcasterContext] ${platformName} sdk.actions.ready() completed${isCoinbaseWallet ? ' (gestures enabled for scroll)' : ''}`);
            } catch (readyError) {
              console.error(`❌ [FarcasterContext] ${platformName} ready() error:`, readyError);
            }
          }, 100);
        } else {
          console.log('🌐 [FarcasterContext] Not in miniapp context, skipping ready() call');
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
    
    // Coinbase Wallet returns this clientFid according to Base docs
    if (frameContext.client?.clientFid === COINBASE_WALLET_CLIENT_FID) {
      return 'coinbase';
    }
    
    // All other wallet app contexts are Farcaster
    return 'farcaster';
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
