import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../supabase";
import { type } from "arktype";
import { verifyPrivyToken } from "../../../auth";
import { queryProjectCreator } from "../../utils";

const financingSchema = type({
  enabled: "boolean",
  target_raise: "number",
  end_date: "string?",
});

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = await params;

  const { data, error } = await supabase
    .from("financing")
    .select("*")
    .eq("project_id", projectId)
    .single();

  if (error) {
    console.error("[Server]: Error fetching financing:", error);
    return NextResponse.json(
      { error: "Failed to fetch financing" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
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
      { error: "Only the project creator can modify the project" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const validatedBody = financingSchema(body);

  if (validatedBody instanceof type.errors) {
    return NextResponse.json(
      { error: "Invalid request body", summary: validatedBody.summary },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("financing")
    .upsert(
      {
        ...validatedBody,
        project_id: projectId,
      },
      { onConflict: "project_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[Server]: Error upserting financing:", error);
    return NextResponse.json(
      { error: "Failed to update financing" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
