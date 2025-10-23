/**
 * Example Usage: Superfan Solana Presale Client
 * 
 * This file demonstrates how to use the SuperfanPresaleClient
 * to interact with the presale program on Solana DevNet.
 * 
 * Run: pnpm client:example
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SuperfanPresaleClient } from "./client";
import * as fs from "fs";
import * as path from "path";

// Configuration
const DEVNET_RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("SuperfnPrsLE11111111111111111111111111111");

/**
 * Load wallet from filesystem
 * In production, use Privy for wallet management
 */
function loadWallet(): Keypair {
  const walletPath = path.join(
    process.env.HOME || "",
    ".config/solana/id.json"
  );
  
  if (!fs.existsSync(walletPath)) {
    console.log("❌ Wallet not found at:", walletPath);
    console.log("   Run: solana-keygen new");
    process.exit(1);
  }

  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/**
 * Main example
 */
async function main() {
  console.log("🚀 Superfan Solana Presale Example\n");

  // Initialize connection and wallet
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = loadWallet();
  
  console.log("📍 Wallet:", wallet.publicKey.toBase58());
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("💰 Balance:", balance / 1e9, "SOL\n");

  if (balance === 0) {
    console.log("⚠️  Get DevNet SOL: solana airdrop 2");
    console.log("⚠️  Get DevNet USDC: https://spl-token-faucet.com/\n");
  }

  // Initialize presale client
  const client = new SuperfanPresaleClient(connection, wallet, PROGRAM_ID);

  // Example 1: Create a campaign
  console.log("📝 Creating campaign...");
  const campaignId = `demo-${Date.now()}`;
  
  try {
    const createTx = await client.createCampaign({
      campaignId,
      pricePerTokenUsdc: 1.5, // $1.50 per token
      totalSupply: 1_000_000,  // 1M tokens max
      lockDuration: 0,         // No lock period
    });
    console.log("✅ Campaign created!");
    console.log("   TX:", createTx);
    console.log("");
  } catch (error) {
    console.error("❌ Failed to create campaign:", error);
    return;
  }

  // Example 2: Get campaign stats
  console.log("📊 Fetching campaign stats...");
  const stats = await client.getCampaignStats(campaignId);
  console.log("   Campaign ID:", stats.campaignId);
  console.log("   Price per token:", `$${stats.pricePerToken}`);
  console.log("   Tokens sold:", stats.tokensSold);
  console.log("   USDC raised:", `$${stats.usdcRaised}`);
  console.log("   Active:", stats.isActive);
  console.log("");

  // Example 3: Buy presale tokens
  console.log("💳 Buying presale tokens...");
  console.log("   Note: Requires USDC in wallet");
  console.log("   Get test USDC: https://spl-token-faucet.com/\n");
  
  try {
    const buyResult = await client.buyPresale({
      campaignId,
      usdcAmount: 10, // $10 USDC
    });
    console.log("✅ Purchase complete!");
    console.log("   TX:", buyResult.signature);
    console.log("   USDC spent:", `$${buyResult.usdcSpent}`);
    console.log("   Tokens minted:", buyResult.campaignTokensMinted);
    console.log("");
  } catch (error) {
    console.error("❌ Purchase failed:", error);
    console.log("   Make sure you have USDC in your wallet");
    console.log("");
  }

  // Example 4: Get updated stats
  console.log("📊 Updated campaign stats:");
  const updatedStats = await client.getCampaignStats(campaignId);
  console.log("   Tokens sold:", updatedStats.tokensSold);
  console.log("   USDC raised:", `$${updatedStats.usdcRaised}`);
  console.log("");

  // Example 5: Get campaign PDA
  const [campaignPda, bump] = client.getCampaignAddress(campaignId);
  console.log("🔑 Campaign PDA:", campaignPda.toBase58());
  console.log("   Bump:", bump);
  console.log("");

  console.log("✨ Example complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

