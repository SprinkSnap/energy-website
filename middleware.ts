import { type NextRequest, NextResponse } from "next/server";
import { authLog } from "@/lib/supabase/auth-log";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { requiresSupabaseSessionRefresh } from "@/lib/supabase/route-policy";

const IS_STAGING = process.env.NEXT_PUBLIC_SITE_ENV !== "production";

/** Refresh Supabase sessions on protected routes; public pages skip auth refresh. */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  if (requiresSupabaseSessionRefresh(pathname)) {
    authLog(`[auth] protected route, refreshing Supabase session: ${pathname}`);
    response = await updateSupabaseSession(request, response);
  } else {
    authLog(`[auth] public route, session refresh skipped: ${pathname}`);
  }

  response.headers.set("x-pathname", pathname);
  response.headers.set("x-search", request.nextUrl.search);

  const host = request.headers.get("host") ?? "";
  const isPreviewHost =
    host.endsWith(".workers.dev") ||
    host.includes("localhost") ||
    host.startsWith("127.0.0.1");

  if (IS_STAGING || isPreviewHost) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
