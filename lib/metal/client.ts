import { fetchMetal } from "./fetchMetal";

export class MetalPublicClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getHolder(userId: string) {
    return fetchMetal<{
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
    }>(`/holder/${userId}?publicKey=${this.apiKey}`);
  }

  async getPresale(presaleId: string) {
    return fetchMetal<{
      signerId: string;
      orgId: string;
      id: string;
      name: string;
      description: string;
      startTimestamp: number;
      endTimestamp: number;
      presalePrice: number;
      targetUsdcAmount: number;
      purchasedUsdcAmount: number;
      chainId: 8453;
      status: "pending" | "active" | "completed" | "ended";
      participants: object[]; // ----
      tokenInfo: object; // -----
      tokenDeploymentInfo: {
        tokenAddress: string;
        hash: string;
      };
      presaleInfo: {
        distributed: boolean;
        distributeTxHash: string | undefined;
      };
      createdAt: string;
      updatedAt: string;
    }>(`/token/presales/${presaleId}?publicKey=${this.apiKey}`);
  }
}

export const metalPublic = new MetalPublicClient(
  process.env.NEXT_PUBLIC_METAL_API_KEY!
);
