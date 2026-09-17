const DEFAULT_FALLBACK = "/portal";

function tryDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Allow only same-origin internal paths for post-login redirects.
 * Rejects external URLs, protocol-relative URLs, and dangerous schemes.
 */
export function sanitizeInternalNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value) return fallback;

  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  const decoded = tryDecode(value);
  if (decoded.startsWith("//")) return fallback;
  if (/^https?:\/\//i.test(decoded)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;

  return value;
}
