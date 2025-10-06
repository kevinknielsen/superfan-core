import { useMutation, useQuery } from "@tanstack/react-query";
import { User } from "@privy-io/react-auth";
import { useFarcaster } from "@/lib/farcaster-context";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { metal } from "@/lib/metal/client";

async function getOrCreateMetalHolder(id: string) {
  const holder = await metal.getHolder(id);
  if (holder) return holder;
  return metal.createUser(id);
}

export function useMetalHolder() {
  const { user } = useUnifiedAuth();

  return useQuery({
    queryKey: ["metal holder", user?.id],
    queryFn: async () => {
      return getOrCreateMetalHolder(user?.id);
    },
    enabled: !!user?.id,
  });
}

export function useBuyPresale() {
  const metalHolder = useMetalHolder();

  return useMutation({
    mutationKey: ["buy presale", metalHolder.data?.id],
    mutationFn: async (data: {
      user: User;
      campaignId: string;
      amount: number;
    }) => {
      return metal.buyPresale(data.user.id, data.campaignId, data.amount);
    },
  });
}
