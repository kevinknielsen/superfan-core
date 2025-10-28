# Superfan × MetaDAO Integration

> **Building the first consumer futarchy application for music**

## 🎯 Overview

Superfan integrates with MetaDAO's futarchy infrastructure to create a three-layer governance system for funding music labels and artists. This document explains how the programs work together and where MetaDAO's conditional vaults, AMM, and autocrat fit in.

---

## 🏗️ Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Superfan DAO (superfan-dao program)               │
│  • Holds treasury in USDC                                   │
│  • Uses MetaDAO futarchy for label funding decisions        │
│  • Pays 5-10% protocol fee to MetaDAO                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Funds approved labels
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Label SubDAOs (label-subdao program)              │
│  • Operate autonomously with own treasury                   │
│  • Artists submit funding proposals                         │
│  • Curators approve/reject proposals                        │
│  • Manage credit lines and repayments                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Funds approved artists
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Artist Campaigns (superfan-presale program)       │
│  • Tokenized presales (USDC → campaign tokens)             │
│  • Treasury escrow for funds                                │
│  • Self-repaying credit via fan redemptions                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 MetaDAO Integration Points

### **1. Label Funding Proposals (Layer 1)**

When a curator wants to launch a new label, they submit a proposal via Superfan DAO. This triggers MetaDAO's futarchy system:

#### **Current Flow (Placeholder):**
```rust
// superfan-dao/src/lib.rs - propose_label()

pub fn propose_label(
    ctx: Context<ProposeLabel>,
    label_name: String,
    funding_amount: u64,
    // ...
) -> Result<()> {
    // Store proposal
    let proposal = &mut ctx.accounts.proposal;
    proposal.label_name = label_name.clone();
    proposal.funding_amount = funding_amount;
    
    // TODO: CPI to MetaDAO Autocrat
    // proposal.metadao_proposal = ...
    
    Ok(())
}
```

#### **With MetaDAO Integration:**
```rust
use metadao::{
    autocrat,
    conditional_vault,
    amm,
};

pub fn propose_label(
    ctx: Context<ProposeLabel>,
    label_name: String,
    funding_amount: u64,
    curator_share_bps: u16,
) -> Result<()> {
    // 1. Create MetaDAO proposal
    let metadao_proposal = autocrat::cpi::create_proposal(
        CpiContext::new(
            ctx.accounts.autocrat_program.to_account_info(),
            autocrat::cpi::accounts::CreateProposal {
                dao: ctx.accounts.superfan_dao.to_account_info(),
                proposer: ctx.accounts.proposer.to_account_info(),
                // ... MetaDAO required accounts
            }
        ),
        autocrat::ProposalParams {
            // The instruction to execute if proposal passes
            instruction: create_execute_label_funding_ix(
                ctx.accounts.superfan_dao.key(),
                proposal_key,
                funding_amount
            ),
            trading_period_seconds: 3 * 24 * 60 * 60, // 3 days
        }
    )?;
    
    // 2. MetaDAO automatically creates:
    //    - Conditional vaults (pass/fail) for USDC
    //    - AMM with pass/fail markets
    //    - TWAP oracle tracking
    
    // 3. Store Superfan-specific metadata
    let proposal = &mut ctx.accounts.proposal;
    proposal.dao = ctx.accounts.superfan_dao.key();
    proposal.label_name = label_name.clone();
    proposal.funding_amount = funding_amount;
    proposal.metadao_proposal = Some(metadao_proposal.key());
    proposal.pass_market = Some(metadao_proposal.pass_market);
    proposal.fail_market = Some(metadao_proposal.fail_market);
    proposal.status = ProposalStatus::Pending;
    
    msg!("📋 Label proposal created");
    msg!("   Trade at: pass_market={}, fail_market={}", 
        metadao_proposal.pass_market,
        metadao_proposal.fail_market
    );
    
    Ok(())
}
```

#### **What MetaDAO Provides:**
- ✅ **Conditional Vaults**: Community deposits USDC, gets conditional-on-pass or conditional-on-fail tokens
- ✅ **AMM Markets**: Users trade pass/fail tokens, revealing belief about label success
- ✅ **TWAP Oracle**: Manipulation-resistant price aggregation
- ✅ **Auto-Finalization**: After 3 days, proposal passes if pass_twap > fail_twap

---

### **2. Proposal Execution (Layer 1 → Layer 2)**

After the 3-day trading period, MetaDAO finalizes the proposal:

```rust
// superfan-dao/src/lib.rs - execute_label_funding()

pub fn execute_label_funding(
    ctx: Context<ExecuteLabelFunding>,
) -> Result<()> {
    let proposal = &ctx.accounts.proposal;
    
    // 1. Verify MetaDAO proposal passed
    let metadao_proposal = autocrat::get_proposal(
        proposal.metadao_proposal.unwrap()
    )?;
    
    require!(
        metadao_proposal.status == autocrat::ProposalStatus::Passed,
        SuperfanError::ProposalNotPassed
    );
    
    // 2. MetaDAO has already:
    //    - Finalized pass conditional vault (believers get USDC + rewards)
    //    - Reverted fail conditional vault (non-believers get USDC back)
    
    // 3. Create Label SubDAO with approved funding
    let label = &mut ctx.accounts.label;
    label.name = proposal.label_name.clone();
    label.initial_funding = proposal.funding_amount;
    // ... initialize label
    
    // 4. Transfer funds from DAO treasury to Label treasury
    transfer_tokens(
        ctx.accounts.dao_treasury,
        ctx.accounts.label_treasury,
        proposal.funding_amount
    )?;
    
    msg!("🎉 Label funded: {} USDC", proposal.funding_amount);
    
    Ok(())
}
```

---

### **3. User Experience: Trading on Label Success**

#### **For Community Members:**

**What they see:**
```
🎵 New Label Proposal: Delacour Recordings
   Requested: $50,000
   Curator: @delacour_music
   Vision: "Championing indie electronic producers"
   
   Market Prediction:
   ✅ 63% believe this label will succeed
   ❌ 37% believe it will not
   
   [Back This Label] [Trade Prediction]
```

**What's happening behind the scenes:**
```typescript
// User clicks "Back This Label"
await metadao.conditionalVault.deposit({
  vault: proposal.pass_vault,
  amount: 100_000_000, // $100 USDC
  user: userWallet
});

// User receives conditional-on-pass tokens
// Can trade these on MetaDAO's AMM if they want to adjust position
```

#### **For Label Curators:**

**What they see:**
```
📊 Your Label Proposal Status
   
   Delacour Recordings
   Funding: $50,000 | Status: Active Trading
   
   Community Belief: 63% Pass | 37% Fail
   Time Remaining: 1d 6h 23m
   
   Top Supporters:
   • alice.eth: $1,000 (Pass)
   • bob.sol: $500 (Pass)
   • charlie.base: $200 (Fail)
```

---

## 💰 Economics: Option A (Treasury Partnership)

### **Revenue Share Model**

```
Repayment Flow:
─────────────────────────────────────────────────────────

Artist repays credit
        │
        ▼
Label Treasury (Layer 2)
        │
        ├─ 80-90% → Label keeps (curator share)
        │
        └─ 10-20% → Superfan DAO Treasury
                           │
                           ├─ 90-95% → Superfan keeps
                           │
                           └─ 5-10% → MetaDAO Protocol Fee
```

### **Example:**

```
Artist repays: $10,000
└─ Label keeps: $8,000 (80%)
└─ Superfan receives: $2,000 (20%)
   └─ Superfan keeps: $1,800 (90%)
   └─ MetaDAO receives: $200 (10%) ← Protocol fee
```

Implemented in `superfan-dao/src/lib.rs`:

```rust
pub fn record_label_repayment(
    ctx: Context<RecordRepayment>,
    amount: u64,
) -> Result<()> {
    // Transfer from label to DAO
    transfer_tokens(/* ... */)?;
    
    // Calculate MetaDAO fee
    let dao = &ctx.accounts.dao;
    let protocol_fee = (amount as u128)
        .checked_mul(dao.metadao_fee_bps as u128) // e.g., 500 bps = 5%
        .unwrap()
        .checked_div(10000)
        .unwrap() as u64;
    
    msg!("Protocol fee to MetaDAO: {} USDC", protocol_fee);
    
    Ok(())
}
```

---

## 🚀 Initial Funding: Token Launch on MetaDAO

Superfan will bootstrap its treasury via a **token launch on MetaDAO's platform**:

### **Launch Flow:**

1. **Create $SUPERFAN token** on Solana
2. **Use MetaDAO's token launch infrastructure**
   - Bonding curve or fixed-price sale
   - Proceeds go to Superfan DAO treasury (USDC)
3. **DAO treasury is now funded** to begin financing labels

### **Example Launch:**

```
$SUPERFAN Token Launch
─────────────────────────
Supply: 100,000,000 $SUPERFAN
Price: $0.10 per token
Raise Target: $1,000,000 USDC

Proceeds:
• $950,000 → Superfan DAO Treasury (95%)
• $50,000 → MetaDAO Protocol Fee (5%)

Superfan DAO can now fund 10-20 labels @ $50k each
```

---

## 🔧 Implementation Checklist

### **Phase 1: Program Integration** ✅ (Current)
- [x] `superfan-dao` program with proposal system
- [x] `label-subdao` program with artist credit lines
- [x] `superfan-presale` program for artist campaigns
- [ ] **TODO: Add MetaDAO CPIs to propose_label()**
- [ ] **TODO: Add MetaDAO verification to execute_label_funding()**

### **Phase 2: MetaDAO Dependencies** 🔄 (Next)
- [ ] Add MetaDAO programs as Anchor dependencies
- [ ] Implement conditional vault CPIs
- [ ] Implement AMM read operations (for TWAP)
- [ ] Implement autocrat proposal lifecycle

### **Phase 3: Client SDK** 📝 (After Phase 2)
- [ ] TypeScript client for Superfan DAO
- [ ] MetaDAO market integration (read pass/fail prices)
- [ ] User deposit flow (conditional vaults)
- [ ] Curator dashboard (proposal status)

### **Phase 4: Frontend UX** 🎨 (Final)
- [ ] Proposal creation form
- [ ] Live market view (pass/fail %)
- [ ] Trading interface
- [ ] Label dashboard
- [ ] Artist proposal flow

---

## 📚 MetaDAO Resources

### **Documentation:**
- **MetaDAO Docs**: https://docs.themetadao.org/
- **Conditional Vaults**: https://docs.themetadao.org/conditional-vaults
- **AMM (OpenbookTWAP)**: https://docs.themetadao.org/amm
- **Autocrat**: https://docs.themetadao.org/autocrat

### **Program IDs (DevNet):**
```rust
// TODO: Get actual MetaDAO DevNet program IDs
pub const METADAO_CONDITIONAL_VAULT: Pubkey = ...;
pub const METADAO_AMM: Pubkey = ...;
pub const METADAO_AUTOCRAT: Pubkey = ...;
```

### **Example CPIs:**
See MetaDAO's example integrations:
- https://github.com/metadaoproject/futarchy/examples

---

## 🤝 Partnership Benefits

### **For Superfan:**
- ✅ Battle-tested futarchy infrastructure
- ✅ Instant credibility ("Built on MetaDAO")
- ✅ Shared liquidity (MetaDAO traders participate)
- ✅ 3-week integration vs. 3-month rebuild

### **For MetaDAO:**
- ✅ First consumer-facing use case
- ✅ Music industry validation (multi-billion TAM)
- ✅ UX innovation (crypto-silent futarchy)
- ✅ Protocol fee revenue from Superfan treasury
- ✅ Case study for future vertical apps

---

## 🎯 Next Steps

1. **Connect with MetaDAO team** - Discuss partnership structure
2. **Add MetaDAO dependencies** - Import programs as Anchor deps
3. **Implement CPIs** - propose_label() → autocrat::create_proposal()
4. **Build TypeScript SDK** - Wrap MetaDAO + Superfan programs
5. **Launch pilot proposal** - Test with real futarchy markets on DevNet

---

**Ready to build the first consumer futarchy application. Let's turn belief into capital. 🎵**

