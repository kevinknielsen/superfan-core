import "server-only";

import { fetchMetal } from "./fetchMetal";

interface TokenInfo {
  name: string;
  symbol: string;
  imageUrl: string;
  metadata?: {
    description?: string;
    telegramLink?: string;
    websiteLink?: string;
    xLink?: string;
    farcasterLink?: string;
  };
}

interface CreatePresaleParams {
  name: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  targetUsdcAmount: number;
  tokenInfo: TokenInfo;
  deploymentConfig: {
    lockupPercentage: number;
  };
}

interface BuyTokensParams {
  tokenAddress: string;
  tokenAmount: number;
  swapFeeBps?: number;
}

interface SellTokensParams {
  tokenAddress: string;
  tokenAmount: number;
  swapFeeBps?: number;
}

export class MetalServerClient {
  private apiKey: string;

  constructor(privateApiKey: string) {
    this.apiKey = privateApiKey;
  }

  async getOrCreateHolder(userId: string) {
    return fetchMetal<{
      success: true;
      id: string;
      address: string;
      totalValue: number;
      tokens: {
        id: string;
        address: string;
        name: string;
        symbol: string;
        balance: number;
        value: number;
      }[];
    }>(`/holder/${userId}`, {
      method: "PUT",
      headers: { "x-api-key": this.apiKey },
    });
  }

  async listPresales() {
    return fetchMetal<
      {
        name: string;
        id: string;
        participants: {
          userAddress: string;
          usdcAmount: number;
        }[];
        tokenInfo: {
          name: string;
          symbol: string;
          imageUrl: string;
        };
      }[]
    >("/merchant/presales", {
      method: "GET",
      headers: { "x-api-key": this.apiKey },
    });
  }

  async createPresale(params: CreatePresaleParams) {
    return fetchMetal<
      {
        signerId: string;
        orgId: string;
        id: string;
        chainId: 8453;
        status: "completed" | "pending" | "active" | "ended";
        participants: [];
        createdAt: string;
      } & CreatePresaleParams
    >("/merchant/presale", {
      method: "POST",
      headers: { "x-api-key": this.apiKey },
      body: JSON.stringify(params),
    });
  }

  async buyPresale(
    holderId: string,
    params: { presaleId: string; usdcAmount: number }
  ) {
    return fetchMetal<{ success: true }>(`/holder/${holderId}/buy-presale`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey },
      body: JSON.stringify(params),
    });
  }

  async buyTokens(holderId: string, params: BuyTokensParams) {
    return fetchMetal<{
      success: true;
      status: "completed";
      transactionHash: string;
      from: string;
      tokenAddress: string;
      blockNumber: number;
      blockHash: string;
    }>(`/holder/${holderId}/buy`, {
      method: "POST",
      body: JSON.stringify(params),
      headers: { "x-api-key": this.apiKey },
    });
  }

  async quoteBuyTokens(holderId: string, params: BuyTokensParams) {
    return fetchMetal<{ tokenQuantity: number; dollarValue: number }>(
      `/holder/${holderId}/buy/quote`,
      {
        method: "GET",
        body: JSON.stringify(params),
        headers: { "x-api-key": this.apiKey },
      }
    );
  }

  async sellTokens(holderId: string, params: SellTokensParams) {
    return fetchMetal<{
      success: true;
      status: "completed";
      transactionHash: string;
      from: string;
      tokenAddress: string;
      blockNumber: number;
      blockHash: string;
    }>(`/holder/${holderId}/sell`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey },
      body: JSON.stringify(params),
    });
  }

  async quoteSellTokens(holderId: string, params: SellTokensParams) {
    return fetchMetal<{ tokenQuantity: number; dollarValue: number }>(
      `/holder/${holderId}/sell/quote`,
      {
        method: "GET",
        headers: { "x-api-key": this.apiKey },
        body: JSON.stringify(params),
      }
    );
  }
}

export const metal = new MetalServerClient(process.env.METAL_SECRET_API_KEY!);
