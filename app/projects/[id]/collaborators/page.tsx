"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter, useParams } from "next/navigation";
import { usePrivy } from "@/lib/auth-context";
import { useProject } from "@/hooks/use-projects";
import { useTeamMembers, useUpdateTeamMembers } from "@/hooks/use-team-members";
import {
  Loader2,
  Plus,
  Edit2,
  Save,
  X,
  Users,
  Music,
  Mic,
  User,
} from "lucide-react";

import { Constants, Tables } from "@/types/database.types";
import { TeamMember } from "@/app/api/project/[projectId]/team/route";
import { useProjectRoles } from "@/lib/auth-utils";

export default function CollaboratorsPage() {
  const { user } = usePrivy();
  const params = useParams();
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});

  const projectId = params.id as string;

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: teamMembers, isLoading: teamMembersLoading } =
    useTeamMembers(projectId);
  const updateTeamMemberMutation = useUpdateTeamMembers(projectId, {
    onSuccess: () => {
      setEditingMember(null);
      setEditForm({});
    },
  });
  
  const { isCreator, isAdmin, isTeamMember, canEdit, canView } = useProjectRoles(
    project,
    user,
    teamMembers
  );

  if (projectLoading || teamMembersLoading) {
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
            You don't have permission to view this project's collaborators.
          </p>
        </div>
      </main>
    );
  }

  const handleEditMember = (member: TeamMember) => {
    setEditingMember(member.id);
    setEditForm({
      ...member,
      flat_fee: member.flat_fee ? member.flat_fee / 100 : undefined, // Convert cents to dollars for display
    });
  };

  const handleSaveMember = async () => {
    if (!editingMember || !editForm) return;

    const updateData = {
      ...editForm,
      flat_fee: editForm.flat_fee ? editForm.flat_fee * 100 : null, // Convert dollars to cents
      revenue_share_pct: editForm.revenue_share_pct,
    };

    updateTeamMemberMutation.mutate(updateData as TeamMember);
  };

  const handleCancelEdit = () => {
    setEditingMember(null);
    setEditForm({});
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "Artist":
      case "Featured Artist":
      case "Performer":
        return <Mic className="h-4 w-4" />;
      case "Producer":
      case "Engineer":
      case "Mixer":
      case "Mastering":
      case "Sound Designer":
        return <Music className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const formatCurrency = (cents?: number) => {
    if (cents === null || cents === undefined) return "—";
    return `$${(cents / 100).toLocaleString()}`;
  };

  return (
    <main className="max-w-5xl mx-auto py-6 sm:py-10 px-4">
      <h1 className="text-2xl sm:text-3xl font-bold mb-2">
        {project.title} – Collaborators
      </h1>

      {/* Navigation */}
      <nav className="flex gap-4 mb-6 sm:mb-8 border-b pb-2 overflow-x-auto">
        <Link
          href={`/projects/${project.id}`}
          className="font-medium text-muted-foreground hover:text-primary hover:underline whitespace-nowrap"
        >
          Overview
        </Link>
        <Link
          href={`/projects/${project.id}/collaborators`}
          className="font-medium text-primary hover:underline border-b-2 border-primary whitespace-nowrap"
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

      {/* Team Members Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-semibold">Team Members</h2>
          {canEdit && (
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">
              <Plus className="h-4 w-4" />
              Add Member
            </button>
          )}
        </div>

        <div className="space-y-4">
          {teamMembers?.map((member) => (
            <div key={member.id} className="border rounded-lg p-4 sm:p-6">
              {editingMember === member.id ? (
                /* Edit Form */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Role
                      </label>
                      <select
                        value={editForm.role || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            role: e.target.value as TeamMember["role"],
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        {Constants.public.Enums.team_member_role.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={editForm.email || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Copyright Type
                      </label>
                      <select
                        value={editForm.copyright_type || "sound_recording"}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            copyright_type: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="sound_recording">
                          Sound Recording (Master)
                        </option>
                        <option value="composition">
                          Composition (Publishing)
                        </option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                  </div>

                  {/* Producer-specific fields */}
                  {editForm.role === "Producer" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-blue-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Deal Type
                        </label>
                        <select
                          value={editForm.deal_type || "indie"}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              deal_type: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        >
                          <option value="indie">Indie Deal</option>
                          <option value="major_label">Major Label</option>
                          <option value="flat_fee_only">Flat Fee Only</option>
                        </select>
                      </div>
                      {editForm.deal_type !== "major_label" && (
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Flat Fee ($)
                          </label>
                          <input
                            type="number"
                            value={editForm.flat_fee || ""}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                flat_fee: Number(e.target.value),
                              }))
                            }
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                      )}
                      {editForm.deal_type === "indie" && (
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Backend %
                          </label>
                          <input
                            type="number"
                            value={editForm.backend_percentage || ""}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                backend_percentage: Number(e.target.value),
                              }))
                            }
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                      )}
                      {editForm.deal_type === "major_label" && (
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Producer Points
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={editForm.producer_points || ""}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                producer_points: Number(e.target.value),
                              }))
                            }
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* PRO fields for songwriters */}
                  {(editForm.copyright_type === "composition" ||
                    editForm.copyright_type === "both") && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-green-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          PRO
                        </label>
                        <select
                          value={editForm.pro_affiliation || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              pro_affiliation: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        >
                          <option value="">Select PRO...</option>
                          <option value="ASCAP">ASCAP</option>
                          <option value="BMI">BMI</option>
                          <option value="SESAC">SESAC</option>
                          <option value="SOCAN">SOCAN</option>
                          <option value="PRS">PRS</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          IPI Number
                        </label>
                        <input
                          type="text"
                          value={editForm.ipi_number || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              ipi_number: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Publisher
                        </label>
                        <input
                          type="text"
                          value={editForm.publisher || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              publisher: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
                    >
                      <X className="h-4 w-4 inline mr-1" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveMember}
                      disabled={updateTeamMemberMutation.isPending}
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 text-sm disabled:opacity-50"
                    >
                      {updateTeamMemberMutation.isPending ? (
                        <Loader2 className="h-4 w-4 inline mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 inline mr-1" />
                      )}
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {getRoleIcon(member.role!)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">
                          {member.name || "Unnamed"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {member.role}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleEditMember(member)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Email
                      </label>
                      <p className="text-sm">{member.email || "—"}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Revenue Share
                      </label>
                      <p className="text-sm font-medium">
                        {member.revenue_share_pct?.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Copyright Type
                      </label>
                      <p className="text-sm capitalize">
                        {member.copyright_type?.replace("_", " ") ||
                          "Sound Recording"}
                      </p>
                    </div>

                    {/* Producer fields */}
                    {member.role === "Producer" && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Deal Type
                          </label>
                          <p className="text-sm capitalize">
                            {member.deal_type?.replace("_", " ") || "Indie"}
                          </p>
                        </div>
                        {member.flat_fee && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Flat Fee
                            </label>
                            <p className="text-sm font-medium">
                              {formatCurrency(member.flat_fee)}
                            </p>
                          </div>
                        )}
                        {member.backend_percentage && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Backend %
                            </label>
                            <p className="text-sm">
                              {member.backend_percentage}%
                            </p>
                          </div>
                        )}
                        {member.producer_points && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Producer Points
                            </label>
                            <p className="text-sm">
                              {member.producer_points} points
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* PRO fields */}
                    {(member.copyright_type === "composition" ||
                      member.copyright_type === "both") && (
                      <>
                        {member.pro_affiliation && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              PRO
                            </label>
                            <p className="text-sm">{member.pro_affiliation}</p>
                          </div>
                        )}
                        {member.ipi_number && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              IPI Number
                            </label>
                            <p className="text-sm font-mono">
                              {member.ipi_number}
                            </p>
                          </div>
                        )}
                        {member.publisher && (
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">
                              Publisher
                            </label>
                            <p className="text-sm">{member.publisher}</p>
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Wallet Address
                      </label>
                      <p className="text-sm font-mono">
                        {member.wallet_address
                          ? `${member.wallet_address.slice(
                              0,
                              6
                            )}...${member.wallet_address.slice(-4)}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {(!teamMembers || teamMembers.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members found</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
