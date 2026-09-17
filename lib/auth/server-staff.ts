import { isStaffRole } from "@/lib/roles";
import { sessionUserFromSupabase } from "@/lib/supabase/auth-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types";

export type StaffAccessResult =
  | { kind: "allowed"; user: SessionUser }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: SessionUser }
  | { kind: "local" };

/** Server-side staff session check. Returns `local` when Supabase is not configured. */
export async function evaluateStaffAccess(): Promise<StaffAccessResult> {
  if (!isSupabaseConfigured()) {
    return { kind: "local" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { kind: "local" };
  }

  const user = await sessionUserFromSupabase(supabase);
  if (!user) {
    return { kind: "unauthenticated" };
  }

  if (!isStaffRole(user.role)) {
    return { kind: "forbidden", user };
  }

  return { kind: "allowed", user };
}
