import { supabase } from "../supabase";

export function queryProjectCreator(projectId: string) {
  return supabase
    .from("projects")
    .select("creator_id")
    .eq("id", projectId)
    .single();
}
