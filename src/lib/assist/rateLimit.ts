/** Recent request times per key. Per server instance and reset on restart: a cost guard, not a quota. */
const hits = new Map<string, number[]>();

/** Sliding-window limiter. Records the hit and returns true when allowed; false once `limit` is reached. */
export function rateLimit(key: string, limit = 30, windowMs = 3_600_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
