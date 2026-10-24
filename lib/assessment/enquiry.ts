import { z } from "zod";
import { assessmentEnabled, localAssessmentRequest, AssessmentConfigurationError } from "./config.ts";
import type { Environment } from "./config.ts";

export const enquirySchema = z.strictObject({
  name: z.string().trim().min(2, "Enter 2 to 80 characters.").max(80, "Enter 2 to 80 characters."),
  enquiry: z.string().trim().min(10, "Enter 10 to 500 characters.").max(500, "Enter 10 to 500 characters."),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
export type Receipt = { id: number; requestId: string; createdAt: string };
export type SavedEnquiry = { id: number; requestId: string; createdAt: Date };
export type Persist = (input: EnquiryInput, requestId: string) => Promise<SavedEnquiry>;
export type RequestLog = {
  event: "assessment_enquiry";
  at: string;
  requestId: string;
  method: string;
  path: "/api/assessment/enquiries";
  status: number;
  durationMs: number;
  outcome: string;
  id?: number;
  createdAt?: string;
};

const receiptSchema = z.strictObject({
  id: z.number().int().positive(),
  requestId: z.uuid(),
  createdAt: z.iso.datetime({ precision: 3 }),
});

export function confirmedReceipt(status: number, body: unknown): Receipt | null {
  if (status !== 201) return null;
  const parsed = receiptSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function databaseUnavailable(error: unknown): boolean {
  // Only structured transport-unavailability codes, never message matching.
  // Adapter-pg may expose a native transport code as the request error code.
  const codes = new Set(["P1001", "P1002", "P1017", "ECONNREFUSED", "ENOTFOUND",
    "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "ECONNRESET"]);
  const seen = new Set<unknown>();
  let value: unknown = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const item = value as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string" && codes.has(item.code)) return true;
    value = item.cause;
  }
  return false;
}

class RequestBodyError extends Error {
  readonly status: number;
  constructor(status: number) { super("Invalid request body."); this.status = status; }
}

async function boundedJson(request: Request): Promise<unknown> {
  const limit = 8192;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestBodyError(413);
  if (!request.body) throw new RequestBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyError(413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400);
  } finally {
    reader.releaseLock();
  }
}

type Dependencies = {
  env: Environment;
  persist: Persist;
  log: (entry: RequestLog) => void;
};

export async function submitEnquiry(request: Request, deps: Dependencies): Promise<Response> {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  function reply(status: number, outcome: string, payload: Record<string, unknown> = {},
    saved?: Receipt): Response {
    // This object is built from an allowlist. Never serialize the exception or input.
    deps.log({
      event: "assessment_enquiry",
      at: new Date().toISOString(), requestId, method: request.method,
      path: "/api/assessment/enquiries", status,
      durationMs: Math.round(performance.now() - started), outcome,
      ...(saved ? { id: saved.id, createdAt: saved.createdAt } : {}),
    });
    return Response.json({ ...payload, requestId }, {
      status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  if (!assessmentEnabled(deps.env) || !localAssessmentRequest(request)) {
    return reply(404, "disabled", { error: "Not found." });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return reply(403, "origin_rejected", { error: "Request origin rejected." });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(415, "content_type_rejected", { error: "Send application/json." });
  }

  let input: unknown;
  try { input = await boundedJson(request); }
  catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 400;
    return reply(status, "body_rejected", { error: status === 413 ? "Request too large." : "Invalid JSON." });
  }
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      if (field === "name" || field === "enquiry") fields[field] = issue.message;
    }
    return reply(422, "validation_rejected", { error: "Check the form fields.", fields });
  }

  try {
    const saved = await deps.persist(parsed.data, requestId);
    const receipt = confirmedReceipt(201, {
      id: saved.id, requestId: saved.requestId, createdAt: saved.createdAt.toISOString(),
    });
    if (!receipt || receipt.requestId !== requestId) throw new Error("Invalid persistence receipt.");
    return reply(201, "created", receipt, receipt);
  } catch (error) {
    if (databaseUnavailable(error)) {
      return reply(503, "database_unavailable", {
        error: "The assessment database is unavailable. Success could not be confirmed. Check the request ID before retrying.",
      });
    }
    return reply(500, error instanceof AssessmentConfigurationError ? "configuration_rejected" : "internal_error", {
      error: "The enquiry could not be confirmed. Check the request ID before retrying.",
    });
  }
}
