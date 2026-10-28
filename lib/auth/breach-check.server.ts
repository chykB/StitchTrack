import "server-only";
import {createHash} from "node:crypto";
import {signupPasswordSchema} from "./schemas.ts";

export const BREACH_CHECK_TIMEOUT_MS = 3_000;
export const BREACH_RANGE_MAX_BYTES = 2 * 1024 * 1024;
const RANGE_BASE = "https://api.pwnedpasswords.com/range/";
export type BreachCheckResult = "breached" | "not_found" | "unavailable";
export type BreachCheckDependencies = {fetcher?: typeof fetch; timeoutMs?: number};

// Signup-only prerequisite. No logging, caching, persistence or credential storage.
// SHA-1 serves only HIBP's lookup protocol; credential storage remains Argon2id.
export async function checkPwnedPassword(password: string,
  dependencies: BreachCheckDependencies = {}): Promise<BreachCheckResult> {
  if (typeof password !== "string" || !password.isWellFormed() || !signupPasswordSchema.safeParse(password).success) return "unavailable";
  const timeoutMs = dependencies.timeoutMs ?? BREACH_CHECK_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > BREACH_CHECK_TIMEOUT_MS) return "unavailable";
  // No trim/case/Unicode transform. Avoid constructing a full hexadecimal digest.
  const digest = createHash("sha1").update(password, "utf8").digest();
  const prefix = (digest.subarray(0, 2).toString("hex") + (digest[2] >>> 4).toString(16)).toUpperCase();
  const suffix = ((digest[2] & 15).toString(16) + digest.subarray(3).toString("hex")).toUpperCase();
  digest.fill(0);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {controller.abort(); reject(new Error("Breach lookup unavailable."));}, timeoutMs);
  });
  try {
    const lookup = async (): Promise<BreachCheckResult> => {
      const response = await (dependencies.fetcher ?? fetch)(RANGE_BASE + prefix, {
        method: "GET", headers: {"User-Agent": "StitchTrack-BreachCheck/1.0", "Add-Padding": "true", Accept: "text/plain"},
        signal: controller.signal, redirect: "error", cache: "no-store",
        credentials: "omit", referrerPolicy: "no-referrer",
      });
      if (controller.signal.aborted || response.status !== 200 || response.redirected ||
          (response.url && response.url !== RANGE_BASE + prefix) ||
          response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "text/plain" || !response.body) {
        void response.body?.cancel().catch(() => {});
        return "unavailable";
      }
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/u.test(length) || Number(length) > BREACH_RANGE_MAX_BYTES)) {
        void response.body.cancel().catch(() => {}); return "unavailable";
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const next = await reader.read();
        if (controller.signal.aborted) return "unavailable";
        if (next.done) break;
        size += next.value.byteLength;
        if (size > BREACH_RANGE_MAX_BYTES) return "unavailable";
        chunks.push(next.value);
      }
      completed = true;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
      const lines = text.split(/\r?\n/u);
      if (lines.at(-1) === "") lines.pop();
      if (!lines.length || lines.length > 20_000) return "unavailable";
      const seen = new Set<string>(); let matched = false, positive = false;
      for (const line of lines) {
        const match = /^([A-F0-9]{35}):(0|[1-9][0-9]{0,19})$/u.exec(line);
        if (!match || seen.has(match[1])) return "unavailable";
        seen.add(match[1]);
        // Padding records with count zero are not evidence of compromise.
        if (match[2] !== "0") {positive = true; if (match[1] === suffix) matched = true;}
      }
      if (!positive) return "unavailable";
      return matched ? "breached" : "not_found";
    };
    return await Promise.race([lookup(), deadline]);
  } catch {
    // Never expose provider errors, URLs, digest fragments, input or stack/cause.
    return "unavailable";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) {
      if (!completed) void reader.cancel().catch(() => {});
      else reader.releaseLock();
    }
  }
}
