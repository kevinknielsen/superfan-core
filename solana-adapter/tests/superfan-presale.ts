import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SuperfanPresale } from "../target/types/superfan_presale";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";

describe("superfan-presale", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SuperfanPresale as Program<SuperfanPresale>;
  
  // Test accounts
  const authority = provider.wallet as anchor.Wallet;
  const buyer = anchor.web3.Keypair.generate();
  
  let usdcMint: anchor.web3.PublicKey;
  let campaignTokenMint: anchor.web3.Keypair;
  let campaignPda: anchor.web3.PublicKey;
  let treasury: anchor.web3.PublicKey;
  let buyerUsdcAccount: anchor.web3.PublicKey;
  
  const campaignId = `test-campaign-${Date.now()}`;
  const pricePerToken = new anchor.BN(1_500_000); // $1.50
  const totalSupply = new anchor.BN(1_000_000);
  
  before(async () => {
    // Create USDC mock mint
    usdcMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6 // USDC decimals
    );
    
    // Airdrop SOL to buyer
    const airdropSig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);
    
    // Create buyer's USDC account and mint test USDC
    const buyerUsdcAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      usdcMint,
      buyer.publicKey
    );
    buyerUsdcAccount = buyerUsdcAccountInfo.address;
    
    // Mint 1000 USDC to buyer for testing
    await mintTo(
      provider.connection,
      authority.payer,
      usdcMint,
      buyerUsdcAccount,
      authority.publicKey,
      1_000_000_000 // 1000 USDC
    );
  });

  it("Initializes a campaign", async () => {
    // Generate keypair for campaign token mint
    campaignTokenMint = anchor.web3.Keypair.generate();
    
    // Derive campaign PDA
    [campaignPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), Buffer.from(campaignId)],
      program.programId
    );
    
    // Derive treasury (owned by campaign PDA)
    treasury = await getAssociatedTokenAddress(
      usdcMint,
      campaignPda,
      true // allowOwnerOffCurve
    );
    
    const tx = await program.methods
      .initializeCampaign(
        campaignId,
        pricePerToken,
        totalSupply,
        null // no lock duration
      )
      .accounts({
        campaign: campaignPda,
        campaignTokenMint: campaignTokenMint.publicKey,
        treasury,
        usdcMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([campaignTokenMint])
      .rpc();
    
    console.log("Campaign initialized:", tx);
    
    // Fetch and verify campaign data
    const campaign = await program.account.campaign.fetch(campaignPda);
    
    assert.equal(campaign.campaignId, campaignId);
    assert.equal(campaign.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(campaign.pricePerTokenUsdc.toString(), pricePerToken.toString());
    assert.equal(campaign.totalSupply?.toString(), totalSupply.toString());
    assert.equal(campaign.tokensSold.toString(), "0");
    assert.equal(campaign.usdcRaised.toString(), "0");
    assert.equal(campaign.isActive, true);
  });

  it("Buys presale tokens", async () => {
    const usdcAmount = new anchor.BN(10_000_000); // 10 USDC
    
    // Get buyer's campaign token account
    const buyerTokenAccount = await getAssociatedTokenAddress(
      campaignTokenMint.publicKey,
      buyer.publicKey
    );
    
    const tx = await program.methods
      .buyPresale(usdcAmount)
      .accounts({
        campaign: campaignPda,
        campaignTokenMint: campaignTokenMint.publicKey,
        treasury,
        buyer: buyer.publicKey,
        buyerUsdcAccount,
        buyerTokenAccount,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
    
    console.log("Presale purchase:", tx);
    
    // Fetch updated campaign
    const campaign = await program.account.campaign.fetch(campaignPda);
    
    // Calculate expected tokens: 10 USDC / 1.5 = 6.666... tokens
    const expectedTokens = usdcAmount.div(pricePerToken);
    
    assert.equal(campaign.tokensSold.toString(), expectedTokens.toString());
    assert.equal(campaign.usdcRaised.toString(), usdcAmount.toString());
    
    // Verify buyer received tokens
    const buyerTokenAccountInfo = await provider.connection.getTokenAccountBalance(
      buyerTokenAccount
    );
    assert.equal(buyerTokenAccountInfo.value.amount, expectedTokens.toString());
    
    // Verify treasury received USDC
    const treasuryInfo = await provider.connection.getTokenAccountBalance(treasury);
    assert.equal(treasuryInfo.value.amount, usdcAmount.toString());
  });

  it("Prevents buying when supply exceeded", async () => {
    // Try to buy more than total supply
    const hugeAmount = new anchor.BN(2_000_000_000_000); // 2M USDC
    
    const buyerTokenAccount = await getAssociatedTokenAddress(
      campaignTokenMint.publicKey,
      buyer.publicKey
    );
    
    try {
      await program.methods
        .buyPresale(hugeAmount)
        .accounts({
          campaign: campaignPda,
          campaignTokenMint: campaignTokenMint.publicKey,
          treasury,
          buyer: buyer.publicKey,
          buyerUsdcAccount,
          buyerTokenAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
      
      assert.fail("Should have thrown SupplyExceeded error");
    } catch (error) {
      assert.include(error.toString(), "SupplyExceeded");
    }
  });

  it("Withdraws funds (authority only)", async () => {
    // Create authority's USDC account if needed
    const authorityUsdcAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      usdcMint,
      authority.publicKey
    );
    
    const withdrawAmount = new anchor.BN(5_000_000); // 5 USDC
    
    const tx = await program.methods
      .withdrawFunds(withdrawAmount)
      .accounts({
        campaign: campaignPda,
        treasury,
        authority: authority.publicKey,
        authorityUsdcAccount: authorityUsdcAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    console.log("Funds withdrawn:", tx);
    
    // Verify authority received USDC
    const authorityBalance = await provider.connection.getTokenAccountBalance(
      authorityUsdcAccount.address
    );
    assert.equal(authorityBalance.value.amount, withdrawAmount.toString());
  });

  it("Closes campaign (authority only)", async () => {
    const tx = await program.methods
      .closeCampaign()
      .accounts({
        campaign: campaignPda,
        authority: authority.publicKey,
      })
      .rpc();
    
    console.log("Campaign closed:", tx);
    
    // Verify campaign is inactive
    const campaign = await program.account.campaign.fetch(campaignPda);
    assert.equal(campaign.isActive, false);
  });

  it("Prevents buying from closed campaign", async () => {
    const usdcAmount = new anchor.BN(1_000_000); // 1 USDC
    
    const buyerTokenAccount = await getAssociatedTokenAddress(
      campaignTokenMint.publicKey,
      buyer.publicKey
    );
    
    try {
      await program.methods
        .buyPresale(usdcAmount)
        .accounts({
          campaign: campaignPda,
          campaignTokenMint: campaignTokenMint.publicKey,
          treasury,
          buyer: buyer.publicKey,
          buyerUsdcAccount,
          buyerTokenAccount,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
      
      assert.fail("Should have thrown CampaignInactive error");
    } catch (error) {
      assert.include(error.toString(), "CampaignInactive");
    }
  });
});

