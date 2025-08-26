import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../supabase";
import { verifyUnifiedAuth } from "../auth";
import { type } from "arktype";
import { metal } from "@/lib/metal/server";
import { projectsQuery } from "../projects/route";

const createContributionSchema = type({
  amount_usdc: "number",
  project_id: "string",
});

export async function POST(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Contributions API] Authenticated user: ${auth.userId} (${auth.type})`);

  const body = await request.json();
  const contribution = createContributionSchema(body);

  if (contribution instanceof type.errors) {
    console.error("[Server]: Invalid request body:", contribution);
    return NextResponse.json(
      { error: "Invalid request body", message: contribution.summary },
      { status: 400 }
    );
  }

  const project = await projectsQuery
    .eq("id", contribution.project_id)
    .single();
  if (project.error) {
    console.error("[Server]: Error fetching project:", project.error);
    return NextResponse.json({ error: project.error.message }, { status: 500 });
  }
  if (project.data.presale_id === null) {
    console.warn("[Server]: Tried to contribute to project without a presale");
    return NextResponse.json(
      { error: "Project doesn't have a presale" },
      { status: 400 }
    );
  }

  const holder = await metal.getOrCreateHolder(auth.userId);
  if (holder.error) {
    return NextResponse.json(
      { error: "Failed to get or create metal holder" },
      { status: 500 }
    );
  }

  console.log(`[Contributions API] Using Metal holder: ${holder.data.id} for user: ${auth.userId}`);

  const { error: buyPresaleError } = await metal.buyPresale(holder.data.id, {
    presaleId: project.data.presale_id,
    usdcAmount: contribution.amount_usdc,
  });
  if (buyPresaleError) {
    console.error("[Server]: Error buying presale:", buyPresaleError);
    return NextResponse.json(
      { error: "Failed to buy presale", message: buyPresaleError.message },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("contributions")
    .insert({
      ...contribution,
      wallet_address: holder.data.address,
      user_id: auth.userId,
    })
    .select()
    .single();

  if (error) {
    console.error("[Server]: Error creating contribution:", error);
    return NextResponse.json(
      { error: "Failed to create contribution" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const holder = await metal.getOrCreateHolder(auth.userId);
  if (holder.error) {
    return NextResponse.json(
      { error: "Failed to get metal holder" },
      { status: 500 }
    );
  }

  const { data: contributions, error } = await supabase
    .from("contributions")
    .select("project_id, wallet_address, created_at")
    .eq("wallet_address", holder.data.address);

  if (error) {
    console.error("[Server]: Error fetching contributions:", error);
    return NextResponse.json(
      { error: "Failed to fetch contributions" },
      { status: 500 }
    );
  }

  return NextResponse.json(contributions);
}
