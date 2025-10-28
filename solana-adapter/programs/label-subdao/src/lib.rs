use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

declare_id!("LabelSubDAO1111111111111111111111111111111");

/// Label SubDAO - Layer 2 (Fan-Owned)
/// 
/// Labels are governed by token holders, not curators.
/// Token holders vote via futarchy on which artists to fund.
/// 
/// Flow:
/// 1. Artist submits proposal to label
/// 2. MetaDAO futarchy market created (label token holders trade)
/// 3. If pass > fail → Artist gets credit line
/// 4. Artist runs presale (superfan-presale program)
/// 5. Repayments → Label treasury → Token value ↑
#[program]
pub mod label_subdao {
    use super::*;

    /// Artist submits funding proposal
    /// 
    /// Creates proposal + MetaDAO futarchy market.
    /// Label token holders trade on artist success.
    pub fn submit_artist_proposal(
        ctx: Context<SubmitProposal>,
        artist_name: String,
        campaign_id: String,
        requested_amount: u64,
        campaign_description: String,
        revenue_projection: u64,
    ) -> Result<()> {
        require!(artist_name.len() <= 50, LabelError::NameTooLong);
        require!(campaign_id.len() <= 50, LabelError::IdTooLong);
        require!(requested_amount > 0, LabelError::InvalidAmount);
        require!(campaign_description.len() <= 500, LabelError::DescriptionTooLong);

        let label = &ctx.accounts.label;
        require!(label.is_active, LabelError::LabelInactive);

        // Verify label has sufficient uncommitted funds
        // Available = treasury balance - already committed amount
        let available_funds = ctx.accounts.label_treasury.amount
            .checked_sub(label.committed_amount)
            .ok_or(LabelError::MathOverflow)?;
        
        require!(
            available_funds >= requested_amount,
            LabelError::InsufficientLabelFunds
        );

        let proposal = &mut ctx.accounts.proposal;
        proposal.label = label.key();
        proposal.artist = ctx.accounts.artist.key();
        proposal.artist_name = artist_name.clone();
        proposal.campaign_id = campaign_id.clone();
        proposal.requested_amount = requested_amount;
        proposal.campaign_description = campaign_description;
        proposal.revenue_projection = revenue_projection;
        proposal.status = ArtistProposalStatus::Pending;
        proposal.submitted_at = Clock::get()?.unix_timestamp;
        proposal.bump = ctx.bumps.proposal;

        // TODO: CPI to MetaDAO Autocrat
        // Create futarchy market with label token holders as governance
        // proposal.metadao_proposal = metadao::autocrat::create_proposal(...)?;
        
        msg!("📝 Artist proposal submitted");
        msg!("   Artist: {}", artist_name);
        msg!("   Campaign: {}", campaign_id);
        msg!("   Requested: {} USDC", requested_amount);
        msg!("   Label token holders: vote via futarchy");

        Ok(())
    }

    /// Execute artist funding (after futarchy passes)
    /// 
    /// Creates credit line and allows artist to draw funds.
    /// Called automatically by MetaDAO if proposal passes.
    pub fn execute_artist_funding(
        ctx: Context<ExecuteFunding>,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(
            proposal.status == ArtistProposalStatus::Pending,
            LabelError::ProposalNotPending
        );

        // TODO: Verify MetaDAO proposal passed
        // require!(
        //     metadao::autocrat::get_status(proposal.metadao_proposal)? == Passed,
        //     LabelError::ProposalNotPassed
        // );

        let label = &mut ctx.accounts.label;
        
        // Create credit line
        let credit_line = &mut ctx.accounts.credit_line;
        credit_line.label = label.key();
        credit_line.proposal = proposal.key();
        credit_line.artist = proposal.artist;
        credit_line.campaign_id = proposal.campaign_id.clone();
        credit_line.credit_limit = proposal.requested_amount;
        credit_line.credit_used = 0;
        credit_line.credit_repaid = 0;
        credit_line.created_at = Clock::get()?.unix_timestamp;
        credit_line.is_active = true;
        credit_line.bump = ctx.bumps.credit_line;

        // Update proposal
        proposal.status = ArtistProposalStatus::Approved;
        proposal.approved_at = Some(Clock::get()?.unix_timestamp);
        proposal.credit_line = Some(credit_line.key());

        // Update label stats and commitments
        label.total_deployed = label.total_deployed
            .checked_add(proposal.requested_amount)
            .ok_or(LabelError::MathOverflow)?;
        
        // Increment committed amount (will be decremented when funds are drawn)
        label.committed_amount = label.committed_amount
            .checked_add(proposal.requested_amount)
            .ok_or(LabelError::MathOverflow)?;

        msg!("✅ Artist funded by token holder vote");
        msg!("   Artist: {}", proposal.artist_name);
        msg!("   Credit line: {} USDC", proposal.requested_amount);
        msg!("   Committed funds: {}", label.committed_amount);

        Ok(())
    }

    /// Draw from credit line (artist uses their credit)
    /// 
    /// Transfers USDC from label treasury to artist.
    /// Called when artist needs funds for production, marketing, etc.
    pub fn draw_credit(
        ctx: Context<DrawCredit>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, LabelError::InvalidAmount);

        let credit_line = &mut ctx.accounts.credit_line;
        require!(credit_line.is_active, LabelError::CreditLineInactive);

        let available_credit = credit_line.credit_limit
            .checked_sub(credit_line.credit_used)
            .ok_or(LabelError::MathOverflow)?;
        
        require!(
            amount <= available_credit,
            LabelError::InsufficientCredit
        );

        // Transfer from label treasury to artist
        let label = &mut ctx.accounts.label;
        let seeds = &[
            b"label-ext",
            label.name.as_bytes(),
            &[label.bump],
        ];
        let signer = &[&seeds[..]];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.label_treasury.to_account_info(),
                    to: ctx.accounts.artist_account.to_account_info(),
                    authority: label.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update credit line
        credit_line.credit_used = credit_line.credit_used
            .checked_add(amount)
            .ok_or(LabelError::MathOverflow)?;
        
        // Decrement committed amount as funds are now drawn
        label.committed_amount = label.committed_amount
            .checked_sub(amount)
            .ok_or(LabelError::MathOverflow)?;

        msg!("💳 Credit drawn");
        msg!("   Artist: {}", credit_line.artist);
        msg!("   Amount: {} USDC", amount);
        msg!("   Used: {}/{} USDC", credit_line.credit_used, credit_line.credit_limit);

        Ok(())
    }

    /// Repay credit line (from fan redemptions)
    /// 
    /// Artist repays credit as fans redeem rewards.
    /// When fully repaid, credit line closes.
    /// Repayment increases label treasury value → label token value ↑
    pub fn repay_credit(
        ctx: Context<RepayCredit>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, LabelError::InvalidAmount);

        let credit_line = &mut ctx.accounts.credit_line;
        require!(credit_line.is_active, LabelError::CreditLineInactive);

        let remaining_balance = credit_line.credit_used
            .checked_sub(credit_line.credit_repaid)
            .ok_or(LabelError::MathOverflow)?;
        
        let actual_repayment = amount.min(remaining_balance);

        // Transfer from artist to label treasury
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.artist_account.to_account_info(),
                    to: ctx.accounts.label_treasury.to_account_info(),
                    authority: ctx.accounts.artist.to_account_info(),
                },
            ),
            actual_repayment,
        )?;

        // Update credit line
        credit_line.credit_repaid = credit_line.credit_repaid
            .checked_add(actual_repayment)
            .ok_or(LabelError::MathOverflow)?;

        // Check if fully repaid
        if credit_line.credit_repaid >= credit_line.credit_used {
            credit_line.is_active = false;
            msg!("🎉 Credit line fully repaid!");
        }

        // Update label stats
        let label = &mut ctx.accounts.label;
        label.total_repaid = label.total_repaid
            .checked_add(actual_repayment)
            .ok_or(LabelError::MathOverflow)?;

        msg!("💰 Credit repayment received");
        msg!("   Artist: {}", credit_line.artist);
        msg!("   Amount: {} USDC", actual_repayment);
        msg!("   Treasury value increased → Label token value ↑");

        Ok(())
    }

    /// Settle label treasury with parent DAO
    /// 
    /// Transfers protocol fee back to Superfan DAO.
    /// Label token holders benefit from remaining treasury growth.
    pub fn settle_with_dao(
        ctx: Context<SettleWithDAO>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, LabelError::InvalidAmount);

        let label = &mut ctx.accounts.label;
        require!(label.is_active, LabelError::LabelInactive);

        // Verify label has sufficient funds
        require!(
            ctx.accounts.label_treasury.amount >= amount,
            LabelError::InsufficientLabelFunds
        );

        // Transfer USDC from label treasury to DAO treasury
        let seeds = &[
            b"label-ext",
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

        // TODO: CPI to superfan_dao::record_label_repayment
        // This would call the parent DAO to record this repayment on-chain
        // Example:
        // superfan_dao::cpi::record_label_repayment(
        //     CpiContext::new_with_signer(
        //         ctx.accounts.superfan_dao_program.to_account_info(),
        //         superfan_dao::cpi::accounts::RecordRepayment {
        //             dao: ctx.accounts.dao.to_account_info(),
        //             label: label.to_account_info(),
        //         },
        //         signer,
        //     ),
        //     amount,
        // )?;
        
        msg!("🔄 Settlement with DAO complete");
        msg!("   Label: {}", label.name);
        msg!("   Amount transferred: {} USDC", amount);

        Ok(())
    }
}

// ============================================================================
// Account Structs
// ============================================================================

/// External reference to Superfan DAO's Label struct
/// Used to link back to parent layer
#[account]
pub struct LabelExternal {
    /// Parent DAO
    pub dao: Pubkey,
    /// Label name
    pub name: String,
    /// Label governance token mint (fans own this)
    pub label_token_mint: Pubkey,
    /// Treasury
    pub treasury: Pubkey,
    /// Initial funding
    pub initial_funding: u64,
    /// Total deployed to artists
    pub total_deployed: u64,
    /// Total repaid
    pub total_repaid: u64,
    /// Funds committed to approved proposals (not yet drawn)
    pub committed_amount: u64,
    /// Active status
    pub is_active: bool,
    /// PDA bump
    pub bump: u8,
}

impl LabelExternal {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // dao
        (4 + 50) +              // name
        32 +                    // label_token_mint
        32 +                    // treasury
        8 +                     // initial_funding
        8 +                     // total_deployed
        8 +                     // total_repaid
        8 +                     // committed_amount
        1 +                     // is_active
        1;                      // bump
}

/// Artist funding proposal
/// Governed by label token holders via futarchy
#[account]
pub struct ArtistProposal {
    /// Parent label
    pub label: Pubkey,
    /// Artist wallet
    pub artist: Pubkey,
    /// Artist name
    pub artist_name: String,
    /// Campaign identifier
    pub campaign_id: String,
    /// Requested funding amount
    pub requested_amount: u64,
    /// Campaign description/pitch
    pub campaign_description: String,
    /// Revenue projection
    pub revenue_projection: u64,
    /// Proposal status
    pub status: ArtistProposalStatus,
    /// Submitted timestamp
    pub submitted_at: i64,
    /// Approved timestamp
    pub approved_at: Option<i64>,
    /// Created credit line (if approved)
    pub credit_line: Option<Pubkey>,
    /// MetaDAO proposal reference
    pub metadao_proposal: Option<Pubkey>,
    /// PDA bump
    pub bump: u8,
}

impl ArtistProposal {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // label
        32 +                    // artist
        (4 + 50) +              // artist_name
        (4 + 50) +              // campaign_id
        8 +                     // requested_amount
        (4 + 500) +             // campaign_description
        8 +                     // revenue_projection
        1 +                     // status
        8 +                     // submitted_at
        (1 + 8) +               // approved_at
        (1 + 32) +              // credit_line
        (1 + 32) +              // metadao_proposal
        1;                      // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ArtistProposalStatus {
    Pending,      // Futarchy market active
    Approved,     // Market decided yes, credit line created
    Rejected,     // Market decided no
    Active,       // Campaign is live
    Completed,    // Campaign completed, credit repaid
}

/// Artist credit line
#[account]
pub struct CreditLine {
    /// Parent label
    pub label: Pubkey,
    /// Original proposal
    pub proposal: Pubkey,
    /// Artist wallet
    pub artist: Pubkey,
    /// Campaign identifier
    pub campaign_id: String,
    /// Total credit limit
    pub credit_limit: u64,
    /// Credit used
    pub credit_used: u64,
    /// Credit repaid
    pub credit_repaid: u64,
    /// Created timestamp
    pub created_at: i64,
    /// Active status
    pub is_active: bool,
    /// PDA bump
    pub bump: u8,
}

impl CreditLine {
    pub const LEN: usize = 8 +  // discriminator
        32 +                    // label
        32 +                    // proposal
        32 +                    // artist
        (4 + 50) +              // campaign_id
        8 +                     // credit_limit
        8 +                     // credit_used
        8 +                     // credit_repaid
        8 +                     // created_at
        1 +                     // is_active
        1;                      // bump
}

// ============================================================================
// Context Structs
// ============================================================================

#[derive(Accounts)]
#[instruction(artist_name: String, campaign_id: String)]
pub struct SubmitProposal<'info> {
    #[account(
        seeds = [b"label-ext", label.name.as_bytes()],
        bump = label.bump
    )]
    pub label: Account<'info, LabelExternal>,

    #[account(
        address = label.treasury
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = artist,
        space = ArtistProposal::LEN,
        seeds = [b"proposal", label.key().as_ref(), campaign_id.as_bytes()],
        bump
    )]
    pub proposal: Account<'info, ArtistProposal>,

    #[account(mut)]
    pub artist: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteFunding<'info> {
    #[account(
        mut,
        seeds = [b"label-ext", label.name.as_bytes()],
        bump = label.bump
    )]
    pub label: Account<'info, LabelExternal>,

    #[account(
        mut,
        seeds = [b"proposal", label.key().as_ref(), proposal.campaign_id.as_bytes()],
        bump = proposal.bump,
        has_one = label
    )]
    pub proposal: Account<'info, ArtistProposal>,

    #[account(
        init,
        payer = payer,
        space = CreditLine::LEN,
        seeds = [b"credit", label.key().as_ref(), proposal.campaign_id.as_bytes()],
        bump
    )]
    pub credit_line: Account<'info, CreditLine>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DrawCredit<'info> {
    #[account(
        mut,
        seeds = [b"label-ext", label.name.as_bytes()],
        bump = label.bump
    )]
    pub label: Account<'info, LabelExternal>,

    #[account(
        mut,
        seeds = [b"credit", label.key().as_ref(), credit_line.campaign_id.as_bytes()],
        bump = credit_line.bump,
        has_one = label,
        has_one = artist
    )]
    pub credit_line: Account<'info, CreditLine>,

    #[account(
        mut,
        address = label.treasury
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = artist_account.owner == artist.key() @ LabelError::InvalidTokenAccountOwner
    )]
    pub artist_account: Account<'info, TokenAccount>,

    pub artist: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayCredit<'info> {
    #[account(
        mut,
        seeds = [b"label-ext", label.name.as_bytes()],
        bump = label.bump
    )]
    pub label: Account<'info, LabelExternal>,

    #[account(
        mut,
        seeds = [b"credit", label.key().as_ref(), credit_line.campaign_id.as_bytes()],
        bump = credit_line.bump,
        has_one = label,
        has_one = artist
    )]
    pub credit_line: Account<'info, CreditLine>,

    #[account(
        mut,
        constraint = artist_account.owner == artist.key() @ LabelError::InvalidTokenAccountOwner
    )]
    pub artist_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = label.treasury
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    pub artist: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleWithDAO<'info> {
    #[account(
        mut,
        seeds = [b"label-ext", label.name.as_bytes()],
        bump = label.bump
    )]
    pub label: Account<'info, LabelExternal>,

    #[account(
        mut,
        address = label.treasury
    )]
    pub label_treasury: Account<'info, TokenAccount>,

    /// Superfan DAO treasury (receives settlement)
    #[account(mut)]
    pub dao_treasury: Account<'info, TokenAccount>,

    /// Can be anyone - no gatekeeping
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum LabelError {
    #[msg("Name too long (max 50 characters)")]
    NameTooLong,
    
    #[msg("ID too long (max 50 characters)")]
    IdTooLong,
    
    #[msg("Description too long (max 500 characters)")]
    DescriptionTooLong,
    
    #[msg("Invalid amount")]
    InvalidAmount,
    
    #[msg("Label is not active")]
    LabelInactive,
    
    #[msg("Insufficient funds in label treasury")]
    InsufficientLabelFunds,
    
    #[msg("Proposal is not in pending status")]
    ProposalNotPending,
    
    #[msg("Proposal has not passed futarchy vote")]
    ProposalNotPassed,
    
    #[msg("Credit line is not active")]
    CreditLineInactive,
    
    #[msg("Insufficient credit available")]
    InsufficientCredit,
    
    #[msg("Math operation overflow")]
    MathOverflow,
    
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
}
