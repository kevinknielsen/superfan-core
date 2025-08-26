import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../supabase";
import { verifyUnifiedAuth } from "../auth";
import { metal } from "@/lib/metal/server";

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Funded Projects API] Authenticated user: ${auth.userId} (${auth.type})`);

  const holder = await metal.getOrCreateHolder(auth.userId);
  if (holder.error) {
    return NextResponse.json(
      { error: "Failed to get metal holder", message: holder.error.message },
      { status: 500 }
    );
  }

  const { data: contributions, error: contributionsError } = await supabase
    .from("contributions")
    .select("project_id")
    .eq("wallet_address", holder.data.address);

  if (contributionsError) {
    console.error(
      "[Server]: Error fetching user contributions:",
      contributionsError
    );
    return NextResponse.json(
      { error: "Failed to fetch contributions" },
      { status: 500 }
    );
  }

  if (!contributions || contributions.length === 0) {
    return NextResponse.json([]);
  }

  const projectIds = [
    ...new Set(contributions.map((c) => c.project_id)),
  ].filter(Boolean);

  if (projectIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: fundedProjects, error } = await supabase
    .from("projects")
    .select("*, financing:financing(target_raise, end_date)")
    .in("id", projectIds)
    .eq("status", "published")
    .neq("creator_id", auth.userId); // Exclude projects created by the user

  if (error) {
    console.error("[Server]: Error fetching funded projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch funded projects" },
      { status: 500 }
    );
  }

  return NextResponse.json(fundedProjects);
}
