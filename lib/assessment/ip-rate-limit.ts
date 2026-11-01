// Assessment-only, single-process fixed-window counters. Not a production store.
export const IP_RATE_MARKER = "ip-rate-limit-v1";
export const IP_RATE_POLICIES = Object.freeze({
  signup: Object.freeze({limit: 5, windowMs: 10 * 60_000}),
  login: Object.freeze({limit: 10, windowMs: 60_000}),
  reset: Object.freeze({limit: 3, windowMs: 15 * 60_000}),
});
export type RateOperation = keyof typeof IP_RATE_POLICIES;
export type AssessmentPeer = "127.0.0.1" | "127.0.0.2";
export function assessmentPeer(peer: string | undefined): AssessmentPeer | null {
  const normalized = peer?.startsWith("::ffff:") ? peer.slice(7) : peer;
  return normalized === "127.0.0.1" || normalized === "127.0.0.2" ? normalized : null;
}
export type RateDecision = {allowed: boolean; limit: number; remaining: number; resetSeconds: number};
export class AssessmentIpLimiter {
  private readonly counters = new Map<string, {count: number; expires: number}>();
  private readonly now: () => number;
  constructor(now: () => number = () => performance.now()) { this.now = now; }
  consume(operation: RateOperation, peer: AssessmentPeer): RateDecision {
    // Defensive runtime checks bound the map to six keys even for untyped callers.
    if (!Object.hasOwn(IP_RATE_POLICIES, operation) || assessmentPeer(peer) !== peer) {
      throw new Error("Unsupported assessment counter key.");
    }
    const policy = IP_RATE_POLICIES[operation], time = this.now(), key = operation + ":" + peer;
    let counter = this.counters.get(key);
    if (!counter || time >= counter.expires) {
      counter = {count: 0, expires: time + policy.windowMs};
      this.counters.set(key, counter);
    }
    const allowed = counter.count < policy.limit;
    if (allowed) counter.count++;
    return {allowed, limit: policy.limit, remaining: Math.max(0, policy.limit - counter.count),
      resetSeconds: Math.max(1, Math.ceil((counter.expires - time) / 1000))};
  }
}
export function rateHeaders(decision: RateDecision): Record<string, string> {
  return {"ratelimit-limit": String(decision.limit), "ratelimit-remaining": String(decision.remaining),
    "ratelimit-reset": String(decision.resetSeconds),
    ...(!decision.allowed ? {"retry-after": String(decision.resetSeconds)} : {})};
}
