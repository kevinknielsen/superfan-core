import { Connection, PublicKey } from "@solana/web3.js";
import { PrivyClient } from "@privy-io/server-auth";
import { SuperfanPresaleClient } from "./client";

/**
 * Privy + Solana Integration Example
 * 
 * Demonstrates how to use Privy's wallet abstraction with Superfan's
 * Solana presale program. This mirrors the Base implementation but
 * uses Privy's Solana wallet support.
 * 
 * Key differences from Base:
 * - Privy generates Solana keypairs for users (not EVM addresses)
 * - All transactions use Solana's account model (PDAs, ATAs)
 * - USDC is SPL-USDC (not ERC-20)
 * 
 * Flow:
 * 1. User authenticates via Privy (email, social, etc.)
 * 2. Privy generates a Solana wallet for the user
 * 3. User buys presale tokens using their Privy-managed Solana wallet
 * 4. All wallet complexity is abstracted by Privy
 */

/**
 * Configuration for Privy-enabled presale client
 */
interface PrivyPresaleConfig {
  privyAppId: string;
  privyAppSecret: string;
  solanaRpcUrl: string;
  programId: string;
}

/**
 * Superfan Presale Client with Privy wallet abstraction
 * 
 * This wrapper handles:
 * - User authentication via Privy
 * - Solana wallet generation/management
 * - Presale purchases with zero crypto knowledge required
 */
export class PrivySuperfanPresaleClient {
  private privyClient: PrivyClient;
  private connection: Connection;
  private programId: PublicKey;

  constructor(config: PrivyPresaleConfig) {
    this.privyClient = new PrivyClient(
      config.privyAppId,
      config.privyAppSecret
    );
    this.connection = new Connection(config.solanaRpcUrl, "confirmed");
    this.programId = new PublicKey(config.programId);
  }

  /**
   * Get or create Privy-managed Solana wallet for user
   * 
   * Privy automatically:
   * - Generates a Solana keypair
   * - Stores it securely (user doesn't see seed phrase)
   * - Enables embedded wallet signing
   */
  async getUserWallet(privyUserId: string): Promise<PublicKey> {
    const user = await this.privyClient.getUserById(privyUserId);
    
    // Get user's Solana wallet from Privy
    // Privy's Solana wallet support: https://docs.privy.io/guide/guides/solana
    const solanaWallet = user.linkedAccounts.find(
      (account) => account.type === "wallet" && account.chainType === "solana"
    );

    if (!solanaWallet) {
      throw new Error("User has no Solana wallet. Create one via Privy SDK.");
    }

    return new PublicKey(solanaWallet.address);
  }

  /**
   * Buy presale tokens using Privy wallet
   * 
   * This is the core user action - purchasing campaign tokens.
   * All wallet signing is handled by Privy's embedded wallet.
   * 
   * Frontend flow:
   * ```ts
   * // User clicks "Buy Tokens"
   * const result = await privyPresaleClient.buyPresaleForUser(
   *   user.id,
   *   "artist-campaign-2024",
   *   100 // $100 USDC
   * );
   * 
   * // User receives campaign tokens in their Privy wallet
   * console.log("Tokens minted:", result.campaignTokensMinted);
   * ```
   */
  async buyPresaleForUser(
    privyUserId: string,
    campaignId: string,
    usdcAmount: number
  ) {
    // Get user's Solana wallet from Privy
    const userWallet = await this.getUserWallet(privyUserId);

    // Create presale client with user's wallet
    // Note: In production, use Privy's transaction signing API
    // This is a simplified example
    const presaleClient = new SuperfanPresaleClient(
      this.connection,
      { publicKey: userWallet }, // Wallet adapter interface
      this.programId
    );

    // Execute presale purchase
    return await presaleClient.buyPresale({
      campaignId,
      usdcAmount,
    });
  }

  /**
   * Get user's campaign token balance
   */
  async getUserTokenBalance(
    privyUserId: string,
    campaignId: string
  ): Promise<number> {
    const userWallet = await this.getUserWallet(privyUserId);
    
    const presaleClient = new SuperfanPresaleClient(
      this.connection,
      { publicKey: userWallet },
      this.programId
    );

    const campaign = await presaleClient.getCampaign(campaignId);
    
    // Get user's token account balance
    const { getAccount } = await import("@solana/spl-token");
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    
    const userTokenAccount = await getAssociatedTokenAddress(
      campaign.tokenMint,
      userWallet
    );

    try {
      const tokenAccount = await getAccount(
        this.connection,
        userTokenAccount
      );
      return Number(tokenAccount.amount) / 1_000_000; // Convert from lamports
    } catch (error) {
      // Token account doesn't exist = balance is 0
      return 0;
    }
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string) {
    // This doesn't require user authentication
    const dummyWallet = { publicKey: PublicKey.default };
    const presaleClient = new SuperfanPresaleClient(
      this.connection,
      dummyWallet,
      this.programId
    );

    return await presaleClient.getCampaignStats(campaignId);
  }
}

/**
 * Example: Next.js API route for buying presale tokens
 * 
 * File: app/api/presale/buy/route.ts
 */
export const nextjsApiRouteExample = `
import { NextRequest, NextResponse } from "next/server";
import { PrivySuperfanPresaleClient } from "@/solana-adapter/client/privy-integration";

export async function POST(request: NextRequest) {
  try {
    const { privyUserId, campaignId, usdcAmount } = await request.json();

    // Initialize Privy presale client
    const client = new PrivySuperfanPresaleClient({
      privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      privyAppSecret: process.env.PRIVY_APP_SECRET!,
      solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL!,
      programId: process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID!,
    });

    // Execute presale purchase
    const result = await client.buyPresaleForUser(
      privyUserId,
      campaignId,
      usdcAmount
    );

    return NextResponse.json({
      success: true,
      signature: result.signature,
      tokensMinted: result.campaignTokensMinted,
    });

  } catch (error) {
    console.error("Presale purchase failed:", error);
    return NextResponse.json(
      { error: "Failed to purchase presale tokens" },
      { status: 500 }
    );
  }
}
`;

/**
 * Example: React component for presale purchase
 * 
 * File: components/solana-presale-button.tsx
 */
export const reactComponentExample = `
"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SolanaPresaleButtonProps {
  campaignId: string;
  amount: number;
}

export function SolanaPresaleButton({ 
  campaignId, 
  amount 
}: SolanaPresaleButtonProps) {
  const { user, authenticated, login } = usePrivy();
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    if (!authenticated) {
      login();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/presale/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privyUserId: user.id,
          campaignId,
          usdcAmount: amount,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert(\`✅ Success! Minted \${result.tokensMinted} tokens\`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      alert("Failed to purchase tokens");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleBuy} disabled={loading}>
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        \`Buy $\${amount} USDC\`
      )}
    </Button>
  );
}
`;

