import "client-only";

import { getAccessToken } from "@privy-io/react-auth";
import { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";
import { supabase } from "@/lib/supabase";
import type { Project } from "./projects/route";
import { TeamMember } from "./project/[projectId]/team/route";
import type { MetalHolder } from "./metal/route";
import { MetalUserPresales } from "./presales/route";

// Extend Window interface to include Farcaster properties
declare global {
  interface Window {
    farcaster?: {
      user?: {
        fid: number;
      };
    };
    frameContext?: {
      user?: {
        fid: number;
      };
    };
  }
}

// Helper function to detect if we're in a wallet app context
function isInWalletApp(): boolean {
  if (typeof window === "undefined") return false;

  // Check if Farcaster SDK is available and we have a frame context
  return !!(window.farcaster && window.frameContext);
}

// Helper function to get Farcaster user information
function getFarcasterUser(): string | null {
  if (typeof window === "undefined") return null;

  // Try to get from stored context (set by FarcasterProvider)
  if (window.frameContext?.user?.fid) {
    return window.frameContext.user.fid.toString();
  }

  // Try to get from global farcaster SDK directly
  if (window.farcaster?.user?.fid) {
    return window.farcaster.user.fid.toString();
  }

  // If we're in a wallet app but can't find user, log debug info
  if (isInWalletApp()) {
    console.log("[SDK] Farcaster context debug:", {
      hasFarcasterGlobal: !!window.farcaster,
      frameContext: window.frameContext,
      farcasterUser: window.farcaster?.user,
    });
  }

  return null;
}

// Unified function to get authentication headers
async function getAuthHeaders(): Promise<{ Authorization: string }> {
  const inWalletApp = isInWalletApp();

  console.log("[SDK] Auth context:", { inWalletApp });

  if (inWalletApp) {
    // Wallet app: use Farcaster authentication
    const farcasterUserId = getFarcasterUser();
    console.log("[SDK] Farcaster user ID:", farcasterUserId);

    if (!farcasterUserId) {
      throw new Error("Farcaster user not found in wallet app");
    }

    return {
      Authorization: `Farcaster farcaster:${farcasterUserId}`,
    };
  } else {
    // Web app: use Privy authentication
    const accessToken = await getAccessToken();
    console.log("[SDK] Privy token exists:", !!accessToken);

    if (!accessToken) {
      throw new Error("User not logged in");
    }

    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }
}

async function fetchWithAuth<T extends object>(
  url: string,
  options: RequestInit = {}
) {
  const authHeaders = await getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...authHeaders,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(errorData.error || "API request failed");
  }

  return response.json() as T;
}

  // Public fetch for unauthenticated users (like Wallet App users)
async function fetchPublic<T extends object>(
  url: string,
  options: RequestInit = {}
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(errorData.error || "API request failed");
  }

  return response.json() as T;
}

// Smart fetch that tries auth first, falls back to public
async function fetchSmart<T extends object>(
  url: string,
  options: RequestInit = {}
) {
  try {
    await getAuthHeaders();
    return await fetchWithAuth<T>(url, options);
  } catch (error: unknown) {
    // If auth fails, try public
    console.warn("Auth failed, falling back to public fetch:", error);
    return await fetchPublic<T>(url, options);
  }
}

export async function fetchProjects({
  status,
  creatorId,
}: {
  status: ("draft" | "pending" | "published")[];
  creatorId?: string;
}) {
  const params = new URLSearchParams({ status: status.join(",") });
  if (creatorId) params.append("creatorId", creatorId);

  return fetchSmart<Project[]>(`/api/projects?${params.toString()}`);
}

export async function createProject(project: TablesInsert<"projects">) {
  return fetchWithAuth<Tables<"projects">>("/api/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
}

export async function updateProject(
  projectId: string,
  update: TablesUpdate<"projects">
) {
  return fetchWithAuth<Tables<"projects">>(`/api/project/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function fetchProject(projectId: string) {
  return fetchSmart<Project>(`/api/project/${projectId}`);
}

export async function upsertTeamMembers(
  projectId: string,
  teamMembers: TablesUpdate<"team_members">[]
) {
  return fetchWithAuth(`/api/project/${projectId}/team`, {
    method: "POST",
    body: JSON.stringify(teamMembers),
  });
}

export async function fetchTeamMembers(projectId: string) {
  return fetchWithAuth<TeamMember[]>(`/api/project/${projectId}/team`);
}

export async function upsertFinancing(
  projectId: string,
  financing: Omit<TablesUpdate<"financing">, "project_id">
) {
  return fetchWithAuth(`/api/project/${projectId}/financing`, {
    method: "POST",
    body: JSON.stringify({
      ...financing,
      project_id: projectId,
    }),
  });
}

export async function fetchContributions() {
  return fetchWithAuth<Tables<"contributions">[]>(`/api/contributions`);
}

export async function fetchFundedProjects() {
  return fetchSmart<Tables<"projects">[]>(`/api/funded-projects`);
}

export async function createContribution(contribution: {
  amount_usdc: number;
  project_id: string;
}) {
  return fetchWithAuth<Tables<"contributions">>(`/api/contributions`, {
    method: "POST",
    body: JSON.stringify(contribution),
  });
}

export async function getOrCreateMetalHolder() {
  console.log("[SDK] Getting metal holder with unified auth");
  return fetchWithAuth<MetalHolder>(`/api/metal`);
}

export async function listUserPresales() {
  return fetchWithAuth<MetalUserPresales>(`/api/presales`);
}

// Utility to sanitize file names for storage
function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, ""); // Only allow alphanumeric, dot, underscore, dash
}

export const uploadToStorage = async (
  file: File,
  folder: "cover-art" | "track-demo",
  projectId: string
) => {
  const safeName = encodeURIComponent(sanitizeFileName(file.name));
  const path = `${folder}/${projectId}/${safeName}`;
  const { error } = await supabase.storage
    .from("project-assets")
    .upload(path, file, { upsert: true });

  if (error) {
    console.error("Supabase upload error:", error);
    throw error;
  }

  const { data } = supabase.storage.from("project-assets").getPublicUrl(path);

  return data.publicUrl;
};
