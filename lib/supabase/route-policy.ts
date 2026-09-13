/**
 * Middleware route policy for Supabase session refresh.
 *
 * Public marketing/auth-form pages render without calling supabase.auth.getUser().
 * Protected app surfaces refresh sessions so cookies stay valid.
 */

const SESSION_REFRESH_PREFIXES = ["/portal", "/admin", "/auth"] as const;

export function requiresSupabaseSessionRefresh(pathname: string): boolean {
  return SESSION_REFRESH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPublicMarketingPath(pathname: string): boolean {
  return !requiresSupabaseSessionRefresh(pathname);
}
