import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";

export const SUPABASE_AUTH_TIMEOUT_MS = 4000;

export type SupabaseDiagnostics = {
  configured: boolean;
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  authReachable: boolean;
};

/** Safe Supabase configuration diagnostics — never returns secrets. */
export async function getSupabaseDiagnostics(): Promise<SupabaseDiagnostics> {
  const urlConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const anonKeyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const configured = isSupabaseConfigured();

  let authReachable = false;
  if (configured) {
    try {
      const supabase = await createSupabaseServerClient();
      if (supabase) {
        await withTimeout(
          supabase.auth.getUser(),
          SUPABASE_AUTH_TIMEOUT_MS,
          "Supabase auth health check",
        );
        authReachable = true;
      }
    } catch {
      authReachable = false;
    }
  }

  return {
    configured,
    urlConfigured,
    anonKeyConfigured,
    authReachable,
  };
}
