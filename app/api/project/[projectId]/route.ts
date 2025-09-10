import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../supabase";
import { type } from "arktype";
import { verifyPrivyToken } from "../../auth";
// Metal integration removed - legacy funding system disabled
import { projectsQuery } from "../../projects/route";

const updateProjectSchema = type({
  title: "string?",
  artist_name: "string?",
  description: "string?",
  status: "'draft'|'pending'|'published'|'archived'?",
  creatorwalletaddress: "string?",
  cover_art_url: "(string | null)?",
  track_demo_url: "(string | null)?",
  early_curator_shares: "boolean?",
  image_urls: "string[]?",
});

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;

  const { data, error } = await projectsQuery.eq("id", projectId).maybeSingle();

  if (error) {
    console.error("[Server]: Error fetching project:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// generateTokenTicker removed - unused in current implementation

async function createPresale(projectId: string) {
  // Metal integration disabled - legacy funding system
  console.warn("[Server]: Presale creation disabled - legacy funding system removed");
  return {
    data: { presale_id: null },
    error: null, // Return success instead of error to allow publish flow to continue
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;

  const jwt = await verifyPrivyToken(request);
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const projectUpdate = updateProjectSchema(body);

  if (projectUpdate instanceof type.errors) {
    console.error("[Server]: Invalid request body:", projectUpdate);
    return NextResponse.json(
      { error: "Invalid request body", summary: projectUpdate.summary },
      { status: 400 }
    );
  }

  let presale_id;
  if (projectUpdate.status === "published") {
    const { data, error } = await createPresale(projectId);
    if (error) {
      console.error("[Server]: Error creating presale:", error);
      return NextResponse.json(
        { error: "Failed to create presale", message: error.message },
        { status: 500 }
      );
    }
    presale_id = data?.presale_id;
  }

  const updatePayload = presale_id === undefined ? projectUpdate : { ...projectUpdate, presale_id };
  const { data, error } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId)
    .eq("creator_id", jwt.userId)
    .select()
    .single();

  if (error) {
    console.error("[Server]: Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
