import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { metalPublic } from "@/lib/metal/client";
import { listUserPresales } from "@/app/api/sdk";

export function usePresale(presaleId: string | null | undefined) {
  return useQuery({
    queryKey: ["presale", presaleId],
    queryFn: async () => {
      const presale = await metalPublic.getPresale(presaleId!);
      return presale.data;
    },
    enabled: !!presaleId,
    // Balanced for presale data (more dynamic than projects)
    gcTime: 3 * 60 * 1000, // 3 minutes garbage collection
    staleTime: 10 * 1000, // 10 seconds - presale data changes more frequently
    refetchInterval: 30 * 1000, // Refetch every 30 seconds for live updates
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Moderate retry for presale data
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 3000),
  });
}

export function useUserPresales() {
  return useQuery({
    queryKey: ["user presales"],
    queryFn: listUserPresales,
    // placeholderData: keepPreviousData,
    gcTime: 5 * 60 * 1000, // 5 minutes instead of Infinity
    staleTime: 60 * 1000, // Consider data stale after 1 minute
  });
}
