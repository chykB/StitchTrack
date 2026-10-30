import "server-only";
import {localAssessmentRequest, type Environment} from "./config.ts";
import {authJson, decodeAuthRequest, parseAuthInput} from "../auth/request.server.ts";
import {matchesTimingFixture} from "./validation-timing-fixtures.ts";
import {assessmentPeer, IP_RATE_MARKER, rateHeaders, type AssessmentIpLimiter, type RateOperation} from "./ip-rate-limit.ts";

const paths: Readonly<Record<string, RateOperation>> = Object.freeze({
  "/api/auth/signup": "signup", "/api/auth/login": "login", "/api/auth/reset": "reset",
});
const noActions = {accountCreated: false, sessionCreated: false, persisted: false, emailSent: false};
export function rateExperimentEnabled(env: Environment): boolean {
  return env.NODE_ENV === "development" && env.ENABLE_AUTH_IP_RATE_LIMIT_EXPERIMENT === "true";
}
// trustedSocketPeer must come from Node's socket, NEVER a request/forwarded header.
// This handler is wired only by the isolated owner adapter, not a Next public route.
export async function assessmentRateRequest(request: Request, trustedSocketPeer: string | undefined,
  env: Environment, limiter: AssessmentIpLimiter, instance: string): Promise<Response> {
  const peer = assessmentPeer(trustedSocketPeer);
  if (!rateExperimentEnabled(env) || !peer || !localAssessmentRequest(request)) return authJson({error: "not_found"}, 404);
  const url = new URL(request.url);
  if (!Object.hasOwn(paths, url.pathname) || url.search) return authJson({error: "not_found"}, 404);
  if (request.method !== "POST") return authJson({error: "method_not_allowed"}, 405, {allow: "POST"});
  if (request.headers.get("x-stitchtrack-assessment") !== IP_RATE_MARKER) return authJson({error: "assessment_marker_required"}, 403);
  const operation = paths[url.pathname];
  const decision = limiter.consume(operation, peer);
  const headers = {...rateHeaders(decision), "x-stitchtrack-observed-peer": peer, "x-stitchtrack-rate-instance": instance};
  if (!decision.allowed) return authJson({assessmentFixture: IP_RATE_MARKER, error: "rate_limited",
    message: "Too many requests. Please wait before trying again.", retryAfterSeconds: decision.resetSeconds,
    ...noActions}, 429, headers);
  // Count attempted requests before bounded parsing: invalid input also spends the IP budget.
  const decoded = await decodeAuthRequest(request);
  if (!decoded.ok) {
    for (const [key, value] of Object.entries(headers)) decoded.response.headers.set(key, value);
    return decoded.response;
  }
  if (!matchesTimingFixture(operation, decoded.value) || !parseAuthInput(operation, decoded.value).ok) {
    return authJson({error: "fixed_synthetic_fixture_required"}, 422, headers);
  }
  return authJson({assessmentFixture: IP_RATE_MARKER, outcome: "assessment_request_admitted", operation, ...noActions}, 200, headers);
}
