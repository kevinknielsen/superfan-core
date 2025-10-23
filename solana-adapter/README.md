# Superfan Solana Adapter

> **Belief-backed credit on Solana**  
> Port of Superfan's tokenized presale system from Base (EVM) to Solana

## 📋 Overview

The Superfan Solana Adapter replicates the core presale mechanism from our Base contracts using Solana-native constructs. It demonstrates that our **fan-powered liquidity → self-repaying credit** model works seamlessly on Solana's high-throughput, low-fee architecture.

This adapter enables:
- ✅ **Tokenized presales** - Artists raise funds by selling campaign tokens
- ✅ **USDC settlements** - Fans back campaigns with USDC (DevNet for testing)
- ✅ **Automated token minting** - Campaign tokens distributed on purchase
- ✅ **Privy wallet abstraction** - Zero-crypto UX for fans
- ✅ **Cross-chain validation** - Proves our model is chain-agnostic

## 🏗️ Architecture

### Concept Mapping: Base → Solana

| Concept | Base Implementation | Solana Equivalent |
|---------|-------------------|-------------------|
| **Campaign Tokens** | ERC-1155 (via Metal) | SPL Token mints |
| **Presale Escrow** | Solidity contracts | PDAs holding USDC |
| **Settlement Token** | USDC (ERC-20) | SPL-USDC (DevNet) |
| **Wallet Layer** | Privy (EVM) | Privy (Solana embedded) |
| **State Storage** | Contract storage | Anchor account structs |
| **Token Operations** | Metal SDK | Anchor CPI (token::mint_to) |

### Program Structure

```
solana-adapter/
├── programs/
│   └── superfan-presale/        # Anchor program (Rust)
│       └── src/lib.rs           # Core presale logic
├── client/
│   ├── client.ts                # TypeScript SDK
│   ├── privy-integration.ts     # Privy wallet examples
│   ├── types.ts                 # Type definitions
│   └── example.ts               # Usage examples
├── Anchor.toml                  # Anchor configuration
├── package.json                 # Node dependencies
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

```bash
# Install Rust & Solana
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli

# Install Node dependencies
pnpm install
```

### 1. Build the Program

```bash
cd solana-adapter
anchor build
```

This generates:
- `target/deploy/superfan_presale.so` - Program binary
- `target/idl/superfan_presale.json` - IDL for client

### 2. Deploy to DevNet

```bash
# Configure Solana CLI for DevNet
solana config set --url devnet

# Generate a wallet (or use existing)
solana-keygen new

# Get DevNet SOL for deployment
solana airdrop 2

# Deploy the program
anchor deploy --provider.cluster devnet
```

**Save your Program ID** - you'll need it for client configuration.

### 3. Get DevNet USDC

To test presale purchases, you need DevNet USDC:

1. Visit: https://spl-token-faucet.com/?token-name=USDC
2. Enter your wallet address
3. Click "Request USDC"

DevNet USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### 4. Run Example Client

```bash
# Build TypeScript client
pnpm client:build

# Run example
pnpm client:example
```

This will:
- Create a test campaign
- Display campaign stats
- Purchase tokens with USDC
- Show updated funding

## 💻 Usage

### TypeScript Client

```typescript
import { Connection, PublicKey } from "@solana/web3.js";
import { SuperfanPresaleClient } from "./client/client";

// Initialize
const connection = new Connection("https://api.devnet.solana.com");
const programId = new PublicKey("YOUR_PROGRAM_ID");
const client = new SuperfanPresaleClient(connection, wallet, programId);

// Create campaign
await client.createCampaign({
  campaignId: "artist-presale-2024",
  pricePerTokenUsdc: 1.5,        // $1.50 per token
  totalSupply: 1_000_000,        // 1M tokens max
  lockDuration: 0,               // No lock period
});

// Buy tokens
const result = await client.buyPresale({
  campaignId: "artist-presale-2024",
  usdcAmount: 100,               // $100 USDC
});

console.log("Tokens minted:", result.campaignTokensMinted);
```

### Privy Integration

```typescript
import { PrivySuperfanPresaleClient } from "./client/privy-integration";

// Initialize with Privy credentials
const client = new PrivySuperfanPresaleClient({
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  privyAppSecret: process.env.PRIVY_APP_SECRET,
  solanaRpcUrl: "https://api.devnet.solana.com",
  programId: "YOUR_PROGRAM_ID",
});

// Buy tokens for user (wallet abstracted by Privy)
await client.buyPresaleForUser(
  user.id,              // Privy user ID
  "artist-presale-2024",
  100                   // $100 USDC
);
```

See [`client/privy-integration.ts`](./client/privy-integration.ts) for Next.js API route and React component examples.

## 🔑 Program Instructions

### 1. `initialize_campaign`

Creates a new presale campaign with:
- Campaign state account (PDA)
- Campaign token mint (SPL token)
- Treasury account (holds USDC)

**Accounts:**
- `campaign` - PDA storing campaign metadata
- `campaign_token_mint` - SPL token mint for this campaign
- `treasury` - Token account holding USDC
- `authority` - Campaign creator (signer)

**Args:**
- `campaign_id: String` - Unique identifier (max 50 chars)
- `price_per_token_usdc: u64` - Price in USDC lamports (6 decimals)
- `total_supply: Option<u64>` - Max tokens to mint (None = unlimited)
- `lock_duration: Option<i64>` - Lock period in seconds

### 2. `buy_presale`

Purchases campaign tokens with USDC.

**Atomic flow:**
1. Transfer USDC: buyer → treasury
2. Mint campaign tokens → buyer
3. Update campaign stats

**Accounts:**
- `campaign` - Campaign state PDA
- `buyer` - Token purchaser (signer)
- `buyer_usdc_account` - Buyer's USDC token account
- `buyer_token_account` - Buyer's campaign token account (created if needed)

**Args:**
- `usdc_amount: u64` - USDC to spend (lamports, 6 decimals)

### 3. `withdraw_funds`

Withdraws USDC from treasury (authority only).

**Args:**
- `amount: u64` - USDC to withdraw (lamports)

### 4. `close_campaign`

Closes campaign, preventing new purchases (authority only).

## 🧪 Testing

### Run Anchor Tests

```bash
anchor test
```

This spins up a local validator and runs the test suite.

### Manual Testing on DevNet

1. Deploy program to DevNet
2. Create a campaign: `pnpm client:example`
3. Get DevNet USDC: https://spl-token-faucet.com/
4. Purchase tokens
5. Verify balance in Solana Explorer

## 📊 Comparison: Base vs. Solana

### What's the Same

✅ **User flow** - Fans back campaigns → receive tokens  
✅ **Price discovery** - Price per token set by artist  
✅ **Supply caps** - Optional max token supply  
✅ **Wallet abstraction** - Privy handles all wallet complexity  
✅ **USDC settlements** - Same stablecoin, different chain

### What's Different

| Aspect | Base | Solana |
|--------|------|--------|
| **Token standard** | ERC-1155 (via Metal) | SPL Token |
| **Account model** | EVM storage slots | Account-based (PDAs) |
| **Transaction cost** | ~$0.01-0.05 | ~$0.00001 |
| **Throughput** | ~10-50 TPS | ~3,000 TPS |
| **Finality** | ~2 seconds | ~400ms |
| **Wallet format** | 0x... (Ethereum) | Base58 (Solana) |

### Implementation Notes

#### Token Minting
- **Base**: Metal SDK handles mint via server API
- **Solana**: Direct CPI to `token::mint_to`

#### Escrow
- **Base**: Smart contract holds USDC
- **Solana**: PDA-owned token account

#### Price Calculation
- **Base**: Handled off-chain by Metal
- **Solana**: On-chain math in `buy_presale` instruction

## 🔐 Security Considerations

### Program Authority
- Only campaign `authority` can withdraw funds or close campaign
- PDA-based authority prevents unauthorized access

### Supply Caps
- Optional `total_supply` enforced on-chain
- Prevents over-minting

### USDC Handling
- All USDC transfers atomic (transaction succeeds or reverts entirely)
- Treasury controlled by campaign PDA

### Recommended Audits
- [ ] Anchor security review
- [ ] Token mint authority verification
- [ ] Treasury withdrawal logic
- [ ] Overflow/underflow checks (handled by Rust)

## 🌐 Mainnet Deployment

**⚠️ DevNet Only for Now**

Before mainnet:
1. Complete security audit
2. Add MOQ/milestone gates
3. Implement credit line repayment
4. Test with real USDC on DevNet
5. Gradual rollout with monitoring

Update `Anchor.toml` for mainnet:
```toml
[programs.mainnet-beta]
superfan_presale = "YOUR_MAINNET_PROGRAM_ID"

[provider]
cluster = "Mainnet"
```

## 🛣️ Roadmap

### ✅ Phase 1: Core Presale (Complete)
- Campaign creation
- Token minting
- USDC purchases
- Privy integration

### 🔄 Phase 2: Credit System (Future)
- MOQ tracking
- Escrow release gates
- Credit line calculation
- Repayment streams

### 🔮 Phase 3: Cross-Chain Sync (Future)
- Event indexing
- Base ↔ Solana state sync
- Unified campaign dashboard

## 📚 Resources

- **Anchor Docs**: https://www.anchor-lang.com/
- **Solana Cookbook**: https://solanacookbook.com/
- **Privy Solana Guide**: https://docs.privy.io/guide/guides/solana
- **SPL Token Docs**: https://spl.solana.com/token
- **Metal Docs**: https://docs.metal.build/

## 🤝 Contributing

This adapter is part of Superfan's Colosseum hackathon submission. For questions or improvements:

1. Open an issue describing the enhancement
2. Reference this README in your PR
3. Ensure all tests pass: `anchor test`

## 📄 License

See main repository license.

---

**Built with ❤️ for artists and their superfans**

