import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientAccount, Project, UserRole } from "@/lib/types";
import { fetchProjectsForUser, projectFromRow } from "@/lib/supabase/projects";

type ProfileRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  staff_notes: string | null;
  role: UserRole;
  updated_at: string;
};

export async function fetchClientAccounts(
  supabase: SupabaseClient,
): Promise<ClientAccount[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, email, company, phone, staff_notes, role, updated_at")
    .eq("role", "client")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("user_id");

  if (projectError) throw projectError;

  const counts = new Map<string, number>();
  for (const row of projectRows ?? []) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  return (profiles as ProfileRow[]).map((profile) => ({
    id: profile.id,
    name: profile.name || profile.email || "Client",
    email: profile.email ?? "",
    company: profile.company ?? undefined,
    phone: profile.phone ?? undefined,
    staffNotes: profile.staff_notes ?? undefined,
    projectCount: counts.get(profile.id) ?? 0,
    updatedAt: profile.updated_at,
  }));
}

export async function fetchClientAccount(
  supabase: SupabaseClient,
  clientId: string,
): Promise<ClientAccount | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, company, phone, staff_notes, role, updated_at")
    .eq("id", clientId)
    .eq("role", "client")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const profile = data as ProfileRow;
  const projects = await fetchProjectsForUser(supabase, clientId);

  return {
    id: profile.id,
    name: profile.name || profile.email || "Client",
    email: profile.email ?? "",
    company: profile.company ?? undefined,
    phone: profile.phone ?? undefined,
    staffNotes: profile.staff_notes ?? undefined,
    projectCount: projects.length,
    updatedAt: profile.updated_at,
  };
}

export async function updateClientStaffNotes(
  supabase: SupabaseClient,
  clientId: string,
  staffNotes: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      staff_notes: staffNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .eq("role", "client");

  if (error) throw error;
}

export async function fetchClientProjects(
  supabase: SupabaseClient,
  clientId: string,
): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, data")
    .eq("user_id", clientId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => projectFromRow(row));
}
