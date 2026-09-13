import { NextResponse } from "next/server";
import { getSupabaseDiagnostics } from "@/lib/supabase/diagnostics";
import { IS_STAGING } from "@/lib/site-env";

export const runtime = "nodejs";

/**
 * Staging-only Supabase health diagnostics.
 * Never returns secrets — only boolean configuration/reachability flags.
 */
export async function GET() {
  if (!IS_STAGING) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diagnostics = await getSupabaseDiagnostics();
  return NextResponse.json(diagnostics);
}
