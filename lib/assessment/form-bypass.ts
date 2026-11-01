import { localAssessmentRequest } from "./config.ts";

type FixtureEnvironment = Readonly<Record<string, string | undefined>>;
export const FORM_BYPASS_MARKER = "form-bypass-v1";
export const FORM_BYPASS_BODY_LIMIT = 1024;

function json(body: unknown, status: number, allow?: string): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff",
      ...(allow ? { allow } : {}) },
  });
}
function failure(error: string, status: number, allow?: string): Response {
  return json({ assessmentFixture: FORM_BYPASS_MARKER, outcome: "fixture_request_rejected", error }, status, allow);
}
export function formBypassEnabled(request: Request, env: FixtureEnvironment): boolean {
  return env.NODE_ENV === "development" && env.ENABLE_FORM_BYPASS_EXPERIMENT === "true" &&
    localAssessmentRequest(request);
}

// A fixed synthetic-only fixture, not an auth endpoint. No logging, storage or external calls.
export async function observeFormBypass(request: Request, env: FixtureEnvironment): Promise<Response> {
  if (!formBypassEnabled(request, env)) return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return failure("method_not_allowed", 405, "POST");
  const url = new URL(request.url);
  if (url.search) return failure("query_not_allowed", 400);
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site")
    return failure("origin_not_allowed", 403);
  if (request.headers.get("x-stitchtrack-assessment") !== FORM_BYPASS_MARKER)
    return failure("assessment_marker_required", 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return failure("json_required", 415);

  const advertised = request.headers.get("content-length");
  if (advertised && !/^\d+$/.test(advertised)) return failure("invalid_length", 400);
  if (advertised && Number(advertised) > FORM_BYPASS_BODY_LIMIT) return failure("body_too_large", 413);
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("invalid_json", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > FORM_BYPASS_BODY_LIMIT) {
          await reader.cancel();
          return failure("body_too_large", 413);
        }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return failure("invalid_json", 400); }

  // This allowlist prevents accidental use as a general credential receiver.
  // It intentionally recognizes the known-invalid test pair instead of applying signup rules.
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !Object.hasOwn(value, "email") || !Object.hasOwn(value, "password") ||
      (value as Record<string, unknown>).email !== "a@b" ||
      (value as Record<string, unknown>).password !== " ")
    return failure("fixed_synthetic_payload_required", 422);

  return json({
    assessmentFixture: FORM_BYPASS_MARKER,
    outcome: "fixed_synthetic_payload_observed",
    checksPerformed: ["local_development_access", "request_envelope", "bounded_json", "fixed_synthetic_payload"],
    checksNotPerformed: ["signup_email_format", "signup_password_policy", "account_lookup", "terms_acceptance", "registration"],
    accountCreated: false, sessionCreated: false, persisted: false, emailSent: false,
  }, 200);
}
