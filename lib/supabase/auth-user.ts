import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/types";

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
    .select("name, company, phone")
    .eq("id", user.id)
    .maybeSingle();

  const metadata = user.user_metadata ?? {};

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
  };
}
