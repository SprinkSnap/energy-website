import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const authContext = read("lib/auth-context.tsx");
const requireStaff = read("components/auth/require-staff.tsx");

// 1. Supabase auth starts with ready=false until initial sync completes.
{
  assert.match(authContext, /useState\(\(\) => !usingSupabase\)/);
  assert.match(authContext, /initialSyncComplete/);
  assert.match(
    authContext,
    /if \(active && !initialSyncComplete\)[\s\S]*?setReady\(true\)/,
  );
}

// 2. No early setReady(true) between Supabase client init and sync startup.
{
  assert.match(
    authContext,
    /if \(!supabase\) \{[\s\S]*?return;\s*\}\s*let active = true;/,
  );
  assert.doesNotMatch(
    authContext,
    /if \(!supabase\) \{[\s\S]*?return;\s*\}\s*setReady\(true\);\s*let active = true;/,
    "early setReady(true) before syncUser must be removed",
  );
  assert.match(authContext, /void syncUser\(\);/);
}

// 3. RequireStaff waits for ready before redirecting.
{
  assert.match(requireStaff, /if \(!ready \|\| user\) return;/);
  assert.match(requireStaff, /Loading staff portal/);
  assert.match(requireStaff, /router\.replace\(`\/login\?next=/);
}

// 4. Auth state callback does not clear user unless signed out.
{
  assert.match(authContext, /onAuthStateChange\(\(event: AuthChangeEvent, session: Session \| null\)/);
  assert.match(authContext, /if \(event === "SIGNED_OUT"\)/);
  assert.doesNotMatch(
    authContext,
    /if \(!session\?\.user\) \{\s*setUser\(null\);\s*return;\s*\}/,
  );
}

// 5. Logout still clears user.
{
  assert.match(authContext, /const logout = useCallback/);
  assert.match(authContext, /setUser\(null\)/);
  assert.match(authContext, /signOut/);
}

// 6. Server-side admin authorization unchanged.
{
  const adminLayout = read("app/admin/layout.tsx");
  assert.match(adminLayout, /evaluateStaffAccess/);
  assert.match(adminLayout, /redirect\(`\/login\?next=/);
}

console.log("supabase-refresh-login-race.test.mjs passed");
