import { useQuery } from "@tanstack/react-query";
import {
  getSharedFundingProgressUSD,
  fetchUniqueBackersCount,
} from "@/lib/utils";
import { fetchFundedProjects } from "@/app/api/sdk";
import { User } from "@privy-io/react-auth";
import { useMetalHolder } from "./use-metal-holder";

interface FundingData {
  totalUSD: number;
  backersCount: number;
}

export function useFinancing(contractAddress: string | null | undefined) {
  return useQuery({
    queryKey: ["funding", contractAddress],
    queryFn: async (): Promise<FundingData | null> => {
      if (!contractAddress) return null;

      const [fundingResult, backersCount] = await Promise.all([
        getSharedFundingProgressUSD(contractAddress),
        fetchUniqueBackersCount(contractAddress),
      ]);

      return {
        totalUSD: fundingResult?.totalUSD || 0,
        backersCount,
      };
    },
    enabled: !!contractAddress,
  });
}

export function useFundedProjects({ user }: { user: User | null }) {
  const holder = useMetalHolder({ user });
  return useQuery({
    queryKey: ["funded-projects", holder.data?.address],
    queryFn: () => fetchFundedProjects(),
    enabled: !!holder.data?.address,
  });
}

export type FinancingData = FundingData;
