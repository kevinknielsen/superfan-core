import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import type { SuperfanPresale } from "../target/types/superfan_presale";
import idl from "../target/idl/superfan_presale.json";
import {
  CreateCampaignParams,
  BuyPresaleParams,
  BuyPresaleResult,
  CampaignAccount,
  CampaignStats,
} from "./types";

/**
 * Superfan Presale Client
 * 
 * High-level TypeScript client for interacting with the Superfan presale program.
 * Designed to work seamlessly with Privy's wallet abstraction.
 * 
 * Usage:
 * ```ts
 * const client = new SuperfanPresaleClient(connection, wallet, PROGRAM_ID);
 * 
 * // Create a campaign
 * await client.createCampaign({
 *   campaignId: "artist-presale-2024",
 *   pricePerTokenUsdc: 1.5,
 *   totalSupply: 1000000
 * });
 * 
 * // Buy tokens
 * await client.buyPresale({
 *   campaignId: "artist-presale-2024",
 *   usdcAmount: 100
 * });
 * ```
 */
export class SuperfanPresaleClient {
  private program: Program<SuperfanPresale>;
  private connection: Connection;
  private wallet: any; // Privy wallet or Keypair
  
  // DevNet USDC test token mint
  // Get test USDC: https://spl-token-faucet.com/?token-name=USDC
  public readonly USDC_MINT = new PublicKey(
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // DevNet USDC
  );

  constructor(
    connection: Connection,
    wallet: any,
    programId: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: "confirmed" }
    );
    
    this.program = new Program<SuperfanPresale>(
      idl as any,
      programId,
      provider
    );
  }

  /**
   * Derive campaign PDA address
   */
  public getCampaignAddress(campaignId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), Buffer.from(campaignId)],
      this.program.programId
    );
  }

  /**
   * Create a new presale campaign
   * 
   * This initializes:
   * - Campaign state account (PDA)
   * - Campaign token mint (SPL token)
   * - Treasury account (holds USDC)
   */
  async createCampaign(params: CreateCampaignParams): Promise<string> {
    const { campaignId, pricePerTokenUsdc, totalSupply, lockDuration } = params;

    // Derive PDAs
    const [campaignPda] = this.getCampaignAddress(campaignId);
    
    // Generate new keypair for token mint
    const campaignTokenMint = Keypair.generate();
    
    // Derive treasury token account
    const treasury = await getAssociatedTokenAddress(
      this.USDC_MINT,
      campaignPda,
      true // allowOwnerOffCurve
    );

    // Convert price to lamports (USDC has 6 decimals)
    const pricePerTokenLamports = Math.floor(pricePerTokenUsdc * 1_000_000);

    const tx = await this.program.methods
      .initializeCampaign(
        campaignId,
        new BN(pricePerTokenLamports),
        totalSupply ? new BN(totalSupply) : null,
        lockDuration ? new BN(lockDuration) : null
      )
      .accounts({
        campaign: campaignPda,
        campaignTokenMint: campaignTokenMint.publicKey,
        treasury,
        usdcMint: this.USDC_MINT,
        authority: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([campaignTokenMint])
      .rpc();

    console.log("✅ Campaign created:", {
      campaignId,
      signature: tx,
      campaignPda: campaignPda.toBase58(),
      tokenMint: campaignTokenMint.publicKey.toBase58(),
    });

    return tx;
  }

  /**
   * Buy presale tokens with USDC
   * 
   * Atomically:
   * 1. Transfers USDC from buyer → treasury
   * 2. Mints campaign tokens → buyer
   */
  async buyPresale(params: BuyPresaleParams): Promise<BuyPresaleResult> {
    const { campaignId, usdcAmount } = params;

    // Derive campaign PDA
    const [campaignPda] = this.getCampaignAddress(campaignId);
    
    // Fetch campaign data to get token mint
    const campaign = await this.getCampaign(campaignId);
    
    // Get buyer's token accounts
    const buyerUsdcAccount = await getAssociatedTokenAddress(
      this.USDC_MINT,
      this.wallet.publicKey
    );
    
    const buyerTokenAccount = await getAssociatedTokenAddress(
      campaign.tokenMint,
      this.wallet.publicKey
    );

    // Convert USDC to lamports (6 decimals)
    const usdcLamports = Math.floor(usdcAmount * 1_000_000);

    const tx = await this.program.methods
      .buyPresale(new BN(usdcLamports))
      .accounts({
        campaign: campaignPda,
        campaignTokenMint: campaign.tokenMint,
        treasury: campaign.treasury,
        buyer: this.wallet.publicKey,
        buyerUsdcAccount,
        buyerTokenAccount,
        usdcMint: this.USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Calculate tokens minted
    const tokensMinted = usdcLamports / campaign.pricePerTokenUsdc.toNumber();

    console.log("✅ Presale purchase complete:", {
      signature: tx,
      usdcSpent: usdcAmount,
      tokensMinted,
    });

    return {
      signature: tx,
      campaignTokensMinted: tokensMinted,
      usdcSpent: usdcAmount,
    };
  }

  /**
   * Fetch campaign data
   */
  async getCampaign(campaignId: string): Promise<CampaignAccount> {
    const [campaignPda] = this.getCampaignAddress(campaignId);
    const campaign = await this.program.account.campaign.fetch(campaignPda);
    
    return campaign as CampaignAccount;
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const campaign = await this.getCampaign(campaignId);
    
    return {
      campaignId: campaign.campaignId,
      tokensSold: campaign.tokensSold.toNumber(),
      usdcRaised: campaign.usdcRaised.toNumber() / 1_000_000, // Convert to USDC
      pricePerToken: campaign.pricePerTokenUsdc.toNumber() / 1_000_000,
      isActive: campaign.isActive,
      createdAt: new Date(campaign.createdAt.toNumber() * 1000),
    };
  }

  /**
   * Withdraw funds from campaign treasury (authority only)
   */
  async withdrawFunds(campaignId: string, amount: number): Promise<string> {
    const [campaignPda] = this.getCampaignAddress(campaignId);
    const campaign = await this.getCampaign(campaignId);
    
    const authorityUsdcAccount = await getAssociatedTokenAddress(
      this.USDC_MINT,
      this.wallet.publicKey
    );

    const amountLamports = Math.floor(amount * 1_000_000);

    const tx = await this.program.methods
      .withdrawFunds(new BN(amountLamports))
      .accounts({
        campaign: campaignPda,
        treasury: campaign.treasury,
        authority: this.wallet.publicKey,
        authorityUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Funds withdrawn:", {
      signature: tx,
      amount,
    });

    return tx;
  }

  /**
   * Close campaign (authority only)
   */
  async closeCampaign(campaignId: string): Promise<string> {
    const [campaignPda] = this.getCampaignAddress(campaignId);

    const tx = await this.program.methods
      .closeCampaign()
      .accounts({
        campaign: campaignPda,
        authority: this.wallet.publicKey,
      })
      .rpc();

    console.log("🔒 Campaign closed:", tx);

    return tx;
  }
}

