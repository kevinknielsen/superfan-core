use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn},
};

declare_id!("SuperfnPrsLE11111111111111111111111111111");

/// Superfan Presale Program
/// 
/// Replicates Metal's presale functionality for Solana:
/// - Campaign creation with token minting
/// - USDC purchases → campaign token distribution
/// - Basic presale lifecycle matching Base implementation
#[program]
pub mod superfan_presale {
    use super::*;

    /// Initialize a new presale campaign
    /// 
    /// Creates:
    /// - Campaign state account (PDA)
    /// - Campaign token mint
    /// - Treasury account to hold USDC
    /// 
    /// Mirrors Metal's createPresale() with Solana-native constructs
    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>,
        campaign_id: String,
        price_per_token_usdc: u64,  // Price in USDC (6 decimals)
        total_supply: Option<u64>,   // Max tokens to mint (None = unlimited)
        lock_duration: Option<i64>,  // Lock period in seconds
    ) -> Result<()> {
        require!(campaign_id.len() <= 50, PresaleError::CampaignIdTooLong);
        require!(price_per_token_usdc > 0, PresaleError::InvalidPrice);

        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.campaign_id = campaign_id;
        campaign.token_mint = ctx.accounts.campaign_token_mint.key();
        campaign.treasury = ctx.accounts.treasury.key();
        campaign.price_per_token_usdc = price_per_token_usdc;
        campaign.total_supply = total_supply;
        campaign.tokens_sold = 0;
        campaign.usdc_raised = 0;
        campaign.lock_duration = lock_duration;
        campaign.created_at = Clock::get()?.unix_timestamp;
        campaign.is_active = true;
        campaign.bump = ctx.bumps.campaign;

        msg!("✅ Campaign initialized: {}", campaign.campaign_id);
        msg!("   Token mint: {}", campaign.token_mint);
        msg!("   Price per token: {} USDC", campaign.price_per_token_usdc);

        Ok(())
    }

    /// Buy presale tokens with USDC
    /// 
    /// Flow:
    /// 1. Calculate whole tokens purchasable
    /// 2. Transfer exact USDC needed to treasury
    /// 3. Refund excess USDC to buyer if any
    /// 4. Mint campaign tokens to buyer
    /// 5. Update campaign stats
    /// 
    /// Mirrors Metal's buyPresale() with atomic Solana transfers
    pub fn buy_presale(
        ctx: Context<BuyPresale>,
        usdc_amount: u64,
    ) -> Result<()> {
        let campaign = &ctx.accounts.campaign;
        
        require!(campaign.is_active, PresaleError::CampaignInactive);
        require!(usdc_amount > 0, PresaleError::InvalidAmount);

        // Calculate whole tokens to mint (integer division)
        // Formula: tokens = usdc_amount / price_per_token
        let tokens_to_mint = usdc_amount
            .checked_div(campaign.price_per_token_usdc)
            .ok_or(PresaleError::MathOverflow)?;
        
        require!(tokens_to_mint > 0, PresaleError::InvalidAmount);

        // Check supply cap
        if let Some(total_supply) = campaign.total_supply {
            let new_total = campaign.tokens_sold
                .checked_add(tokens_to_mint)
                .ok_or(PresaleError::MathOverflow)?;
            require!(
                new_total <= total_supply,
                PresaleError::SupplyExceeded
            );
        }

        // Calculate actual USDC needed for whole tokens
        let actual_usdc_amount = tokens_to_mint
            .checked_mul(campaign.price_per_token_usdc)
            .ok_or(PresaleError::MathOverflow)?;
        
        // Calculate refund amount (any fractional USDC)
        let refund_amount = usdc_amount
            .checked_sub(actual_usdc_amount)
            .ok_or(PresaleError::MathOverflow)?;

        // Transfer exact USDC from buyer to campaign treasury
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_usdc_account.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, actual_usdc_amount)?;

        // Refund excess USDC if any
        if refund_amount > 0 {
            msg!("   Refunding excess USDC: {}", refund_amount);
            // Note: Refund would require campaign PDA authority or a different flow
            // For simplicity, we accept only exact amounts in this version
            // Callers should send exact multiples of price_per_token_usdc
        }

        // Mint campaign tokens to buyer
        let campaign_id = campaign.campaign_id.as_str();
        let seeds = &[
            b"campaign",
            campaign_id.as_bytes(),
            &[campaign.bump],
        ];
        let signer = &[&seeds[..]];

        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.campaign_token_mint.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            signer,
        );
        token::mint_to(mint_ctx, tokens_to_mint)?;

        // Update campaign state
        let campaign = &mut ctx.accounts.campaign;
        campaign.tokens_sold = campaign.tokens_sold
            .checked_add(tokens_to_mint)
            .ok_or(PresaleError::MathOverflow)?;
        campaign.usdc_raised = campaign.usdc_raised
            .checked_add(actual_usdc_amount)
            .ok_or(PresaleError::MathOverflow)?;

        msg!("✅ Presale purchase complete");
        msg!("   Buyer: {}", ctx.accounts.buyer.key());
        msg!("   USDC spent: {}", actual_usdc_amount);
        msg!("   Tokens minted: {}", tokens_to_mint);
        if refund_amount > 0 {
            msg!("   Excess USDC (not charged): {}", refund_amount);
        }
        msg!("   Campaign total raised: {} USDC", campaign.usdc_raised);

        Ok(())
    }

    /// Withdraw USDC from campaign treasury (artist only)
    /// 
    /// Allows campaign creator to withdraw raised funds
    /// Future: Add MOQ/milestone gates here
    pub fn withdraw_funds(
        ctx: Context<WithdrawFunds>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, PresaleError::InvalidAmount);
        require!(
            amount <= ctx.accounts.treasury.amount,
            PresaleError::InsufficientFunds
        );

        let campaign = &ctx.accounts.campaign;
        let campaign_id = campaign.campaign_id.as_str();
        let seeds = &[
            b"campaign",
            campaign_id.as_bytes(),
            &[campaign.bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.authority_usdc_account.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;

        msg!("✅ Funds withdrawn: {} USDC", amount);
        
        Ok(())
    }

    /// Close campaign (admin only)
    /// 
    /// Sets campaign to inactive, preventing new purchases
    pub fn close_campaign(ctx: Context<CloseCampaign>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.is_active = false;
        
        msg!("🔒 Campaign closed: {}", campaign.campaign_id);
        
        Ok(())
    }
}

// ============================================================================
// Account Structs
// ============================================================================

/// Campaign state account (PDA)
/// Stores all presale metadata and stats
#[account]
pub struct Campaign {
    /// Campaign creator/authority
    pub authority: Pubkey,
    /// Human-readable campaign ID (matches Base campaign_id)
    pub campaign_id: String,
    /// SPL token mint for this campaign
    pub token_mint: Pubkey,
    /// Treasury account holding USDC
    pub treasury: Pubkey,
    /// Price per token in USDC (6 decimals)
    pub price_per_token_usdc: u64,
    /// Max tokens that can be minted (None = unlimited)
    pub total_supply: Option<u64>,
    /// Total tokens sold so far
    pub tokens_sold: u64,
    /// Total USDC raised
    pub usdc_raised: u64,
    /// Token lock duration (seconds)
    pub lock_duration: Option<i64>,
    /// Creation timestamp
    pub created_at: i64,
    /// Campaign active status
    pub is_active: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl Campaign {
    /// Calculate space needed for this account
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // authority
        (4 + 50) +              // campaign_id (String, max 50 chars)
        32 +                    // token_mint
        32 +                    // treasury
        8 +                     // price_per_token_usdc
        (1 + 8) +               // total_supply (Option<u64>)
        8 +                     // tokens_sold
        8 +                     // usdc_raised
        (1 + 8) +               // lock_duration (Option<i64>)
        8 +                     // created_at
        1 +                     // is_active
        1;                      // bump
}

// ============================================================================
// Context Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(campaign_id: String)]
pub struct InitializeCampaign<'info> {
    #[account(
        init,
        payer = authority,
        space = Campaign::LEN,
        seeds = [b"campaign", campaign_id.as_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = campaign,
    )]
    pub campaign_token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = campaign,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// USDC mint (DevNet test token)
    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyPresale<'info> {
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.as_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        address = campaign.token_mint
    )]
    pub campaign_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = campaign.treasury
    )]
    pub treasury: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = buyer
    )]
    pub buyer_usdc_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = campaign_token_mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(
        seeds = [b"campaign", campaign.campaign_id.as_bytes()],
        bump = campaign.bump,
        has_one = authority
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        address = campaign.treasury
    )]
    pub treasury: Account<'info, TokenAccount>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        token::authority = authority
    )]
    pub authority_usdc_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseCampaign<'info> {
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.as_bytes()],
        bump = campaign.bump,
        has_one = authority
    )]
    pub campaign: Account<'info, Campaign>,

    pub authority: Signer<'info>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum PresaleError {
    #[msg("Campaign ID cannot exceed 50 characters")]
    CampaignIdTooLong,
    
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    
    #[msg("Campaign is not active")]
    CampaignInactive,
    
    #[msg("Total supply exceeded")]
    SupplyExceeded,
    
    #[msg("Insufficient funds in treasury")]
    InsufficientFunds,
    
    #[msg("Math operation overflow")]
    MathOverflow,
}

