import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser, UserRole } from "@/lib/types";
import { withTimeout } from "@/lib/supabase/with-timeout";

export const SESSION_USER_TIMEOUT_MS = 5000;

type SessionUserOptions = {
  timeoutMs?: number;
};

export async function sessionUserFromSupabase(
  supabase: SupabaseClient,
  options: SessionUserOptions = {},
): Promise<SessionUser | null> {
  const timeoutMs = options.timeoutMs ?? SESSION_USER_TIMEOUT_MS;

  try {
    const {
      data: { user },
      error,
    } = await withTimeout(supabase.auth.getUser(), timeoutMs, "Supabase getUser");

    if (error || !user) return null;

    let profile: {
      name?: string | null;
      company?: string | null;
      phone?: string | null;
      role?: string | null;
    } | null = null;

    try {
      const { data, error: profileError } = await withTimeout(
        supabase
          .from("profiles")
          .select("name, company, phone, role")
          .eq("id", user.id)
          .maybeSingle(),
        timeoutMs,
        "Supabase profile lookup",
      );

      if (!profileError) {
        profile = data;
      }
    } catch {
      // Missing profiles table, network timeout, or other profile lookup failure.
    }

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
      company:
        profile?.company ||
        (typeof metadata.company === "string" ? metadata.company : undefined),
      phone: profile?.phone || (typeof metadata.phone === "string" ? metadata.phone : undefined),
      role: (profile?.role as UserRole | undefined) ?? roleFromMeta ?? "client",
    };
  } catch {
    return null;
  }
}
