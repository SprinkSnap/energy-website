import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

function requiresSupabaseSessionRefresh(pathname) {
  const prefixes = ["/portal", "/admin", "/auth"];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Route policy
{
  assert.equal(requiresSupabaseSessionRefresh("/create-account"), false);
  assert.equal(requiresSupabaseSessionRefresh("/login"), false);
  assert.equal(requiresSupabaseSessionRefresh("/about"), false);
  assert.equal(requiresSupabaseSessionRefresh("/"), false);
  assert.equal(requiresSupabaseSessionRefresh("/portal"), true);
  assert.equal(requiresSupabaseSessionRefresh("/portal/projects"), true);
  assert.equal(requiresSupabaseSessionRefresh("/admin/hot2000-recorder"), true);
  assert.equal(requiresSupabaseSessionRefresh("/auth/callback"), true);
}

// Middleware skips session refresh on public routes
{
  const middleware = read("middleware.ts");
  assert.match(middleware, /requiresSupabaseSessionRefresh/);
  assert.match(middleware, /public route, session refresh skipped/);
  assert.match(middleware, /protected route, refreshing Supabase session/);
  assert.doesNotMatch(middleware, /updateSupabaseSession\(request, response\);\s*response\.headers/s);
}

// Client auth is non-blocking for public pages
{
  const authContext = read("lib/auth-context.tsx");
  assert.match(authContext, /useState\(\(\) => !usingSupabase\)/);
  assert.match(authContext, /initialSyncComplete/);
  assert.match(authContext, /void syncUser\(\)/);
  assert.match(authContext, /SIGN_UP_TIMEOUT_MS/);
  assert.match(authContext, /Unable to reach the account service/);
  assert.doesNotMatch(authContext, /readyFallbackTimer/);
}

// Diagnostics verify URL format and auth health endpoint
{
  const diagnostics = read("lib/supabase/diagnostics.ts");
  assert.match(diagnostics, /urlFormatValid/);
  assert.match(diagnostics, /auth\/v1\/health/);
  assert.doesNotMatch(diagnostics, /fxefdgrbtczowzocxwkr/);
}

// Public create-account does not require auth gate
{
  const page = read("app/create-account/page.tsx");
  assert.doesNotMatch(page, /RequireAuth/);
  assert.doesNotMatch(page, /RequireStaff/);
}

// Admin recorder remains staff-protected
{
  const recorder = read("app/admin/hot2000-recorder/page.tsx");
  assert.match(recorder, /evaluateStaffAccess/);
  const requireStaff = read("components/auth/require-staff.tsx");
  assert.match(requireStaff, /AccessDenied/);
}

console.log("supabase-auth-resilience.test.mjs passed");
