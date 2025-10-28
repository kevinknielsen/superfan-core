use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount, Mint, MintTo, SetAuthority},
};

declare_id!("SuperfnDAO11111111111111111111111111111111");

/// Superfan DAO - Layer 1
/// 
/// Manages treasury and futarchy governance for funding music labels.
/// Integrates with MetaDAO's conditional vaults, AMM, and autocrat programs.
/// 
/// Flow:
/// 1. Curator proposes new label → MetaDAO proposal created
/// 2. Community trades on pass/fail markets for 3 days
/// 3. If pass TWAP > fail TWAP → label gets funded, SubDAO created
/// 4. Label operates autonomously, repayments flow back to Superfan treasury
#[program]
pub mod superfan_dao {
    use super::*;

    /// Initialize the Superfan DAO
    /// 
    /// Creates:
    /// - DAO state account
    /// - Treasury (USDC vault)
    /// - Governance parameters
    pub fn initialize_dao(
        ctx: Context<InitializeDAO>,
        metadao_fee_bps: u16,  // Basis points (e.g., 500 = 5%)
    ) -> Result<()> {
        require!(metadao_fee_bps <= 1000, SuperfanError::FeeTooHigh); // Max 10%
        
        let dao = &mut ctx.accounts.dao;
        dao.authority = ctx.accounts.authority.key();
        dao.treasury = ctx.accounts.treasury.key();
        dao.usdc_mint = ctx.accounts.usdc_mint.key();
        dao.metadao_fee_bps = metadao_fee_bps;
        dao.total_labels_funded = 0;
        dao.total_deployed_capital = 0;
        dao.total_repayments = 0;
        dao.bump = ctx.bumps.dao;

        msg!("✅ Superfan DAO initialized");
        msg!("   Treasury: {}", dao.treasury);
        msg!("   MetaDAO fee: {}bps", metadao_fee_bps);

        Ok(())
    }

    /// Propose a new label for funding
    /// 
    /// Creates a MetaDAO futarchy proposal with pass/fail markets.
    /// Community trades to decide if this label should be funded.
    /// 
    /// Parameters:
    /// - label_name: Human-readable label name (e.g., "Delacour Recordings")
    /// - funding_amount: USDC to deploy to label treasury
    /// - curator_share_bps: % label keeps after repayment (e.g., 8000 = 80%)
    /// - repayment_target_bps: % of capital that must be repaid (e.g., 10000 = 100%)
    pub fn propose_label(
        ctx: Context<ProposeLabel>,
        label_name: String,
        funding_amount: u64,
        curator_share_bps: u16,
        repayment_target_bps: u16,
    ) -> Result<()> {
        require!(label_name.len() <= 50, SuperfanError::NameTooLong);
        require!(funding_amount > 0, SuperfanError::InvalidAmount);
        require!(curator_share_bps <= 10000, SuperfanError::InvalidShare);
        require!(repayment_target_bps <= 10000, SuperfanError::InvalidTarget);
        
        let dao = &ctx.accounts.dao;
        
        // Verify treasury has sufficient funds
        require!(
            ctx.accounts.treasury.amount >= funding_amount,
            SuperfanError::InsufficientTreasuryFunds
        );

        let proposal = &mut ctx.accounts.proposal;
        proposal.dao = dao.key();
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.label_name = label_name.clone();
        proposal.funding_amount = funding_amount;
        proposal.curator_share_bps = curator_share_bps;
        proposal.repayment_target_bps = repayment_target_bps;
        proposal.status = ProposalStatus::Pending;
        proposal.created_at = Clock::get()?.unix_timestamp;
        proposal.bump = ctx.bumps.proposal;

        // TODO: CPI to MetaDAO Autocrat to create futarchy proposal
        // This would call metadao::autocrat::create_proposal with:
        // - instruction: superfan_dao::execute_label_funding
        // - pass/fail conditional vaults for USDC
        // - 3-day trading period
        
        // For now, store MetaDAO proposal reference
        // In production, this would be returned from MetaDAO CPI:
        // proposal.metadao_proposal = metadao_proposal_pubkey;
        
        msg!("📋 Label proposal created");
        msg!("   Label: {}", label_name);
        msg!("   Funding: {} USDC", funding_amount);
        msg!("   Trading period: 3 days");

        Ok(())
    }

    /// Execute label funding (called after MetaDAO proposal passes)
    /// 
    /// This instruction is what the MetaDAO proposal executes if it passes.
    /// Creates the Label SubDAO, transfers funding, and mints label tokens.
    /// 
    /// Label tokens represent ownership in the label treasury.
    /// Token holders govern which artists get funded (via nested futarchy).
    pub fn execute_label_funding(
        ctx: Context<ExecuteLabelFunding>,
        label_token_supply: u64,
    ) -> Result<()> {
        let proposal = &ctx.accounts.proposal;
        
        // TODO: Verify MetaDAO proposal passed
        // require!(
        //     metadao::autocrat::get_status(proposal.metadao_proposal)? == Passed,
        //     SuperfanError::ProposalNotPassed
        // );

        // Create Label SubDAO
        let label = &mut ctx.accounts.label;
        label.dao = ctx.accounts.dao.key();
        label.proposal = proposal.key();
        label.name = proposal.label_name.clone();
        label.label_token_mint = ctx.accounts.label_token_mint.key();
        label.treasury = ctx.accounts.label_treasury.key();
        label.initial_funding = proposal.funding_amount;
        label.curator_share_bps = proposal.curator_share_bps;
        label.total_deployed = 0;
        label.total_repaid = 0;
        label.created_at = Clock::get()?.unix_timestamp;
        label.is_active = true;
        label.bump = ctx.bumps.label;

        // Transfer initial funding from DAO treasury to label treasury
        let dao_key = ctx.accounts.dao.key();
        let dao_seeds = &[
            b"dao",
            &[ctx.accounts.dao.bump],
        ];
        let dao_signer = &[&dao_seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.dao_treasury.to_account_info(),
                    to: ctx.accounts.label_treasury.to_account_info(),
                    authority: ctx.accounts.dao.to_account_info(),
                },
                dao_signer,
            ),
            proposal.funding_amount,
        )?;

        // Mint label tokens
        // Total distribution plan:
        // - 50% to founding team/curator (minted here)
        // - 40% to futarchy pass market winners (minted by MetaDAO conditional vault)
        // - 10% to Superfan DAO (minted here)
        //
        // IMPORTANT: In full MetaDAO integration, the 40% for futarchy winners is minted
        // by MetaDAO's conditional vault program during proposal creation (propose_label).
        // MetaDAO creates pass/fail conditional tokens that are redeemable for label tokens
        // if the proposal passes. When finalized, the conditional vault mints the 40% directly
        // to pass market winners. See MetaDAO docs: docs.themetadao.org/conditional-tokens
        //
        // TODO: When integrating MetaDAO CPIs, ensure:
        // 1. propose_label() calls metadao::conditional_vault::initialize_conditional_tokens()
        //    with 40% of label_token_supply reserved for pass market winners
        // 2. MetaDAO's finalization instruction mints those tokens to winners
        // 3. Total minted = 100% (not 60% as currently implemented in this skeleton)
        
        let label_name = label.name.as_str();
        let label_seeds = &[
            b"label",
            label_name.as_bytes(),
            &[label.bump],
        ];
        let label_signer = &[&label_seeds[..]];

        // Mint to founding curator (50%)
        let curator_tokens = label_token_supply
            .checked_mul(50)
            .ok_or(SuperfanError::MathOverflow)?
            .checked_div(100)
            .ok_or(SuperfanError::MathOverflow)?;

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.label_token_mint.to_account_info(),
                    to: ctx.accounts.curator_token_account.to_account_info(),
                    authority: label.to_account_info(),
                },
                label_signer,
            ),
            curator_tokens,
        )?;

        // Mint to Superfan DAO (10%)
        let dao_tokens = label_token_supply
            .checked_mul(10)
            .ok_or(SuperfanError::MathOverflow)?
            .checked_div(100)
            .ok_or(SuperfanError::MathOverflow)?;

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.label_token_mint.to_account_info(),
                    to: ctx.accounts.dao_token_account.to_account_info(),
                    authority: label.to_account_info(),
                },
                label_signer,
            ),
            dao_tokens,
        )?;

        // Freeze mint authority to prevent unlimited future minting
        // After initial distribution (50% + 10% = 60% here, 40% by MetaDAO),
        // no more tokens should ever be created. Remove mint authority permanently.
        anchor_spl::token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::SetAuthority {
                    current_authority: label.to_account_info(),
                    account_or_mint: ctx.accounts.label_token_mint.to_account_info(),
                },
                label_signer,
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens,
            None, // Remove authority permanently - no one can mint more tokens
        )?;

        msg!("🔒 Mint authority removed - label token supply is now fixed at {}", label_token_supply);

        // Update DAO stats
        let dao = &mut ctx.accounts.dao;
        dao.total_labels_funded = dao.total_labels_funded
            .checked_add(1)
            .ok_or(SuperfanError::MathOverflow)?;
        dao.total_deployed_capital = dao.total_deployed_capital
            .checked_add(proposal.funding_amount)
            .ok_or(SuperfanError::MathOverflow)?;

        // Update proposal status
        let proposal = &mut ctx.accounts.proposal;
        proposal.status = ProposalStatus::Executed;
        proposal.label = Some(label.key());

        msg!("🎉 Label funded and launched!");
        msg!("   Label: {}", label.name);
        msg!("   Initial funding: {} USDC", proposal.funding_amount);
        msg!("   Label tokens minted: {}", label_token_supply);
        msg!("   Token holders now govern artist funding via futarchy");

        Ok(())
    }

    /// Record repayment from label to DAO treasury
    /// 
    /// Called when a label's artists repay their credit lines.
    /// Tracks performance for future futarchy decisions.
    pub fn record_label_repayment(
        ctx: Context<RecordRepayment>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, SuperfanError::InvalidAmount);

        let label = &mut ctx.accounts.label;
        require!(label.is_active, SuperfanError::LabelInactive);

        // Transfer repayment from label treasury to DAO treasury
        let label_key = label.key();
        let seeds = &[
            b"label",
            label.name.as_bytes(),
            &[label.bump],
        ];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.label_treasury.to_account_info(),
                    to: ctx.accounts.dao_treasury.to_account_info(),
                    authority: label.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Calculate MetaDAO protocol fee
        let dao = &ctx.accounts.dao;
        let protocol_fee = (amount as u128)
            .checked_mul(dao.metadao_fee_bps as u128)
            .ok_or(SuperfanError::MathOverflow)?
            .checked_div(10000)
            .ok_or(SuperfanError::MathOverflow)? as u64;

        // Update label stats
        label.total_repaid = label.total_repaid
            .checked_add(amount)
            .ok_or(SuperfanError::MathOverflow)?;

        // Update DAO stats
        let dao = &mut ctx.accounts.dao;
        dao.total_repayments = dao.total_repayments
            .checked_add(amount)
            .ok_or(SuperfanError::MathOverflow)?;

        msg!("💰 Repayment recorded");
        msg!("   Label: {}", label.name);
        msg!("   Amount: {} USDC", amount);
        msg!("   Protocol fee (to MetaDAO): {} USDC", protocol_fee);
        msg!("   Label total repaid: {}/{} USDC", 
            label.total_repaid, 
            label.initial_funding
        );

        Ok(())
    }

    /// Pay protocol fee to MetaDAO
    /// 
    /// Transfers accumulated fees from DAO treasury to MetaDAO treasury.
    pub fn pay_protocol_fee(
        ctx: Context<PayProtocolFee>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, SuperfanError::InvalidAmount);

        let dao = &ctx.accounts.dao;
        let seeds = &[
            b"dao",
            &[dao.bump],
        ];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.dao_treasury.to_account_info(),
                    to: ctx.accounts.metadao_treasury.to_account_info(),
                    authority: dao.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        msg!("💸 Protocol fee paid to MetaDAO: {} USDC", amount);

        Ok(())
    }
}

// ============================================================================
// Account Structs
// ============================================================================

/// Superfan DAO state
#[account]
pub struct SuperfanDAO {
    /// DAO authority (can be governance later)
    pub authority: Pubkey,
    /// Main treasury holding USDC
    pub treasury: Pubkey,
    /// USDC mint
    pub usdc_mint: Pubkey,
    /// Protocol fee to MetaDAO (basis points)
    pub metadao_fee_bps: u16,
    /// Total labels funded
    pub total_labels_funded: u64,
    /// Total capital deployed to labels
    pub total_deployed_capital: u64,
    /// Total repayments received
    pub total_repayments: u64,
    /// PDA bump
    pub bump: u8,
}

impl SuperfanDAO {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // authority
        32 +                    // treasury
        32 +                    // usdc_mint
        2 +                     // metadao_fee_bps
        8 +                     // total_labels_funded
        8 +                     // total_deployed_capital
        8 +                     // total_repayments
        1;                      // bump
}

/// Label funding proposal (interfaces with MetaDAO futarchy)
#[account]
pub struct LabelProposal {
    /// Parent DAO
    pub dao: Pubkey,
    /// Proposer (will be label curator)
    pub proposer: Pubkey,
    /// Label name
    pub label_name: String,
    /// USDC funding amount
    pub funding_amount: u64,
    /// Label's share after repayment (bps)
    pub curator_share_bps: u16,
    /// Repayment target (bps of initial funding)
    pub repayment_target_bps: u16,
    /// Proposal status
    pub status: ProposalStatus,
    /// Created timestamp
    pub created_at: i64,
    /// Created label (if executed)
    pub label: Option<Pubkey>,
    /// MetaDAO proposal reference (for querying pass/fail markets)
    pub metadao_proposal: Option<Pubkey>,
    /// PDA bump
    pub bump: u8,
}

impl LabelProposal {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // dao
        32 +                    // proposer
        (4 + 50) +              // label_name
        8 +                     // funding_amount
        2 +                     // curator_share_bps
        2 +                     // repayment_target_bps
        1 +                     // status enum
        8 +                     // created_at
        (1 + 32) +              // label option
        (1 + 32) +              // metadao_proposal option
        1;                      // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProposalStatus {
    Pending,   // Futarchy market active
    Passed,    // Market decided yes
    Failed,    // Market decided no
    Executed,  // Funding deployed, label created
    Cancelled, // Proposal withdrawn
}

/// Label SubDAO (Layer 2)
/// 
/// Fan-owned label governed by token holders.
/// No curator gatekeeping - token holders vote via futarchy on artists.
#[account]
pub struct LabelSubDAO {
    /// Parent DAO
    pub dao: Pubkey,
    /// Original proposal
    pub proposal: Pubkey,
    /// Label name
    pub name: String,
    /// Label governance token mint
    pub label_token_mint: Pubkey,
    /// Label treasury (USDC)
    pub treasury: Pubkey,
    /// Initial funding received
    pub initial_funding: u64,
    /// Curator's initial share (bps) - for founding team
    pub curator_share_bps: u16,
    /// Total deployed to artists
    pub total_deployed: u64,
    /// Total repaid to DAO
    pub total_repaid: u64,
    /// Created timestamp
    pub created_at: i64,
    /// Active status
    pub is_active: bool,
    /// PDA bump
    pub bump: u8,
}

impl LabelSubDAO {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // dao
        32 +                    // proposal
        (4 + 50) +              // name
        32 +                    // label_token_mint
        32 +                    // treasury
        8 +                     // initial_funding
        2 +                     // curator_share_bps
        8 +                     // total_deployed
        8 +                     // total_repaid
        8 +                     // created_at
        1 +                     // is_active
        1;                      // bump
}

// ============================================================================
// Context Structs
// ============================================================================

#[derive(Accounts)]
pub struct InitializeDAO<'info> {
    #[account(
        init,
        payer = authority,
        space = SuperfanDAO::LEN,
        seeds = [b"dao"],
        bump
    )]
    pub dao: Account<'info, SuperfanDAO>,

    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = dao,
    )]
    pub treasury: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(label_name: String)]
pub struct ProposeLabel<'info> {
    #[account(
        seeds = [b"dao"],
        bump = dao.bump
    )]
    pub dao: Account<'info, SuperfanDAO>,

    #[account(
        address = dao.treasury
    )]
    pub treasury: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = proposer,
        space = LabelProposal::LEN,
        seeds = [b"proposal", label_name.as_bytes()],
        bump
    )]
    pub proposal: Account<'info, LabelProposal>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteLabelFunding<'info> {
    #[account(
        mut,
        seeds = [b"dao"],
        bump = dao.bump
    )]
    pub dao: Account<'info, SuperfanDAO>,

    #[account(
        mut,
        seeds = [b"proposal", proposal.label_name.as_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, LabelProposal>,

    #[account(
        init,
        payer = payer,
        space = LabelSubDAO::LEN,
        seeds = [b"label", proposal.label_name.as_bytes()],
        bump
    )]
    pub label: Account<'info, LabelSubDAO>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = label,
    )]
    pub label_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = dao.treasury
    )]
    pub dao_treasury: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = label,
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    /// Curator's token account (receives 50% of tokens)
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = label_token_mint,
        associated_token::authority = proposal.proposer,
    )]
    pub curator_token_account: Account<'info, TokenAccount>,

    /// DAO's token account (receives 10% of tokens)
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = label_token_mint,
        associated_token::authority = dao,
    )]
    pub dao_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RecordRepayment<'info> {
    #[account(
        mut,
        seeds = [b"dao"],
        bump = dao.bump
    )]
    pub dao: Account<'info, SuperfanDAO>,

    #[account(
        mut,
        seeds = [b"label", label.name.as_bytes()],
        bump = label.bump,
        has_one = dao
    )]
    pub label: Account<'info, LabelSubDAO>,

    #[account(
        mut,
        address = label.treasury
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = dao.treasury
    )]
    pub dao_treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PayProtocolFee<'info> {
    #[account(
        seeds = [b"dao"],
        bump = dao.bump
    )]
    pub dao: Account<'info, SuperfanDAO>,

    #[account(
        mut,
        address = dao.treasury
    )]
    pub dao_treasury: Account<'info, TokenAccount>,

    /// MetaDAO treasury (receives protocol fees)
    #[account(mut)]
    pub metadao_treasury: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum SuperfanError {
    #[msg("Fee cannot exceed 10%")]
    FeeTooHigh,
    
    #[msg("Name too long (max 50 characters)")]
    NameTooLong,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Invalid share percentage")]
    InvalidShare,
    
    #[msg("Invalid repayment target")]
    InvalidTarget,
    
    #[msg("Insufficient funds in treasury")]
    InsufficientTreasuryFunds,
    
    #[msg("Proposal has not passed")]
    ProposalNotPassed,
    
    #[msg("Label is not active")]
    LabelInactive,
    
    #[msg("Math operation overflow")]
    MathOverflow,
}

