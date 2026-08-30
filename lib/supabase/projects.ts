import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types";

type ProjectRow = {
  id: string;
  user_id: string;
  data: Project;
  created_at: string;
  updated_at: string;
};

export function projectFromRow(row: Pick<ProjectRow, "id" | "data">): Project {
  return {
    ...row.data,
    id: row.id,
  };
}

export function projectToRow(project: Project, userId: string): Pick<ProjectRow, "id" | "user_id" | "data"> {
  const { id, ...rest } = project;
  return {
    id,
    user_id: userId,
    data: { ...rest, id } as Project,
  };
}

export async function fetchProjectsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, data")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => projectFromRow(row as Pick<ProjectRow, "id" | "data">));
}

export async function upsertProject(
  supabase: SupabaseClient,
  project: Project,
  userId: string,
): Promise<void> {
  const row = projectToRow(project, userId);
  const { error } = await supabase.from("projects").upsert({
    id: row.id,
    user_id: row.user_id,
    data: row.data,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteProjectRow(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (error) throw error;
}
