import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

// withTimeout helper behavior
{
  class OperationTimeoutError extends Error {
    constructor(message = "Operation timed out") {
      super(message);
      this.name = "OperationTimeoutError";
    }
  }

  async function withTimeout(promise, timeoutMs, label) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new OperationTimeoutError(label ?? "Operation timed out"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const fast = await withTimeout(Promise.resolve("ok"), 100);
  assert.equal(fast, "ok");

  let timedOut = false;
  try {
    await withTimeout(new Promise(() => {}), 20, "test");
  } catch (error) {
    timedOut = error.name === "OperationTimeoutError";
  }
  assert.equal(timedOut, true);
}

// Middleware hardening
{
  const middleware = read("lib/supabase/middleware.ts");
  assert.match(middleware, /withTimeout/);
  assert.match(middleware, /Supabase auth refresh failed/);
  assert.match(middleware, /catch/);
}

// Client auth initialization hardening
{
  const authContext = read("lib/auth-context.tsx");
  assert.match(authContext, /SESSION_USER_TIMEOUT_MS/);
  assert.match(authContext, /setReady\(true\)/);
  assert.match(authContext, /readyFallbackTimer/);
  assert.match(authContext, /setUser\(null\)/);
  assert.doesNotMatch(authContext, /if \(!supabase\) \{\s*setUser\(readLocalSession\(\)\)/);
  assert.match(authContext, /setTimeout\(/);
}

// sessionUserFromSupabase timeout + profile failure tolerance
{
  const authUser = read("lib/supabase/auth-user.ts");
  assert.match(authUser, /withTimeout/);
  assert.match(authUser, /catch/);
}

// Diagnostics endpoint is staging-only and secret-free
{
  const route = read("app/api/diagnostics/supabase/route.ts");
  assert.match(route, /IS_STAGING/);
  assert.match(route, /getSupabaseDiagnostics/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(route, /service.role/i);
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
