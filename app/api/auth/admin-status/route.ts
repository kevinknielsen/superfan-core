import { NextRequest, NextResponse } from "next/server";
import { verifyUnifiedAuth } from "../../auth";
import { isAdmin } from "@/lib/security";

export async function GET(request: NextRequest) {
  const auth = await verifyUnifiedAuth(request);
  
  if (!auth) {
    return NextResponse.json({ isAdmin: false });
  }

  // Server-side admin check using the secure isAdmin function
  const isUserAdmin = isAdmin(auth.userId);
  
  return NextResponse.json({ 
    isAdmin: isUserAdmin,
    userId: auth.userId // Optional: include for debugging
  });
} 