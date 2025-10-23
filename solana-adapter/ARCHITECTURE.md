# Architecture: Superfan Solana Adapter

Deep dive into the technical design and implementation details.

## 🎯 Design Goals

1. **Functional Parity**: Replicate Metal's presale flow with Solana primitives
2. **Zero-Crypto UX**: Abstract blockchain complexity via Privy
3. **Security**: Leverage Solana's account model for safe escrow
4. **Composability**: Design for future DeFi integrations
5. **Maintainability**: Mirror Base contract patterns where possible

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│
│  │  Privy Auth     │  │  React UI       │  │  Presale     ││
│  │  (Solana)       │  │  Components     │  │  Banner      ││
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘│
└───────────┼─────────────────────┼───────────────────┼────────┘
            │                     │                   │
            └─────────────────────┼───────────────────┘
                                  │
                    ┌─────────────▼────────────┐
                    │   API Routes (Next.js)   │
                    │  /api/presale/buy        │
                    │  /api/presale/stats      │
                    └─────────────┬────────────┘
                                  │
                    ┌─────────────▼────────────┐
                    │  Solana Adapter Client   │
                    │  (TypeScript SDK)        │
                    └─────────────┬────────────┘
                                  │
                    ┌─────────────▼────────────┐
                    │   @solana/web3.js        │
                    │   @coral-xyz/anchor      │
                    └─────────────┬────────────┘
                                  │
                                  │ RPC
                                  │
┌─────────────────────────────────▼─────────────────────────────┐
│                      Solana Runtime                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │           Superfan Presale Program (Rust)                │ │
│  │                                                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │ │
│  │  │  Campaign   │  │    SPL      │  │   USDC      │    │ │
│  │  │  State PDA  │  │ Token Mint  │  │  Treasury   │    │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘    │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## 🔐 On-Chain Architecture

### Account Model

```
Campaign PDA
├── Authority: Pubkey        // Campaign creator
├── Campaign ID: String      // "artist-presale-2024"
├── Token Mint: Pubkey       // SPL token for campaign
├── Treasury: Pubkey         // USDC escrow account
├── Price: u64               // USDC per token (6 decimals)
├── Total Supply: Option<u64> // Max tokens
├── Tokens Sold: u64         // Current sold
├── USDC Raised: u64         // Current funding
├── Is Active: bool          // Campaign status
└── Bump: u8                 // PDA bump seed

Campaign Token Mint (SPL Token)
├── Mint Authority: Campaign PDA
├── Decimals: 6
└── Supply: Dynamic

Treasury (Token Account)
├── Mint: USDC
├── Owner: Campaign PDA
└── Balance: USDC raised
```

### PDA Derivation

```rust
// Campaign PDA
seeds = [
  b"campaign",
  campaign_id.as_bytes()
]

// Example:
// campaign_id = "artist-presale-2024"
// PDA = findProgramAddress([
//   "campaign",
//   "artist-presale-2024"
// ])
```

**Benefits:**
- Deterministic addresses
- No collisions (unique per campaign_id)
- Authority derived from program logic

### Token Flow

```
                    buy_presale(100 USDC)
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌─────────┐      ┌─────────┐     ┌─────────┐
    │  Buyer  │      │Campaign │     │ Buyer   │
    │  USDC   │─────▶│Treasury │     │Campaign │
    │ Account │      │ (PDA)   │     │ Tokens  │
    └─────────┘      └─────────┘     └─────────┘
                           │                ▲
                           │                │
                           └────────────────┘
                         mint_to(66.67 tokens)
                         (100 USDC / 1.5 price)
```

**Transaction is atomic:**
- USDC transfer succeeds → token mint succeeds
- Either fails → entire transaction reverts

## 🔄 Instruction Flow

### 1. `initialize_campaign`

```
Signer: Artist Wallet
────────────────────────────────────────────────
Accounts Created:
  1. Campaign PDA (new)
  2. Campaign Token Mint (new)
  3. Treasury Token Account (new, owned by Campaign PDA)

State Changes:
  - Campaign initialized with metadata
  - Token mint created (authority = Campaign PDA)
  - Treasury ready to receive USDC

Cost: ~0.01 SOL
```

### 2. `buy_presale`

```
Signer: Fan Wallet
────────────────────────────────────────────────
Pre-flight Checks:
  ✓ Campaign is active
  ✓ USDC amount > 0
  ✓ Supply not exceeded
  ✓ Buyer has sufficient USDC

Transfers:
  1. USDC: Buyer → Treasury (token::transfer)
  2. Tokens: Mint → Buyer (token::mint_to)

State Changes:
  - campaign.tokens_sold += tokens_minted
  - campaign.usdc_raised += usdc_spent

Cost: ~0.00002 SOL
```

### 3. `withdraw_funds`

```
Signer: Artist Wallet (must be campaign.authority)
────────────────────────────────────────────────
Pre-flight Checks:
  ✓ Caller is campaign authority
  ✓ Amount ≤ treasury balance

Transfer:
  USDC: Treasury → Artist (token::transfer)
  Signed by Campaign PDA (using seeds)

State Changes:
  - None (treasury balance decreases naturally)

Cost: ~0.00001 SOL
```

## 🔒 Security Model

### Authority Control

```rust
// Only campaign creator can withdraw
#[account(
  has_one = authority  // Enforces authority == signer
)]
pub campaign: Account<'info, Campaign>,

pub authority: Signer<'info>,
```

### Supply Caps

```rust
// Prevent over-minting
if let Some(total_supply) = campaign.total_supply {
  let new_total = campaign.tokens_sold + tokens_to_mint;
  require!(new_total <= total_supply, SupplyExceeded);
}
```

### Overflow Protection

```rust
// All math uses checked operations
campaign.tokens_sold = campaign.tokens_sold
  .checked_add(tokens_to_mint)
  .ok_or(PresaleError::MathOverflow)?;
```

### PDA Ownership

```rust
// Treasury owned by Campaign PDA, not artist
#[account(
  init,
  token::authority = campaign,  // PDA is owner
)]
pub treasury: Account<'info, TokenAccount>,
```

**Why this matters:**
- Artist can't directly drain treasury
- Withdrawal logic is programmatic
- Future: Add MOQ gates before allowing withdrawal

## 🌉 Base Comparison

### Metal API → Anchor Program

| Metal Method | Anchor Instruction | Implementation |
|--------------|-------------------|----------------|
| `createPresale()` | `initialize_campaign` | Creates campaign PDA + mint |
| `buyPresale()` | `buy_presale` | USDC transfer + token mint |
| `getHolder()` | N/A (client-side) | Query token accounts |
| `createUser()` | N/A (Privy) | Privy wallet generation |

### State Storage

**Base (Metal):**
```typescript
// Off-chain database + on-chain tokens
{
  presale_id: "abc123",
  token_address: "0x...",
  price: 1.5,
  // ... stored in Postgres/Supabase
}
```

**Solana:**
```rust
// On-chain account (Campaign PDA)
pub struct Campaign {
  authority: Pubkey,
  campaign_id: String,  // "artist-presale-2024"
  token_mint: Pubkey,
  price_per_token_usdc: u64,
  // ... stored on Solana
}
```

**Trade-offs:**
- ✅ Solana: Full decentralization, no DB dependency
- ✅ Base: Lower storage costs, flexible schema
- 🤝 Both: Fast reads, consistent state

### Transaction Cost

| Operation | Base | Solana | Winner |
|-----------|------|--------|--------|
| Create campaign | ~$0.03 | ~$0.01 | Solana |
| Buy tokens | ~$0.02 | ~$0.00002 | **Solana** 🏆 |
| Withdraw | ~$0.02 | ~$0.00001 | **Solana** 🏆 |

## 📊 Data Flow Example

### Scenario: Artist creates $10k campaign

```
1. Artist: "Create campaign with 10k tokens at $1 each"
   
   initialize_campaign(
     campaign_id: "indie-album-2024",
     price: 1.0 USDC,
     total_supply: 10_000
   )
   
   ↓ Transaction
   
   Campaign PDA Created:
   {
     campaign_id: "indie-album-2024",
     price_per_token_usdc: 1_000_000,  // 6 decimals
     total_supply: 10_000,
     tokens_sold: 0,
     usdc_raised: 0,
     is_active: true
   }

2. Fan: "Buy $100 worth of tokens"
   
   buy_presale(
     campaign_id: "indie-album-2024",
     usdc_amount: 100 USDC
   )
   
   ↓ On-chain calculation
   
   tokens_to_mint = 100 USDC / 1.0 USDC = 100 tokens
   
   ↓ Atomic transfers
   
   Transfer: 100 USDC (Fan → Treasury)
   Mint: 100 tokens (Mint → Fan)
   
   ↓ State update
   
   Campaign PDA Updated:
   {
     tokens_sold: 100,
     usdc_raised: 100_000_000,  // 100 USDC in lamports
     ...
   }

3. 100 fans buy $100 each (total $10k raised)
   
   Campaign PDA:
   {
     tokens_sold: 10_000,
     usdc_raised: 10_000_000_000,  // $10k
     ...
   }

4. Artist: "Withdraw funds for production"
   
   withdraw_funds(
     amount: 10_000 USDC
   )
   
   ↓ Authority check passes
   
   Transfer: 10_000 USDC (Treasury → Artist)
```

## 🔮 Future Extensions

### Credit Line Integration

```rust
pub struct Campaign {
  // ... existing fields
  
  // Credit line fields (future)
  credit_limit: Option<u64>,
  credit_used: u64,
  credit_repaid: u64,
  moq_reached: bool,
}
```

### Redemption & Repayment

```rust
pub fn redeem_and_repay(
  ctx: Context<RedeemAndRepay>,
  tokens_to_burn: u64
) -> Result<()> {
  // 1. Burn campaign tokens
  token::burn(/* ... */)?;
  
  // 2. Calculate repayment amount
  let repayment = calculate_repayment(tokens_to_burn);
  
  // 3. Stream USDC back to treasury
  token::transfer(repayment, /* ... */)?;
  
  // 4. Update credit line
  campaign.credit_repaid += repayment;
  
  Ok(())
}
```

### DeFi Composability

```rust
// Example: Yield on treasury USDC (MarginFi)
pub fn deposit_to_yield(
  ctx: Context<DepositToYield>,
  amount: u64
) -> Result<()> {
  // CPI to MarginFi
  marginfi::cpi::deposit(
    ctx.accounts.into(),
    amount
  )?;
  
  campaign.yield_generating = true;
  Ok(())
}
```

## 🧪 Testing Strategy

### Unit Tests (Anchor)
```bash
anchor test
```
- Campaign creation
- Token purchases
- Supply caps
- Authority checks
- Error conditions

### Integration Tests (TypeScript)
```typescript
// client/integration.test.ts
describe("Presale Flow", () => {
  it("should create campaign and buy tokens", async () => {
    // Test full lifecycle
  });
});
```

### Fuzz Testing
```bash
# Random inputs to find edge cases
cargo fuzz run presale_fuzz
```

## 📚 References

- **Anchor Book**: https://book.anchor-lang.com/
- **Solana Program Library**: https://github.com/solana-labs/solana-program-library
- **SPL Token**: https://spl.solana.com/token
- **PDA Derivation**: https://solanacookbook.com/core-concepts/pdas.html

---

**Questions?** See [README.md](./README.md) or open an issue.

