import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../supabase";
import { type } from "arktype";
import { verifyPrivyToken } from "../../auth";
import { metal } from "@/lib/metal/server";
import { projectsQuery } from "../../projects/route";

const updateProjectSchema = type({
  title: "string?",
  artist_name: "string?",
  description: "string?",
  status: "string?",
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
  const { projectId } = await params;

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

// Generate a proper token ticker from project title
function generateTokenTicker(projectTitle: string): string {
  // Input validation
  if (!projectTitle || typeof projectTitle !== 'string') {
    return '';
  }
  
  // Remove common music terms and parenthetical content
  const cleanTitle = projectTitle
    .replace(/\s*\([^)]*\)/g, '') // Remove (EP), (Album), etc.
    .replace(/\s*(EP|Album|Single|Mixtape|LP|Deluxe|Remastered|Edition|Vol\.?|Volume)\s*/gi, '') // Remove music terms
    .replace(/[^a-zA-Z\s]/g, '') // Remove special characters
    .trim();

  // Split into words and get significant ones
  const words = cleanTitle.split(/\s+/).filter(word => 
    word.length > 2 && // Skip short words like "of", "in", "the"
    !['the', 'and', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'to', 'from', 'as', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall'].includes(word.toLowerCase())
  );

  let ticker = '';
  
  if (words.length === 0) {
    // Fallback: use first 4 characters of original title
    ticker = projectTitle.replace(/[^a-zA-Z]/g, '').substring(0, 4);
  } else if (words.length === 1) {
    // Single word: use first 4 characters or consonants
    const word = words[0];
    const consonants = word.replace(/[aeiouAEIOU]/g, '');
    ticker = consonants.length >= 3 ? consonants.substring(0, 4) : word.substring(0, 4);
  } else {
    // Multiple words: take first letter of each word, up to 4 chars
    ticker = words.map(word => word[0]).join('').substring(0, 4);
    
    // If ticker is too short, pad with characters from the first word
    if (ticker.length < 3 && words[0].length > 1) {
      const additionalChars = words[0].substring(1, 4 - ticker.length + 1);
      ticker = ticker + additionalChars;
    }
  }

  return ticker.toUpperCase() || 'TKN'; // Fallback to 'TKN' if empty
}

async function createPresale(projectId: string) {
  const { data: project, error } = await projectsQuery
    .eq("id", projectId)
    .single();

  if (error) return { data: null, error };

  if (
    project.presale_id ||
    !project.financing?.end_date ||
    !project.financing.target_raise
  ) {
    console.warn("[Server]: tried to recreate a presale");
    return {
      data: { presale_id: project.presale_id },
      error: null,
    };
  }

  const presale = await metal.createPresale({
    name: project.title,
    description: project.description || "",
    startTimestamp: Math.round(Date.now() / 1000),
    endTimestamp: Math.round(
      new Date(project.financing.end_date).getTime() / 1000
    ),
    targetUsdcAmount: project.financing.target_raise,
    tokenInfo: {
      name: project.title,
      symbol: generateTokenTicker(project.title),
      imageUrl: project.cover_art_url || "sadsad",
      metadata: {
        description: project.description || "",
      },
    },
    deploymentConfig: {
      lockupPercentage: 25,
    },
  });

  if (presale.error) {
    console.error("[Server]: Error creating presale:", presale.error);
    return { data: null, error: presale.error };
  }

  return {
    data: { presale_id: presale.data.id },
    error: null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = await params;

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

  const { data, error } = await supabase
    .from("projects")
    .update({ ...projectUpdate, presale_id })
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
