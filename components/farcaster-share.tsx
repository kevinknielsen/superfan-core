"use client";

import { useFarcaster } from '@/lib/farcaster-context';
import { Button } from '@/components/ui/button';
import { Share } from 'lucide-react';
import { sdk } from '@farcaster/miniapp-sdk';

interface FarcasterShareProps {
  url: string;
  text?: string;
  className?: string;
}

export function FarcasterShare({ url, text = "Check out this project on Superfan!", className }: FarcasterShareProps) {
  const { openUrl, isInWalletApp } = useFarcaster();

  const handleShare = async () => {
    if (isInWalletApp) {
      // Use Farcaster SDK composeCast action for wallet apps (Coinbase Wallet compatible)
      try {
        await sdk.actions.composeCast({
          text: text,
          embeds: [url],
        });
      } catch (error) {
        console.error('Failed to compose cast:', error);
        // Fallback to openUrl if composeCast fails
        const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
        await openUrl(castUrl);
      }
    } else {
      // For web context, use Warpcast URL with window.open
      const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
      window.open(castUrl, '_blank');
    }
  };

  return (
    <Button 
      onClick={handleShare}
      variant="outline" 
      size="sm"
      className={className}
    >
      <Share className="h-4 w-4 mr-2" />
      Share
    </Button>
  );
}

export default FarcasterShare; 