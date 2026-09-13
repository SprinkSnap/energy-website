import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

// sanitizeInternalNextPath (behavior mirrored from lib/sanitize-internal-next-path.ts)
function sanitizeInternalNextPath(next, fallback = "/portal") {
  if (typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  if (decoded.startsWith("//")) return fallback;
  if (/^https?:\/\//i.test(decoded)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;
  return value;
}

{
  assert.equal(sanitizeInternalNextPath("/admin/hot2000-recorder"), "/admin/hot2000-recorder");
  assert.equal(sanitizeInternalNextPath("/portal"), "/portal");
  assert.equal(sanitizeInternalNextPath("/portal/projects"), "/portal/projects");
  assert.equal(sanitizeInternalNextPath("https://example.com"), "/portal");
  assert.equal(sanitizeInternalNextPath("//example.com"), "/portal");
  assert.equal(sanitizeInternalNextPath("javascript:alert(1)"), "/portal");
  assert.equal(sanitizeInternalNextPath(null), "/portal");
  assert.equal(sanitizeInternalNextPath(""), "/portal");
}

// RequireStaff preserves current admin path
{
  const requireStaff = read("components/auth/require-staff.tsx");
  assert.match(requireStaff, /usePathname/);
  assert.match(requireStaff, /sanitizeInternalNextPath/);
  assert.match(requireStaff, /encodeURIComponent\(returnPath\)/);
  assert.doesNotMatch(requireStaff, /next=\/portal\/admin/);
  assert.match(requireStaff, /AccessDenied/);
  assert.doesNotMatch(requireStaff, /router\.replace\("\/portal"\)/);
}

// Login form sanitizes next
{
  const loginForm = read("components/auth/login-form.tsx");
  assert.match(loginForm, /sanitizeInternalNextPath/);
}

// Auth callback sanitizes next
{
  const callback = read("app/auth/callback/route.ts");
  assert.match(callback, /sanitizeInternalNextPath/);
}

// Server-side admin protection
{
  const adminLayout = read("app/admin/layout.tsx");
  assert.match(adminLayout, /evaluateStaffAccess/);
  assert.match(adminLayout, /redirect\(`\/login\?next=/);
  const recorderPage = read("app/admin/hot2000-recorder/page.tsx");
  assert.match(recorderPage, /isCatalogRecorderEnabled/);
  assert.match(recorderPage, /notFound/);
  assert.match(recorderPage, /StaffSessionBanner/);
  assert.match(recorderPage, /evaluateStaffAccess/);
}

// Unauthorized page exists
{
  const unauthorized = read("app/unauthorized/page.tsx");
  assert.match(unauthorized, /AccessDenied/);
}

// Middleware forwards pathname for server redirects
{
  const middleware = read("middleware.ts");
  assert.match(middleware, /x-pathname/);
}

console.log("admin-auth-redirect.test.mjs passed");
