import { type NextRequest, NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

const IS_STAGING = process.env.NEXT_PUBLIC_SITE_ENV !== "production";

/** Refresh Supabase sessions and block indexing on staging / preview hostnames. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  response = await updateSupabaseSession(request, response);

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
