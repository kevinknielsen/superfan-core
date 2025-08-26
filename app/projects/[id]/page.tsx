"use client";

import Link from "next/link";
import { notFound, useRouter, useParams } from "next/navigation";
import { usePrivy } from "@/lib/auth-context";

import { Loader2 } from "lucide-react";

import { useTeamMembers } from "@/hooks/use-team-members";
import { useProject } from "@/hooks/use-projects";
import { useProjectRoles } from "@/lib/auth-utils";

export default function ProjectPage() {
  const { user } = usePrivy();
  const params = useParams();

  const projectId = params.id as string;

  const { data: project, isLoading } = useProject(projectId);
  const { data: teamMembers } = useTeamMembers(projectId);
  const { canView } = useProjectRoles(project, user, teamMembers);
  
  if (isLoading) {
    return (
      <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </main>
    );
  }

  if (!project) {
    return notFound();
  }

  // Allow public access to published projects, restrict access to draft/pending projects
  const isPublished = project.status === "published";
  if (!isPublished && !canView) {
    return (
      <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
        <div className="text-center py-20">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            You don't have permission to view this project's details.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">{project.title}</h1>
      <p className="text-sm sm:text-base text-muted-foreground mb-6">
        {project.description || "No description provided."}
      </p>

      <nav className="flex gap-4 mb-6 sm:mb-8 border-b pb-2 overflow-x-auto">
        <Link
          href={`/projects/${project.id}`}
          className="font-medium text-primary hover:underline border-b-2 border-primary whitespace-nowrap"
        >
          Overview
        </Link>
        <Link
          href={`/projects/${project.id}/collaborators`}
          className="font-medium text-muted-foreground hover:text-primary hover:underline whitespace-nowrap"
        >
          Collaborators
        </Link>
        <Link
          href={`/projects/${project.id}/cap-table`}
          className="font-medium text-muted-foreground hover:text-primary hover:underline whitespace-nowrap"
        >
          Cap Table
        </Link>
      </nav>

      <section>
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Overview</h2>
        <div className="space-y-4">
          <p className="text-sm sm:text-base">
            This is the overview section for <b>{project.title}</b>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-medium mb-2 text-sm sm:text-base">Artist</h3>
              <p className="text-muted-foreground text-sm sm:text-base">
                {project.artist_name || "Unknown"}
              </p>
            </div>

            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-medium mb-2 text-sm sm:text-base">Status</h3>
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  project.status === "published"
                    ? "bg-green-100 text-green-800"
                    : project.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {project.status || "draft"}
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}


