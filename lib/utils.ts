import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SplitsClient } from "@0xsplits/splits-sdk";
import { ethers } from "ethers";
import type { TeamMember } from "@/types/project";
import { createPublicClient, http, formatUnits, isAddress } from "viem";
import { base } from "viem/chains";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_ALCHEMY_BASE_MAINNET_RPC_URL ||
  "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;
const envSplitsOwner = process.env.NEXT_PUBLIC_SPLITS_OWNER_ADDRESS;
if (!envSplitsOwner) {
  throw new Error("SPLITS_OWNER address not set in environment variables");
}
if (!isAddress(envSplitsOwner)) {
  throw new Error(`Invalid SPLITS_OWNER address: ${envSplitsOwner}`);
}
export const SPLITS_OWNER = envSplitsOwner as `0x${string}`;

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];

const publicClient = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_ALCHEMY_BASE_MAINNET_RPC_URL ||
      "https://mainnet.base.org",
  ),
});

const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_BASE_MAINNET_API_KEY;
const ALCHEMY_PRICES_URL =
  "https://api.g.alchemy.com/prices/v1/tokens/by-symbol";
const PRICE_CACHE_KEY = "sf_funding_price_cache";
const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchTokenPricesUSD(signal?: AbortSignal) {
  // Try cache first
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(PRICE_CACHE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < PRICE_CACHE_TTL) {
        return data;
      }
    }
  }
  // Fetch from Alchemy Prices API
  const symbols = ["ETH", "USDC"];
  const params = new URLSearchParams();
  symbols.forEach((symbol) => params.append("symbols", symbol));
  const urlWithParams = `${ALCHEMY_PRICES_URL}?${params.toString()}`;
  const res = await fetch(urlWithParams, {
    signal,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${ALCHEMY_API_KEY}`,
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error(
      "Alchemy price fetch error:",
      res.status,
      res.statusText,
      errorText,
    );
    throw new Error("Failed to fetch price data from Alchemy");
  }
  const data = await res.json();
  // Parse Alchemy response
  type PriceData = {
    symbol: string;
    prices?: { currency: string; value: string }[];
  };
  let eth = 0,
    usdc = 0;
  if (Array.isArray(data.data)) {
    for (const token of data.data as PriceData[]) {
      if (token.symbol === "ETH") {
        const usdPrice = token.prices?.find((p) => p.currency === "USD")?.value;
        if (usdPrice) eth = parseFloat(usdPrice);
      }
      if (token.symbol === "USDC") {
        const usdPrice = token.prices?.find((p) => p.currency === "USD")?.value;
        if (usdPrice) usdc = parseFloat(usdPrice);
      }
    }
  }
  // Validate we have valid prices
  if (eth <= 0 || usdc <= 0) {
    console.warn("Invalid price data received from Alchemy:", { eth, usdc });
  }
  const prices = { eth, usdc };
  if (typeof window !== "undefined") {
    localStorage.setItem(
      PRICE_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data: prices }),
    );
  }
  return prices;
}

// Add the Transfer event ABI for USDC with correct type
const USDC_TRANSFER_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
  name: "Transfer",
  type: "event" as const,
};

// USDC deployment block on Base (replace with actual if different)
const USDC_DEPLOY_BLOCK = BigInt(8453);

export async function fetchFundingProgressUSD(
  address: string,
  signal?: AbortSignal,
) {
  if (!address) throw new Error("No contract address provided");
  const cacheKey = `sf_usdc_funding_${address}`;
  const cacheTTL = 5 * 60 * 1000; // 5 minutes
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, totalUSD } = JSON.parse(cached);
      if (Date.now() - timestamp < cacheTTL) {
        return { totalUSD };
      }
    }
  }
  try {
    const alchemyUrl = process.env.NEXT_PUBLIC_ALCHEMY_BASE_MAINNET_RPC_URL;
    if (!alchemyUrl) throw new Error("Alchemy RPC URL not set");
    let total = BigInt(0); // Use BigInt for full precision
    let pageKey: string | undefined = undefined;
    do {
      const params: any = {
        fromBlock: "0x0",
        toAddress: address.toLowerCase(),
        category: ["erc20"],
        contractAddresses: [USDC_ADDRESS],
        withMetadata: false,
        excludeZeroValue: true,
        maxCount: "0x64", // 100 in hex
      };
      if (pageKey) params.pageKey = pageKey;
      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [params],
      };
      const res = await fetch(alchemyUrl as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        console.error(
          "[fetchFundingProgressUSD] Failed to fetch transfers from Alchemy",
          res.status,
          res.statusText,
        );
        throw new Error("Failed to fetch transfers from Alchemy");
      }
      const data = await res.json();
      for (const tx of data.result?.transfers || []) {
        if (
          tx.to?.toLowerCase() === address.toLowerCase() &&
          tx.rawContract?.value
        ) {
          // Use BigInt for full precision
          total += BigInt(tx.rawContract.value);
        }
      }
      pageKey = data.result?.pageKey;
    } while (pageKey);
    // Only convert to Number for final USD value
    const totalUSD = Number(total) / 1e6;
    if (typeof window !== "undefined") {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ totalUSD, timestamp: Date.now() }),
      );
    }
    return { totalUSD };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "AbortError"
    )
      return;
    console.error("fetchFundingProgressUSD error:", err);
    throw new Error(
      "Error fetching funding progress: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

export async function createPullSplitOnBase(
  creatorwalletaddress: string,
  teamMembers: TeamMember[],
) {
  if (!process.env.NEXT_PUBLIC_SPLITS_SIGNER_KEY) {
    throw new Error("Splits signer private key not set in env");
  }
  // For server-side/admin usage, you need a wallet client and public client for SplitsClient v2
  // Here, we use ethers.js for signing, but SplitsClient v2 expects viem clients for full support
  // If you want to use SplitsClient fully, migrate to viem walletClient/publicClient pattern
  // For now, we keep ethers for signing, but only pass chainId to SplitsClient for type compatibility
  const splitsClient = new SplitsClient({ chainId: BASE_CHAIN_ID });

  const creatorAllocation = 500_000;
  const totalContributorAllocation = 500_000;
  const contributors = teamMembers.filter(
    (m) => m.walletAddress && m.revenueShare > 0,
  );

  const accounts = [
    creatorwalletaddress,
    ...contributors.map((m) => m.walletAddress),
  ];
  const percentAllocations = [
    creatorAllocation,
    ...contributors.map((m) =>
      Math.floor((m.revenueShare / 100) * totalContributorAllocation),
    ),
  ];

  // Adjust for rounding errors
  const total = percentAllocations.reduce((sum, n) => sum + n, 0);
  if (total !== 1_000_000) {
    percentAllocations[0] += 1_000_000 - total;
  }

  try {
    if (typeof splitsClient.splitV2?.createSplit === "function") {
      const tx = await splitsClient.splitV2.createSplit({
        recipients: accounts.map((address, i) => ({
          address,
          percentAllocation: percentAllocations[i],
        })),
        distributorFeePercent: 0,
        ownerAddress: SPLITS_OWNER,
      });
      return {
        tx,
        success: true,
        contractAddress: tx.splitAddress,
        txHash: tx.event?.transactionHash,
      };
    } else {
      throw new Error("No valid split creation method found on SplitsClient");
    }
  } catch (error) {
    console.error("Error creating split contract:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error creating split contract",
    };
  }
}

// Funding data cache utility
const FUNDING_CACHE_KEY = "sf_funding_cache_v1";
const FUNDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedFunding(address: string) {
  if (typeof window === "undefined") return null;
  try {
    const cacheRaw = localStorage.getItem(FUNDING_CACHE_KEY);
    if (!cacheRaw) return null;
    const cache = JSON.parse(cacheRaw);
    const entry = cache[address];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > FUNDING_CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedFunding(address: string, data: any) {
  if (typeof window === "undefined") return;
  try {
    const cacheRaw = localStorage.getItem(FUNDING_CACHE_KEY);
    const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
    cache[address] = { data, timestamp: Date.now() };
    localStorage.setItem(FUNDING_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const BACKERS_CACHE_KEY = "sf_backers_cache_v1";
const BACKERS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Rate limiting for Alchemy requests
let lastAlchemyRequest = 0;
const ALCHEMY_REQUEST_DELAY = 500; // 500ms between requests

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      
      // For 429 (rate limit), use exponential backoff
      if (error.message?.includes('429') || error.status === 429) {
        const backoffDelay = baseDelay * Math.pow(2, i) + Math.random() * 1000;
        console.log(`[retryWithBackoff] Rate limited, retrying in ${backoffDelay}ms...`);
        await delay(backoffDelay);
      } else {
        // For other errors, shorter delay
        await delay(baseDelay);
      }
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Fetches the number of unique addresses that have sent ETH or USDC to the contract address using Alchemy.
 * Caches the result for 10 minutes in localStorage.
 * @param contractAddress The splits contract address
 * @returns Promise<number> Unique backers count
 */
export async function fetchUniqueBackersCount(
  contractAddress: string,
): Promise<number> {
  if (!contractAddress) throw new Error("No contract address provided");
  const target = contractAddress.toLowerCase();
  console.log("[fetchUniqueBackersCount] called with", target);
  
  if (typeof window !== "undefined") {
    // Try cache first
    const cacheRaw = localStorage.getItem(BACKERS_CACHE_KEY);
    if (cacheRaw) {
      const cache = JSON.parse(cacheRaw);
      const entry = cache[target];
      if (entry && Date.now() - entry.timestamp < BACKERS_CACHE_TTL) {
        console.log("[fetchUniqueBackersCount] cache hit", entry.count);
        return entry.count;
      }
    }
  }

  const alchemyUrl = process.env.NEXT_PUBLIC_ALCHEMY_BASE_MAINNET_RPC_URL;
  if (!alchemyUrl) throw new Error("Alchemy RPC URL not set");
  console.log("[fetchUniqueBackersCount] using Alchemy URL", alchemyUrl);

  const uniqueAddresses = new Set<string>();

  async function fetchTransfers(
    category: "external" | "erc20",
    pageKey?: string,
  ): Promise<void> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastAlchemyRequest;
    if (timeSinceLastRequest < ALCHEMY_REQUEST_DELAY) {
      await delay(ALCHEMY_REQUEST_DELAY - timeSinceLastRequest);
    }
    lastAlchemyRequest = Date.now();

    const params: any = {
      fromBlock: "0x0",
      toAddress: target,
      category: [category],
      withMetadata: false,
      excludeZeroValue: true,
      maxCount: "0x32", // Reduced from 100 to 50 to be less aggressive
    };
    if (category === "erc20") {
      params.contractAddresses = [USDC_ADDRESS]; // reuse module-level constant
    }
    if (pageKey) {
      params.pageKey = pageKey;
    }
    
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [params],
    };

    return retryWithBackoff(async () => {
      const res = await fetch(alchemyUrl as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(
          "[fetchUniqueBackersCount] Failed to fetch transfers from Alchemy",
          category,
          res.status,
          res.statusText,
          errorText
        );
        
        // Create error with status for retry logic
        const error = new Error(`Failed to fetch transfers from Alchemy: ${res.status} ${res.statusText}`);
        (error as any).status = res.status;
        throw error;
      }
      
      const data = await res.json();
      
      // Check for JSON-RPC errors
      if (data.error) {
        console.error("[fetchUniqueBackersCount] Alchemy JSON-RPC error:", data.error);
        throw new Error(`Alchemy API error: ${data.error.message}`);
      }
      
      for (const tx of data.result?.transfers || []) {
        if (tx.to?.toLowerCase() === target && tx.from) {
          uniqueAddresses.add(tx.from.toLowerCase());
        }
      }
      
      // Follow pagination (but with rate limiting)
      if (data.result?.pageKey) {
        await fetchTransfers(category, data.result.pageKey);
      }
    });
  }

  try {
    // Process sequentially instead of parallel to avoid overwhelming Alchemy
    await fetchTransfers("external");
    await fetchTransfers("erc20");
    
    console.log(
      "[fetchUniqueBackersCount] uniqueAddresses.size",
      uniqueAddresses.size,
    );
    
    // Cache result
    if (typeof window !== "undefined") {
      const cacheRaw = localStorage.getItem(BACKERS_CACHE_KEY);
      const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
      cache[target] = { count: uniqueAddresses.size, timestamp: Date.now() };
      localStorage.setItem(BACKERS_CACHE_KEY, JSON.stringify(cache));
    }
    
    return uniqueAddresses.size;
  } catch (err: any) {
    console.error("[fetchUniqueBackersCount] error", err);
    
    // Return cached value if available, even if expired
    if (typeof window !== "undefined") {
      const cacheRaw = localStorage.getItem(BACKERS_CACHE_KEY);
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw);
        const entry = cache[target];
        if (entry) {
          console.log("[fetchUniqueBackersCount] returning stale cache due to error", entry.count);
          return entry.count;
        }
      }
    }
    
    // If no cache available, return 0 instead of throwing
    console.warn("[fetchUniqueBackersCount] no cache available, returning 0");
    return 0;
  }
}

// In-memory cache for funding progress (per session)
const fundingProgressCache = new Map<
  string,
  { totalUSD: number; timestamp: number }
>();
const FUNDING_PROGRESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getSharedFundingProgressUSD(
  address: string,
  signal?: AbortSignal,
  forceRefresh = false,
) {
  if (!address) throw new Error("No contract address provided");
  const now = Date.now();
  const cached = fundingProgressCache.get(address);
  if (
    !forceRefresh &&
    cached &&
    now - cached.timestamp < FUNDING_PROGRESS_CACHE_TTL
  ) {
    return { totalUSD: cached.totalUSD };
  }
  const result = await fetchFundingProgressUSD(address, signal);
  if (result && typeof result.totalUSD === "number") {
    fundingProgressCache.set(address, {
      totalUSD: result.totalUSD,
      timestamp: now,
    });
  }
  return result;
}


