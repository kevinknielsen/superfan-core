import { useQuery } from "@tanstack/react-query";
import { fetchContributions } from "@/app/api/sdk";
import { Tables } from "@/types/database.types";

export function useContributions({ enabled = true }: { enabled: boolean }) {
  return useQuery({
    queryKey: ["contributions"],
    queryFn: fetchContributions,
    enabled,
  });
}

export type ContributionsData = Tables<"contributions">[];
