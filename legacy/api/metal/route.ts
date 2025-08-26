import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../auth";
import { metal } from "@/lib/metal/server";

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Metal API] Authenticated user: ${auth.userId} (${auth.type})`);

  const holder = await metal.getOrCreateHolder(auth.userId);

  if (holder.error) {
    console.error(
      "[Server]: Error getting or creating Metal holder:",
      holder.error
    );
    return NextResponse.json(
      {
        error: "Failed to get or create holder",
        message: holder.error.message,
      },
      { status: 500 }
    );
  }

  const dedupedTokens = Object.values(
    Object.fromEntries(holder.data.tokens.map((e) => [e.id, e]))
  );

  return NextResponse.json({
    ...holder.data,
    tokens: dedupedTokens,
  });
}

export type MetalHolder = NonNullable<
  Awaited<ReturnType<typeof metal.getOrCreateHolder>>["data"]
>;
