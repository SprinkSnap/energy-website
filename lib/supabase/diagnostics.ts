import { getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config";
import { withTimeout } from "@/lib/supabase/with-timeout";

export const SUPABASE_AUTH_TIMEOUT_MS = 4000;

export type SupabaseDiagnostics = {
  configured: boolean;
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  urlFormatValid: boolean;
  authReachable: boolean;
};

export function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

async function checkSupabaseAuthEndpoint(url: string): Promise<boolean> {
  const healthUrl = `${url.replace(/\/$/, "")}/auth/v1/health`;
  try {
    const response = await withTimeout(
      fetch(healthUrl, { method: "GET", cache: "no-store" }),
      SUPABASE_AUTH_TIMEOUT_MS,
      "Supabase auth health check",
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Safe Supabase configuration diagnostics — never returns secrets. */
export async function getSupabaseDiagnostics(): Promise<SupabaseDiagnostics> {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const urlConfigured = Boolean(rawUrl);
  const anonKeyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const configured = isSupabaseConfigured();
  const urlFormatValid = urlConfigured && isValidSupabaseUrl(rawUrl);

  let authReachable = false;
  if (configured && urlFormatValid) {
    try {
      authReachable = await checkSupabaseAuthEndpoint(getSupabaseUrl());
    } catch {
      authReachable = false;
    }
  }

  return {
    configured,
    urlConfigured,
    anonKeyConfigured,
    urlFormatValid,
    authReachable,
  };
}
