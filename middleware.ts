import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const IS_STAGING = process.env.NEXT_PUBLIC_SITE_ENV !== "production";

/** Block search indexing on staging / preview hostnames. */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isPreviewHost =
    host.endsWith(".workers.dev") ||
    host.includes("localhost") ||
    host.startsWith("127.0.0.1");

  if (IS_STAGING || isPreviewHost) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
