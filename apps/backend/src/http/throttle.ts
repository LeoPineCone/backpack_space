/**
 * Request limits per route (BE-06), as API Gateway applies them in the cloud: a token bucket per route with a steady
 * rate (requests per second) and a burst. In the cloud the HTTP API does this before a Lambda runs, set from the same
 * settings by the cloud setup; the Lambdas themselves keep no counters (their memory is not shared). The local server
 * uses this class, so local runs and the interface tests answer a burst the same way: `rate_limited`.
 *
 * Limits per player come from the rules themselves: one open run, one fight per round, an answer computed once.
 */
export interface RouteLimit {
  /** steady requests per second over all players */
  rate: number;
  /** requests allowed at once on top of the steady rate */
  burst: number;
}

export class TokenBuckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  /** Takes one token for `route`; false when the bucket is empty. No limit set = always true. */
  take(route: string, limit: RouteLimit | undefined, nowMs: number): boolean {
    if (!limit) return true;
    const b = this.buckets.get(route) ?? { tokens: limit.burst, at: nowMs };
    b.tokens = Math.min(limit.burst, b.tokens + ((nowMs - b.at) / 1000) * limit.rate);
    b.at = nowMs;
    this.buckets.set(route, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}
