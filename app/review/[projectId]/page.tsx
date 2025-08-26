"use client";

import { useRouter, useParams } from "next/navigation";

import ReviewProject from "@/components/review-project";
import { usePrivy } from "@/lib/auth-context";
import { useUnifiedAuth } from "@/lib/unified-auth-context";
import { useProject, usePublishProject } from "@/hooks/use-projects";

export default function ReviewPage() {
  const router = useRouter();
  const { projectId } = useParams();
  const { user } = usePrivy();
  const { isAdmin: isUserAdmin, isAdminLoading } = useUnifiedAuth();

  const { data: project, error, isLoading } = useProject(projectId as string);

  const publishMutation = usePublishProject(projectId as string, {
    onSuccess: () => {
      router.push("/dashboard");
    },
  });

  const handlePublish = () => {
    if (!project) return;
    publishMutation.mutate();
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (error || !project)
    return (
      <div className="p-8 text-center text-red-500">
        {error instanceof Error ? error.message : "Project not found"}
      </div>
    );



  return (
    <div className="max-w-2xl mx-auto py-12">
      <ReviewProject
        project={project}
        onBack={() => router.push("/dashboard")}
        onPublish={handlePublish}
        isSubmitting={publishMutation.isPending}
      />
      {!isAdminLoading && isUserAdmin && project.status === "pending" && (
        <div className="mt-8 flex justify-end">
          <button
            className="btn-primary px-6 py-3 rounded-lg text-white font-semibold bg-primary hover:bg-primary/90 disabled:opacity-60"
            onClick={handlePublish}
            disabled={publishMutation.isPending}
          >
            {publishMutation.isPending ? "Publishing..." : "Publish Project"}
          </button>
        </div>
      )}
    </div>
  );
}
