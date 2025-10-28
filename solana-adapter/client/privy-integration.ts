import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { PrivyClient } from "@privy-io/server-auth";
import { getAccount, getMint, getAssociatedTokenAddress } from "@solana/spl-token";
import { SuperfanPresaleClient, WalletAdapter } from "./client";

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

    // Create wallet adapter with signing methods
    // NOTE: This is a non-functional skeleton for demonstration purposes.
    // In production, implement Privy's transaction signing API:
    // - Use Privy's /rpc endpoint or SDK method to sign transactions
    // - Forward signed transactions back in the expected format
    // - Handle signing errors and propagate them appropriately
    const walletAdapter: WalletAdapter = {
      publicKey: userWallet,
      signTransaction: async <T extends Transaction>(transaction: T): Promise<T> => {
        throw new Error(
          "Transaction signing not implemented. " +
          "Integrate Privy's transaction signing API to enable this functionality. " +
          "See: https://docs.privy.io/guide/guides/solana"
        );
      },
      signAllTransactions: async <T extends Transaction>(transactions: T[]): Promise<T[]> => {
        throw new Error(
          "Transaction signing not implemented. " +
          "Integrate Privy's transaction signing API to enable this functionality."
        );
      },
    };

    // Create presale client with wallet adapter
    const presaleClient = new SuperfanPresaleClient(
      this.connection,
      walletAdapter,
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
    
    const walletAdapter: WalletAdapter = {
      publicKey: userWallet,
    };
    
    const presaleClient = new SuperfanPresaleClient(
      this.connection,
      walletAdapter,
      this.programId
    );

    const campaign = await presaleClient.getCampaign(campaignId);
    
    // Get user's token account balance
    const userTokenAccount = await getAssociatedTokenAddress(
      campaign.tokenMint,
      userWallet
    );

    try {
      const tokenAccount = await getAccount(
        this.connection,
        userTokenAccount
      );
      
      // Fetch mint info to get decimals dynamically
      const mintInfo = await getMint(
        this.connection,
        campaign.tokenMint
      );
      
      // Convert using actual mint decimals
      const balance = Number(tokenAccount.amount) / (10 ** mintInfo.decimals);
      return balance;
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
    const dummyWallet: WalletAdapter = { publicKey: PublicKey.default };
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
import { verifyAuthToken } from "@privy-io/server-auth";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authToken) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authorization header" },
        { status: 401 }
      );
    }

    let verifiedUser;
    try {
      verifiedUser = await verifyAuthToken(
        authToken,
        process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
        process.env.PRIVY_APP_SECRET!
      );
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const { campaignId, usdcAmount } = body;

    if (!campaignId || typeof campaignId !== "string" || campaignId.trim() === "") {
      return NextResponse.json(
        { error: "Invalid campaignId: must be a non-empty string" },
        { status: 400 }
      );
    }

    if (typeof usdcAmount !== "number" || usdcAmount <= 0 || !isFinite(usdcAmount)) {
      return NextResponse.json(
        { error: "Invalid usdcAmount: must be a positive number" },
        { status: 400 }
      );
    }

    // 3. Ensure environment variables are present
    if (!process.env.NEXT_PUBLIC_SOLANA_RPC_URL || !process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID) {
      console.error("Missing required environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Initialize Privy presale client
    const client = new PrivySuperfanPresaleClient({
      privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      privyAppSecret: process.env.PRIVY_APP_SECRET!,
      solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      programId: process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID,
    });

    // 5. Execute presale purchase with error handling
    const result = await client.buyPresaleForUser(
      verifiedUser.userId,
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
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : "Failed to purchase presale tokens";
    return NextResponse.json(
      { error: errorMessage },
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

