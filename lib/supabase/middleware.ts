import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config";
import { SUPABASE_AUTH_TIMEOUT_MS } from "@/lib/supabase/diagnostics";
import { withTimeout } from "@/lib/supabase/with-timeout";

export async function updateSupabaseSession(request: NextRequest, response: NextResponse) {
  if (!isSupabaseConfigured()) return response;

  try {
    const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    await withTimeout(
      supabase.auth.getUser(),
      SUPABASE_AUTH_TIMEOUT_MS,
      "Supabase auth refresh",
    );
  } catch (error) {
    console.warn(
      "Supabase auth refresh failed",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  return response;
}
