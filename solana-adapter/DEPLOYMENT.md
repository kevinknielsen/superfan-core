# Deployment Guide: Superfan Solana Adapter

Complete deployment instructions for the Superfan presale program on Solana.

## 📋 Prerequisites

### 1. Install Solana CLI

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Verify installation
solana --version
```

### 2. Install Anchor

```bash
# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli

# Verify installation
anchor --version
```

### 3. Setup Wallet

```bash
# Generate new keypair (or use existing)
solana-keygen new --outfile ~/.config/solana/id.json

# Display your public key
solana address

# Check balance
solana balance
```

## 🌐 DevNet Deployment

### Step 1: Configure Solana CLI

```bash
# Set cluster to DevNet
solana config set --url devnet

# Verify configuration
solana config get
```

Expected output:
```
Config File: ~/.config/solana/cli/config.yml
RPC URL: https://api.devnet.solana.com
WebSocket URL: wss://api.devnet.solana.com/
Keypair Path: ~/.config/solana/id.json
Commitment: confirmed
```

### Step 2: Get DevNet SOL

Program deployment costs ~5-10 SOL on DevNet.

```bash
# Request airdrop (can run multiple times)
solana airdrop 2

# Verify balance
solana balance
```

If airdrop fails:
- Try again after a few seconds
- Use Solana Faucet: https://faucet.solana.com/

### Step 3: Build Program

```bash
cd solana-adapter

# Build the program
anchor build
```

This generates:
- `target/deploy/superfan_presale.so` - Compiled program
- `target/idl/superfan_presale.json` - Interface definition

**Note the Program ID:**
```bash
solana address -k target/deploy/superfan_presale-keypair.json
```

### Step 4: Update Program ID

Edit `Anchor.toml` and `lib.rs` with your actual Program ID:

**Anchor.toml:**
```toml
[programs.devnet]
superfan_presale = "YOUR_PROGRAM_ID_HERE"
```

**programs/superfan-presale/src/lib.rs:**
```rust
declare_id!("YOUR_PROGRAM_ID_HERE");
```

Rebuild after updating:
```bash
anchor build
```

### Step 5: Deploy to DevNet

```bash
# Deploy the program
anchor deploy --provider.cluster devnet
```

Expected output:
```
Deploying workspace: https://api.devnet.solana.com
Upgrade authority: YOUR_WALLET_ADDRESS
Deploying program "superfan_presale"...
Program path: target/deploy/superfan_presale.so...
Program Id: YOUR_PROGRAM_ID

Deploy success
```

### Step 6: Verify Deployment

```bash
# Check program account exists
solana program show YOUR_PROGRAM_ID --url devnet
```

Expected output:
```
Program Id: YOUR_PROGRAM_ID
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: ...
Authority: YOUR_WALLET_ADDRESS
Last Deployed In Slot: ...
Data Length: ... bytes
Balance: ... SOL
```

### Step 7: Get DevNet USDC

To test presale purchases:

1. Visit https://spl-token-faucet.com/?token-name=USDC
2. Enter your wallet address
3. Request 100 USDC

Verify USDC balance:
```bash
spl-token accounts
```

DevNet USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### Step 8: Test Program

```bash
# Run example client
pnpm client:build
pnpm client:example
```

Or run Anchor tests:
```bash
anchor test --provider.cluster devnet
```

## 🔧 Local Testing (Recommended Before DevNet)

Test locally before deploying to DevNet:

### Step 1: Start Local Validator

```bash
# Terminal 1: Start validator
solana-test-validator
```

Keep this running in the background.

### Step 2: Configure for Localhost

```bash
# Terminal 2: Switch to localhost
solana config set --url localhost

# Get localnet SOL (free!)
solana airdrop 10
```

### Step 3: Deploy Locally

```bash
anchor build
anchor deploy --provider.cluster localnet

# Or combined:
anchor test
```

This runs:
1. Builds program
2. Starts local validator
3. Deploys program
4. Runs test suite
5. Shuts down validator

## 🌟 Client Integration

After deployment, integrate with your frontend:

### 1. Save Program ID

Create `.env.local`:
```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PRESALE_PROGRAM_ID=YOUR_PROGRAM_ID
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

### 2. Initialize Client

```typescript
import { SuperfanPresaleClient } from "@/solana-adapter/client/client";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL!
);

const programId = new PublicKey(
  process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID!
);

const client = new SuperfanPresaleClient(
  connection,
  wallet,
  programId
);
```

### 3. Create Campaign

```typescript
// API route or admin panel
await client.createCampaign({
  campaignId: "artist-name-2024",
  pricePerTokenUsdc: 1.5,
  totalSupply: 1_000_000,
});
```

### 4. Buy Presale

```typescript
// User-facing component
const result = await client.buyPresale({
  campaignId: "artist-name-2024",
  usdcAmount: 100,
});
```

## 🔐 Production Deployment (Mainnet)

**⚠️ NOT RECOMMENDED YET - Audit Required**

When ready for mainnet:

### Step 1: Security Audit

- [ ] Complete smart contract audit
- [ ] Penetration testing
- [ ] Economic attack vectors
- [ ] Upgrade authority management

### Step 2: Configure Mainnet

```bash
solana config set --url mainnet-beta
```

Update `Anchor.toml`:
```toml
[programs.mainnet-beta]
superfan_presale = "YOUR_MAINNET_PROGRAM_ID"
```

### Step 3: Fund Deployment Wallet

Mainnet deployment costs:
- Program deployment: ~5-10 SOL
- Initial testing: ~1 SOL
- **Total: ~15 SOL recommended**

### Step 4: Deploy

```bash
anchor build
anchor deploy --provider.cluster mainnet-beta
```

### Step 5: Update Frontend

```bash
# Production environment
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_PRESALE_PROGRAM_ID=YOUR_MAINNET_PROGRAM_ID
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Mainnet USDC Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## 🐛 Troubleshooting

### Build Errors

**Error: `anchor: command not found`**
```bash
# Reinstall Anchor
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
```

**Error: `error: package 'anchor-lang v0.30.1' cannot be built`**
```bash
# Update Rust
rustup update stable
```

### Deployment Errors

**Error: `Insufficient funds`**
```bash
# Check balance
solana balance

# Get more SOL (DevNet)
solana airdrop 2
```

**Error: `Program modification is not allowed`**
```bash
# Check upgrade authority
solana program show YOUR_PROGRAM_ID

# Ensure you're using the correct wallet
solana address
```

**Error: `Program write to unwritable account`**
- Rebuild: `anchor build`
- Verify Program ID matches in `Anchor.toml` and `lib.rs`

### Runtime Errors

**Error: `AccountNotFound`**
- Campaign doesn't exist
- Wrong Program ID
- Campaign ID mismatch

**Error: `InsufficientFunds`**
- Not enough USDC in buyer wallet
- Get DevNet USDC: https://spl-token-faucet.com/

**Error: `SupplyExceeded`**
- Campaign total supply reached
- Reduce purchase amount

## 📊 Monitoring

### DevNet Explorer

View transactions and accounts:
- **Solana Explorer**: https://explorer.solana.com/?cluster=devnet
- **SolanaFM**: https://solana.fm/?cluster=devnet

### Program Logs

```bash
# Stream logs for your program
solana logs YOUR_PROGRAM_ID --url devnet
```

### Account Queries

```bash
# Get campaign data
solana account YOUR_CAMPAIGN_PDA --url devnet --output json

# Get token mint info
spl-token display YOUR_TOKEN_MINT_ADDRESS
```

## 🔄 Upgrading the Program

Anchor programs are upgradeable by default:

```bash
# Make changes to lib.rs

# Rebuild
anchor build

# Upgrade (cheaper than initial deployment)
anchor upgrade target/deploy/superfan_presale.so --program-id YOUR_PROGRAM_ID
```

**⚠️ Important:**
- State layout changes require migration
- Test upgrades on DevNet first
- Consider making program immutable for mainnet

## 📚 Resources

- **Solana CLI Reference**: https://docs.solana.com/cli
- **Anchor Deployment**: https://www.anchor-lang.com/docs/cli
- **Program Testing**: https://www.anchor-lang.com/docs/testing
- **Solana DevNet Faucet**: https://faucet.solana.com/
- **USDC Test Token**: https://spl-token-faucet.com/

## ✅ Deployment Checklist

- [ ] Install Solana CLI
- [ ] Install Anchor CLI  
- [ ] Generate/configure wallet
- [ ] Get DevNet SOL
- [ ] Build program (`anchor build`)
- [ ] Update Program ID in code
- [ ] Deploy to DevNet (`anchor deploy`)
- [ ] Get DevNet USDC
- [ ] Test program (`anchor test` or `pnpm client:example`)
- [ ] Verify on Solana Explorer
- [ ] Integrate with frontend
- [ ] Document Program ID for team

---

**Questions?** Open an issue in the main repository.

