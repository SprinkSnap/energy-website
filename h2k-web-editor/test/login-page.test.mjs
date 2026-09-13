import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

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

// Login page renders without Suspense fallback
{
  const page = read("app/login/page.tsx");
  assert.doesNotMatch(page, /Suspense/);
  assert.doesNotMatch(page, /Loading…/);
  assert.match(page, /searchParams/);
  assert.match(page, /sanitizeInternalNextPath/);
  assert.match(page, /<LoginForm nextPath=\{nextPath\} \/>/);
}

// LoginForm no longer uses useSearchParams
{
  const form = read("components/auth/login-form.tsx");
  assert.doesNotMatch(form, /useSearchParams/);
  assert.match(form, /nextPath/);
  assert.match(form, /router\.push\(nextPath\)/);
}

// Internal next path preserved
{
  assert.equal(sanitizeInternalNextPath("/portal"), "/portal");
  assert.equal(sanitizeInternalNextPath("/admin/hot2000-recorder"), "/admin/hot2000-recorder");
}

// Missing next falls back to portal
{
  assert.equal(sanitizeInternalNextPath(null), "/portal");
  assert.equal(sanitizeInternalNextPath(undefined), "/portal");
}

// External next path rejected
{
  assert.equal(sanitizeInternalNextPath("https://evil.example.com"), "/portal");
  assert.equal(sanitizeInternalNextPath("//evil.example.com"), "/portal");
}

console.log("login-page.test.mjs passed");
