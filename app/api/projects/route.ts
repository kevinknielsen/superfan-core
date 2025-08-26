import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../supabase";
import { verifyUnifiedAuth } from "../auth";
import { type } from "arktype";
import { QueryData } from "@supabase/supabase-js";
import { TeamMember } from "../project/[projectId]/team/route";

const createProjectSchema = type({
  title: "string",
  artist_name: "string",
  description: "string",
  status: "string",
  creatorwalletaddress: "string",
  cover_art_url: "string?",
  track_demo_url: "string?",
  image_urls: "string[]?",
});

export const projectsQuery = supabase
  .from("projects")
  .select("*, financing:financing(target_raise, end_date)");

export type Project = Omit<
  QueryData<typeof projectsQuery>[number],
  "team_members"
> & { team_members: TeamMember[] };

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || "published";
  const creatorId = request.nextUrl.searchParams.get("creatorId");

  let query = projectsQuery.in("status", status.split(","));
  if (creatorId) query = query.eq("creator_id", creatorId);

  const { data, error } = await query;

  console.log({
    data,
  });

  if (error) {
    console.error("[Server]: Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(
    `[Projects API] Authenticated user: ${auth.userId} (${auth.type})`
  );

  const body = await request.json();
  const project = createProjectSchema(body);

  if (project instanceof type.errors) {
    console.error("[Server]: Invalid request body:", project);
    return NextResponse.json(
      { error: "Invalid request body", message: project.summary },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...project,
      creator_id: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[Server]: Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
