import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../auth";
import { metal } from "@/lib/metal/server";

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(
    `[Presales API] Authenticated user: ${auth.userId} (${auth.type})`
  );

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

  const presales = await metal.listPresales();
  if (presales.error) {
    return NextResponse.json(
      {
        error: "Failed to get presales",
        message: presales.error.message,
      },
      { status: 500 }
    );
  }

  let userPresales: MetalUserPresales = [];
  for (const presale of presales.data) {
    const participant = presale.participants.find(
      (p) => holder.data.address.toLowerCase() === p.userAddress.toLowerCase()
    );
    if (!participant) continue;

    userPresales.push({
      ...presale,
      userUsdcAmount: participant.usdcAmount,
    });
  }

  return NextResponse.json(userPresales);
}

export type MetalUserPresales = NonNullable<
  (NonNullable<
    Awaited<ReturnType<typeof metal.listPresales>>["data"]
  >[number] & { userUsdcAmount?: number })[]
>;
