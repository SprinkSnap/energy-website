import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser, UserRole } from "@/lib/types";

export async function sessionUserFromSupabase(
  supabase: SupabaseClient,
): Promise<SessionUser | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, company, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  const metadata = user.user_metadata ?? {};
  const roleFromMeta =
    typeof metadata.role === "string" ? (metadata.role as UserRole) : undefined;

  return {
    id: user.id,
    name:
      profile?.name ||
      (typeof metadata.name === "string" ? metadata.name : "") ||
      user.email?.split("@")[0] ||
      "Client",
    email: user.email ?? "",
    company: profile?.company || (typeof metadata.company === "string" ? metadata.company : undefined),
    phone: profile?.phone || (typeof metadata.phone === "string" ? metadata.phone : undefined),
    role: (profile?.role as UserRole | undefined) ?? roleFromMeta ?? "client",
  };
}
