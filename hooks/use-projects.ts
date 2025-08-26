import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { fetchProjects } from "@/app/api/sdk";
import { fetchProject, updateProject } from "@/app/api/sdk";
import { Project } from "@/app/api/projects/route";

export function useProjects<TData = Project[]>({
  status,
  creatorId,
  enabled = true,
  select,
}: {
  status: ("draft" | "pending" | "published")[];
  creatorId?: string;
  enabled?: boolean;
  select?: (data: Project[]) => TData;
}) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["projects", { status, creatorId }],
    queryFn: async () => {
      const projects = await fetchProjects({ status, creatorId });

      // Ensure we always return an array, even if API returns unexpected data
      if (!Array.isArray(projects)) {
        console.warn("[useProjects] API returned non-array data:", projects);
        return [];
      }

      return projects;
    },
    enabled: enabled,
    // Balanced caching strategy for project data
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    staleTime: 15 * 1000, // 15 seconds - reasonable balance for project data
    placeholderData: keepPreviousData,
    select,
    // Optimized refetch strategy
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Good for when users return to tab
    refetchOnReconnect: true,
    // Moderate retry policy - not too aggressive
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
    // Single project data changes less frequently
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    staleTime: 60 * 1000, // 1 minute - individual projects change even less frequently
    // Moderate refetch strategies
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

export function usePublishProject(
  projectId: string,
  options?: {
    onSuccess?: () => void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => updateProject(projectId, { status: "published" }),
    onSuccess: () => {
      // Invalidate relevant queries after publishing
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({
        queryKey: ["project", projectId],
      });
      options?.onSuccess?.();
    },
  });
}
