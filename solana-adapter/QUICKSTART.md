# Superfan Solana Adapter - Quick Start

**Get up and running in 5 minutes.**

## 🚀 TL;DR

```bash
# Install dependencies
pnpm install

# Build program
anchor build

# Deploy to DevNet
anchor deploy --provider.cluster devnet

# Run example
pnpm client:example
```

## 📦 What You Get

After following this guide, you'll have:

✅ Superfan presale program deployed to Solana DevNet  
✅ TypeScript client ready to integrate  
✅ Working example of creating campaigns and buying tokens  
✅ Privy integration template for your frontend  

## 🏁 Step-by-Step Setup

### 1. Prerequisites (5 min)

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli

# Verify installations
solana --version
anchor --version
```

### 2. Create Wallet (2 min)

```bash
# Generate new keypair
solana-keygen new

# Save this - you'll need it!
solana address

# Configure for DevNet
solana config set --url devnet

# Get free DevNet SOL
solana airdrop 2
```

### 3. Build & Deploy (3 min)

```bash
cd solana-adapter

# Install Node dependencies
pnpm install

# Build the Rust program
anchor build

# Deploy to DevNet
anchor deploy --provider.cluster devnet
```

**Copy your Program ID** - it's shown in the deploy output!

### 4. Get Test USDC (1 min)

Visit: https://spl-token-faucet.com/?token-name=USDC

1. Paste your wallet address
2. Click "Request USDC"
3. Confirm with `spl-token accounts`

### 5. Run Example (1 min)

```bash
# Build TypeScript client
pnpm client:build

# Run the example
pnpm client:example
```

You should see:
```
🚀 Superfan Solana Presale Example
📍 Wallet: <your-address>
💰 Balance: 2 SOL

📝 Creating campaign...
✅ Campaign created!
   TX: <transaction-signature>

💳 Buying presale tokens...
✅ Purchase complete!
   USDC spent: $10
   Tokens minted: 6.666666

✨ Example complete!
```

## 🎉 You're Done!

### View Your Transactions

Check Solana Explorer:
```
https://explorer.solana.com/address/<YOUR_PROGRAM_ID>?cluster=devnet
```

### Next Steps

1. **Integrate with Frontend**: See [client/privy-integration.ts](./client/privy-integration.ts)
2. **Read Architecture**: Check [ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Deploy for Real**: Follow [DEPLOYMENT.md](./DEPLOYMENT.md)

## 🔥 Frontend Integration (10 min)

### Add to Your Next.js App

**1. Copy client files:**
```bash
cp -r solana-adapter/client/* app/solana-presale/
```

**2. Install dependencies:**
```bash
pnpm add @solana/web3.js @coral-xyz/anchor @solana/spl-token
```

**3. Create API route:**

File: `app/api/presale/buy/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";
import { PrivySuperfanPresaleClient } from "@/solana-adapter/client/privy-integration";
import { verifyAuthToken } from "@privy-io/server-auth";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    const authToken = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authToken) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authorization header" },
        { status: 401 }
      );
    }

    let verifiedUser;
    try {
      verifiedUser = await verifyAuthToken(
        authToken,
        process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
        process.env.PRIVY_APP_SECRET!
      );
    } catch (error) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid token" },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const { campaignId, usdcAmount } = body;

    if (!campaignId || typeof campaignId !== "string" || campaignId.trim() === "") {
      return NextResponse.json(
        { error: "Invalid campaignId: must be a non-empty string" },
        { status: 400 }
      );
    }

    if (typeof usdcAmount !== "number" || usdcAmount <= 0 || !isFinite(usdcAmount)) {
      return NextResponse.json(
        { error: "Invalid usdcAmount: must be a positive number" },
        { status: 400 }
      );
    }

    // 3. Ensure environment variables are present
    if (!process.env.NEXT_PUBLIC_SOLANA_RPC_URL || !process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID) {
      console.error("Missing required environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // 4. Initialize Privy presale client
    const client = new PrivySuperfanPresaleClient({
      privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      privyAppSecret: process.env.PRIVY_APP_SECRET!,
      solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      programId: process.env.NEXT_PUBLIC_PRESALE_PROGRAM_ID,
    });

    // 5. Execute presale purchase with error handling
    const result = await client.buyPresaleForUser(
      verifiedUser.userId,
      campaignId,
      usdcAmount
    );

    return NextResponse.json({
      success: true,
      signature: result.signature,
      tokensMinted: result.campaignTokensMinted,
    });

  } catch (error) {
    console.error("Presale purchase failed:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to purchase presale tokens";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

**4. Create UI component:**

File: `components/solana-presale-button.tsx`
```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SolanaPresaleButton({ 
  campaignId, 
  amount 
}: { 
  campaignId: string; 
  amount: number; 
}) {
  const [loading, setLoading] = useState(false);
  
  const handleBuy = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/presale/buy", {
        method: "POST",
        body: JSON.stringify({ campaignId, usdcAmount: amount }),
      });
      const result = await res.json();
      alert(`Success! Minted ${result.campaignTokensMinted} tokens`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Button onClick={handleBuy} disabled={loading}>
      {loading ? "Processing..." : `Buy $${amount} USDC`}
    </Button>
  );
}
```

**5. Add to existing presale banner:**

File: `components/presale-banner.tsx`
```typescript
import { SolanaPresaleButton } from "./solana-presale-button";

// In your component:
<SolanaPresaleButton 
  campaignId="phat-trax-2024" 
  amount={100} 
/>
```

## 📱 Privy Solana Setup

**1. Enable Solana in Privy:**

Dashboard → Settings → Login Methods → Enable Solana

**2. Update your Privy config:**

```typescript
// app/providers.tsx
<PrivyProvider
  appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  config={{
    // ... existing config
    supportedChains: [
      base,
      solana, // Add Solana
    ],
  }}
>
```

**3. Get user's Solana wallet:**

```typescript
import { usePrivy } from "@privy-io/react-auth";

function MyComponent() {
  const { user } = usePrivy();
  
  const solanaWallet = user?.linkedAccounts.find(
    account => account.type === "wallet" && account.chainType === "solana"
  );
  
  console.log("Solana address:", solanaWallet?.address);
}
```

## 🐛 Troubleshooting

### "anchor: command not found"
```bash
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
```

### "Insufficient funds"
```bash
solana airdrop 2
```

### "Program modification not allowed"
```bash
# Rebuild with correct Program ID
anchor build
```

### "AccountNotFound"
- Campaign doesn't exist
- Check campaign ID matches
- Verify program deployed correctly

## 📚 Learn More

- **Full README**: [README.md](./README.md)
- **Architecture Deep Dive**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Production Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)

## 💬 Need Help?

1. Check the [troubleshooting section](#-troubleshooting)
2. Review [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed steps
3. Open an issue in the main repo

---

**Built with ❤️ for artists and their superfans**

🎸 Now go launch some campaigns! 🚀

