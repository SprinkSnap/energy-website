import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/** Refresh Supabase sessions and block workers.dev indexing. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  response = await updateSupabaseSession(request, response);

  const host = request.headers.get("host") ?? "";
  if (host.endsWith(".workers.dev")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
