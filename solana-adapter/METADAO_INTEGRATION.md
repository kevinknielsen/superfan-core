# Superfan × MetaDAO Integration

> **Building the first consumer futarchy application for music**

## 🎯 Overview

Superfan integrates with MetaDAO's futarchy infrastructure to create a three-layer governance system for funding music labels and artists. This document explains how the programs work together and where MetaDAO's conditional vaults, AMM, and autocrat fit in.

---

## 🏗️ Two-Layer Architecture (Fan-Owned Labels)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Superfan DAO (superfan-dao program)               │
│  • Holds treasury in USDC                                   │
│  • Uses MetaDAO futarchy: "Which labels to fund?"           │
│  • Creates labels + issues label tokens to fans             │
│  • Pays 5-10% protocol fee to MetaDAO                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Funds approved labels
                     │ Mints label governance tokens
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Fan-Owned Labels (label-subdao program)           │
│  • Fans own label tokens (50% curator, 40% futarchy, 10% DAO)│
│  • Token holders govern via NESTED futarchy                  │
│  • Artists submit proposals → Token holders vote            │
│  • Credit lines created for passing proposals               │
│  • Repayments → Treasury → Token value ↑                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Artist Campaigns (superfan-presale program)        │   │
│  │  • Tokenized presales (USDC → campaign tokens)     │   │
│  │  • Self-repaying credit via fan redemptions        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 💡 Why Two Layers Is Better

**OLD (3 layers):** DAO → Label Curator → Artist → Fans  
❌ Curator is bottleneck  
❌ Fans only participate at artist level  
❌ No label ownership for fans

**NEW (2 layers):** DAO → Label Token Holders ← Fans  
✅ Fans own the label  
✅ Fans govern which artists get funded  
✅ Fans benefit from ALL artist success  
✅ No curator gatekeeping  
✅ **Double futarchy** (DAO level + Label level)

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

## 💰 Economics: Fan-Owned Label Model

### **Repayment Flow (Cleaner)**

```
Repayment Flow:
─────────────────────────────────────────────────────────

Fans redeem rewards → Artist repays
        │
        ▼
Label Treasury (Owned by token holders)
        │
        ├─ 90-95% → Stays in label treasury
        │             └─ Label token value ↑
        │             └─ All token holders benefit
        │
        └─ 5-10% → Superfan DAO Treasury
                      │
                      └─ 5-10% of that → MetaDAO Protocol Fee
```

### **Example:**

```
Artist repays: $10,000
└─ Label treasury: $9,500 (95%)
   └─ Treasury grows → $DELACOUR token backed by more USDC
   └─ All $DELACOUR holders benefit (fans who believed)
   
└─ Superfan DAO: $500 (5%)
   └─ Protocol fee to MetaDAO: $50 (10% of $500)
```

**Why This Works:**
- Fans own label tokens → direct benefit from artist success
- No curator taking 80% cut
- Treasury growth benefits ALL token holders
- Simple, transparent, fair

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

### **Phase 1: Program Architecture** ✅ (Current - SIMPLIFIED)
- [x] `superfan-dao` program with futarchy for labels
- [x] `label-subdao` program with futarchy for artists (NO CURATOR GATEKEEPING)
- [x] `superfan-presale` program for artist campaigns
- [x] Label token minting (50% curator, 40% futarchy winners, 10% DAO)
- [x] Removed curator approval bottleneck
- [ ] **TODO: Add MetaDAO CPIs to propose_label()**
- [ ] **TODO: Add MetaDAO CPIs to submit_artist_proposal()**
- [ ] **TODO: Add MetaDAO verification to execute_*_funding()**

### **Phase 2: MetaDAO Dependencies** 🔄 (Next)
- [ ] Add MetaDAO programs as Anchor dependencies
- [ ] Implement conditional vault CPIs (both layers)
- [ ] Implement AMM read operations (for TWAP)
- [ ] Implement autocrat proposal lifecycle (nested futarchy)

### **Phase 3: Client SDK** 📝 (After Phase 2)
- [ ] TypeScript client for Superfan DAO
- [ ] Label token holder dashboard
- [ ] MetaDAO market integration (read pass/fail prices)
- [ ] User deposit flow (conditional vaults - buy label tokens via futarchy)

### **Phase 4: Frontend UX** 🎨 (Final)
- [ ] Label proposal form (curators)
- [ ] Label futarchy market view (fans vote)
- [ ] Artist proposal form (artists)
- [ ] Artist futarchy market view (label token holders vote)
- [ ] Label token holder dashboard (portfolio view)
- [ ] Treasury value tracking

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

