import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Campaign account data structure
 * Mirrors the on-chain Campaign struct from lib.rs
 */
export interface CampaignAccount {
  authority: PublicKey;
  campaignId: string;
  tokenMint: PublicKey;
  treasury: PublicKey;
  pricePerTokenUsdc: BN;
  totalSupply: BN | null;
  tokensSold: BN;
  usdcRaised: BN;
  lockDuration: BN | null;
  createdAt: BN;
  isActive: boolean;
  bump: number;
}

/**
 * Configuration for creating a presale campaign
 * Matches Metal's createPresale() parameters
 */
export interface CreateCampaignParams {
  campaignId: string;
  pricePerTokenUsdc: number; // Price in USDC (e.g., 1.5 = $1.50)
  totalSupply?: number;      // Max tokens to mint
  lockDuration?: number;     // Lock period in seconds
}

/**
 * Configuration for purchasing presale tokens
 */
export interface BuyPresaleParams {
  campaignId: string;
  usdcAmount: number; // Amount in USDC (e.g., 100 = $100)
}

/**
 * Result of a presale purchase
 */
export interface BuyPresaleResult {
  signature: string;
  campaignTokensMinted: number;
  usdcSpent: number;
}

/**
 * Campaign statistics
 */
export interface CampaignStats {
  campaignId: string;
  tokensSold: number;
  usdcRaised: number;
  pricePerToken: number;
  isActive: boolean;
  createdAt: Date;
}

