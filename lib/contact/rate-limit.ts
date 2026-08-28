const buckets = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 8;

/** Simple in-process rate limiter. Best-effort on serverless/edge. */
export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const timestamps = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterMs = timestamps[0]! + WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true };
}

export function rateLimitKey(ip: string | null, scope: string): string {
  return `${scope}:${ip ?? "unknown"}`;
}
