import { NextRequest, NextResponse } from "next/server";
import { type } from "arktype";
import { verifyPrivyToken } from "@/app/api/auth";
import { supabase } from "@/app/api/supabase";
import { queryProjectCreator } from "../../utils";
import { Tables, Constants } from "@/types/database.types";

const teamMembersSchema = type(
  {
    project_id: "string",
    wallet_address: "string | null",
    role: "string",
    revenue_share_pct: "number",
    name: "string?",
    id: "string?",
  },
  "[]"
);

export type TeamMember = Omit<
  Tables<"team_members">,
  "role" | "revenue_share_pct"
> & {
  role: (typeof Constants)["public"]["Enums"]["team_member_role"][number];
  revenue_share_pct: number;
};

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = await params;

  const { data: teamMembers, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("project_id", projectId);

  if (error) {
    console.error("[Server]: Error fetching team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 }
    );
  }

  return NextResponse.json(teamMembers);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = await params;

  const jwt = await verifyPrivyToken(request);
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectCreator = await queryProjectCreator(projectId);
  if (projectCreator.error) {
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
  if (jwt.userId !== projectCreator.data.creator_id) {
    return NextResponse.json(
      { error: "Only the project creator can modify team members" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const teamMembersUpdate = teamMembersSchema(body);

  if (teamMembersUpdate instanceof type.errors) {
    return NextResponse.json(
      { error: "Invalid team member data", message: teamMembersUpdate.summary },
      { status: 400 }
    );
  }

  if (teamMembersUpdate.some((m) => m.project_id !== projectId)) {
    return NextResponse.json(
      { error: "Team members do not belong to the same project" },
      { status: 400 }
    );
  }

  const currentTeamMembersPromise = supabase
    .from("team_members")
    .select("id")
    .eq("project_id", projectId);

  const updatedTeamMembersPromise = supabase
    .from("team_members")
    .upsert(teamMembersUpdate, { onConflict: "id" })
    .select();

  const currentTeamMembers = await currentTeamMembersPromise;
  if (currentTeamMembers.data) {
    const updatedIds = new Set(
      teamMembersUpdate.map((m) => m.id).filter(Boolean)
    );
    const removedIds = new Set(
      currentTeamMembers.data.map((m) => m.id)
    ).difference(updatedIds);

    await supabase
      .from("team_members")
      .delete()
      .in("id", [...removedIds]);
  }

  const { data, error } = await updatedTeamMembersPromise;
  if (error) {
    console.error("[Server]: Error updating team members:", error);
    return NextResponse.json(
      { error: "Failed to update team members" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
