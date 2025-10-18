"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

// Coinbase Wallet client FID from Base docs (updated value: 309857)
// Allow override via environment variable for future-proofing
const COINBASE_WALLET_CLIENT_FID = process.env.NEXT_PUBLIC_COINBASE_WALLET_CLIENT_FID 
  ? parseInt(process.env.NEXT_PUBLIC_COINBASE_WALLET_CLIENT_FID, 10) 
  : 309857;

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
        const clientFid = result?.client?.clientFid;
        const isCoinbaseWallet = clientFid === COINBASE_WALLET_CLIENT_FID;
        
        // Log unknown client FIDs for diagnostics
        if (clientFid && !isCoinbaseWallet && clientFid !== COINBASE_WALLET_CLIENT_FID) {
          console.warn(`[FarcasterContext] Unknown client FID detected: ${clientFid}. Expected Coinbase: ${COINBASE_WALLET_CLIENT_FID}`);
        }
        
        if (result && result.client) {
          const platformName = isCoinbaseWallet ? 'Coinbase Wallet (Base)' : 'Farcaster miniapp';
          const disableGestures = !isCoinbaseWallet; // Enable gestures for Coinbase (allow scroll), disable for Farcaster
          
          console.log(`🚀 [FarcasterContext] In ${platformName} context, calling sdk.actions.ready()`);
          
          // Defer ready() call slightly to ensure render cycle is complete and DOM is ready
          setTimeout(async () => {
            try {
              if (sdk?.actions?.ready) {
                await sdk.actions.ready({ disableNativeGestures: disableGestures });
                console.log(`✅ [FarcasterContext] ${platformName} sdk.actions.ready() completed${isCoinbaseWallet ? ' (gestures enabled for scroll)' : ''}`);
              } else {
                console.warn('[FarcasterContext] sdk.actions.ready unavailable');
              }
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
    
    // Coinbase Wallet: check both clientFid and client.name for tolerance
    const clientFid = frameContext.client?.clientFid;
    const clientName = frameContext.client?.name?.toLowerCase();
    
    // Known Coinbase Wallet identifiers
    const KNOWN_COINBASE_FIDS = [COINBASE_WALLET_CLIENT_FID, 399519]; // Current + legacy
    const isCoinbaseByFid = clientFid && KNOWN_COINBASE_FIDS.includes(clientFid);
    const isCoinbaseByName = clientName?.includes('coinbase') || clientName?.includes('base');
    
    if (isCoinbaseByFid || isCoinbaseByName) {
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
