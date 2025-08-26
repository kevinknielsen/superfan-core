import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeamMembers, upsertTeamMembers } from "@/app/api/sdk";
import { Tables } from "@/types/database.types";

export function useTeamMembers(projectId: string | null) {
  return useQuery({
    queryKey: ["teamMembers", projectId],
    queryFn: () => (projectId ? fetchTeamMembers(projectId) : []),
    enabled: !!projectId,
  });
}

export function useUpdateTeamMembers(
  projectId: string,
  options?: {
    onSuccess?: () => void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (member: Tables<"team_members">) => {
      return upsertTeamMembers(projectId, [member]);
    },
    onSuccess: () => {
      // queryClient.invalidateQueries({ queryKey: ["teamMembers", projectId] });
      options?.onSuccess?.();
    },
  });
}

export type TeamMembersData = Tables<"team_members">[];
