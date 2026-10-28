import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
const {checkPwnedPassword, BREACH_RANGE_MAX_BYTES} = await import("../../lib/auth/breach-check.server.ts");
const {previewAuthRequest} = await import("../../lib/auth/validation-preview.server.ts");
const {authorizeEvidence, verifyRejection} = await import("../experiments/breach-check/reject.mjs");
const password = "password1234"; // Public synthetic test value, never a real credential.
const suffixFor = value => createHash("sha1").update(value, "utf8").digest("hex").slice(5).toUpperCase();
const otherSuffix = value => {const suffix = suffixFor(value); return (suffix[0] === "A" ? "B" : "A") + suffix.slice(1);};
const response = (text, options = {}) => new Response(text, {status: 200, headers: {"content-type": "text/plain; charset=utf-8"}, ...options});
const enabled = {NODE_ENV: "development", ENABLE_AUTH_VALIDATION_PREVIEW: "true", ENABLE_AUTH_BREACH_CHECK: "true"};
const payload = {name: "Synthetic Tailor", email: "breach-demo@example.invalid", password};
function request(operation = "signup", value = payload, options = {}) {
  const url = options.url ?? "http://127.0.0.1:3110/api/auth/" + operation;
  return new Request(url, {method: "POST", headers: {host: new URL(url).host, "content-type": "application/json"}, body: JSON.stringify(value)});
}
// Fail immediately if any test accidentally falls through to actual external fetch.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {assert.fail("No live network requests permitted in offline tests");};
test.after(() => {globalThis.fetch = originalFetch;});

test("breached password uses only five uppercase digest characters in the fixed range request", async () => {
  let calls = 0;
  const result = await checkPwnedPassword(password, {fetcher: async (url, options) => {
    calls++; const target = new URL(url);
    assert.equal(target.origin, "https://api.pwnedpasswords.com");
    assert.match(target.pathname, /^\/range\/[A-F0-9]{5}$/u);
    assert.equal(target.pathname.slice(7), createHash("sha1").update(password).digest("hex").slice(0, 5).toUpperCase());
    assert.equal(target.search, ""); assert.equal(options.body, undefined);
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, {"User-Agent": "StitchTrack-BreachCheck/1.0", "Add-Padding": "true", Accept: "text/plain"});
    assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
    assert.ok(options.signal instanceof AbortSignal);
    assert.doesNotMatch(JSON.stringify([url, options.headers]), /password1234/);
    return response(suffixFor(password) + ":9\r\n" + otherSuffix(password) + ":0\r\n");
  }});
  assert.equal(result, "breached"); assert.equal(calls, 1);
});
test("not_found requires a valid range, and zero-count padding matches are ignored", async () => {
  assert.equal(await checkPwnedPassword(password, {fetcher: async () => response(otherSuffix(password) + ":1\n")}), "not_found");
  assert.equal(await checkPwnedPassword(password, {fetcher: async () => response(suffixFor(password) + ":0\n" + otherSuffix(password) + ":12")}), "not_found");
});
test("exact edge spaces, case and Unicode encoding remain significant", async () => {
  const values = [password, " " + password, password + " ", "Password1234", "synthetic-\u00e9-pass", "synthetic-e\u0301-pass"];
  const targets = [];
  for (const value of values) {
    assert.equal(await checkPwnedPassword(value, {fetcher: async url => {targets.push(url); return response(suffixFor(value) + ":1");}}), "breached");
  }
  assert.equal(new Set(targets).size, values.length);
});
test("invalid basic passwords and unpaired Unicode surrogates never cause a lookup", async () => {
  for (const value of ["", "short", " ".repeat(12), "synthetic\tpassword", "synthetic-\ud800-pass"]) {
    assert.equal(await checkPwnedPassword(value, {fetcher: async () => assert.fail("Invalid input queried")}), "unavailable");
  }
});
test("HTTP, redirect, content type, absent body and provider failures fail closed", async () => {
  for (const status of [301, 400, 404, 429, 500, 503]) assert.equal(await checkPwnedPassword(password, {fetcher: async () => response("upstream-error", {status})}), "unavailable");
  for (const fetcher of [async () => {throw new Error("provider error with sensitive details");},
    async () => response("not a range", {headers: {"content-type": "text/html"}}),
    async () => new Response(null, {headers: {"content-type": "text/plain"}}),
    async () => {const res = response(otherSuffix(password) + ":1"); Object.defineProperty(res, "redirected", {value: true}); return res;},
    async () => {const res = response(otherSuffix(password) + ":1"); Object.defineProperty(res, "url", {value: "https://example.com/"}); return res;}]) {
    assert.equal(await checkPwnedPassword(password, {fetcher}), "unavailable");
  }
});
test("malformed, duplicate, empty, all-padding and partly malformed ranges are not accepted", async () => {
  const suffix = suffixFor(password);
  for (const body of ["", "\n", suffix + ":0", suffix.toLowerCase() + ":1", suffix + ":-1", suffix + ":1.5", suffix + ":01",
    suffix + ":1\n\n", suffix + ":1\nBAD", suffix + ":1\n" + suffix + ":2", suffix + ":1 ", "G".repeat(35) + ":1", "A".repeat(34) + ":1"]) {
    assert.equal(await checkPwnedPassword(password, {fetcher: async () => response(body)}), "unavailable");
  }
});
test("advertised and streamed oversized ranges, invalid UTF-8 and failed streams fail closed", async () => {
  for (const fetcher of [async () => response("", {headers: {"content-type": "text/plain", "content-length": String(BREACH_RANGE_MAX_BYTES + 1)}}),
    async () => response("", {headers: {"content-type": "text/plain", "content-length": "bad"}}),
    async () => response("A".repeat(BREACH_RANGE_MAX_BYTES + 1)),
    async () => response(new Uint8Array([0xff])),
    async () => response(new ReadableStream({start(controller) {controller.error(new Error("stream failed"));}}))]) {
    assert.equal(await checkPwnedPassword(password, {fetcher}), "unavailable");
  }
});
test("deadline includes fetch and stalled body reads, even if injected transport ignores abort", async () => {
  let fetchSignal;
  assert.equal(await checkPwnedPassword(password, {timeoutMs: 10, fetcher: async (_, options) => {fetchSignal = options.signal; return await new Promise(() => {});}}), "unavailable");
  assert.equal(fetchSignal.aborted, true);
  let cancelled = false;
  assert.equal(await checkPwnedPassword(password, {timeoutMs: 10, fetcher: async () => response(new ReadableStream({cancel() {cancelled = true;}}))}), "unavailable");
  assert.equal(cancelled, true);
  for (const timeoutMs of [0, -1, 3001, Infinity, NaN]) assert.equal(await checkPwnedPassword(password, {timeoutMs, fetcher: async () => assert.fail()}), "unavailable");
});
test("signup basic validation precedes breach checks and denied gates never query", async () => {
  let calls = 0; const dependencies = {checkPassword: async () => {calls++; return "breached";}};
  for (const value of [{...payload, password: "short"}, {...payload, password: " ".repeat(12)}, {...payload, email: "bad"}, {...payload, name: ""}]) {
    assert.equal((await previewAuthRequest(request("signup", value), "signup", enabled, dependencies)).status, 422);
  }
  for (const config of [{}, {...enabled, NODE_ENV: "production"}, {...enabled, ENABLE_AUTH_VALIDATION_PREVIEW: "false"}]) {
    assert.equal((await previewAuthRequest(request(), "signup", config, dependencies)).status, 404);
  }
  assert.equal((await previewAuthRequest(request("signup", payload, {url: "http://example.com/api/auth/signup"}), "signup", enabled, dependencies)).status, 404);
  assert.equal(calls, 0);
});
test("signup rejects breaches with field feedback, no values/hashes/cookies/account actions", async () => {
  const res = await previewAuthRequest(request(), "signup", enabled, {checkPassword: async value => {assert.equal(value, password); return "breached";}});
  assert.equal(res.status, 422); assert.equal(res.headers.get("cache-control"), "no-store"); assert.equal(res.headers.has("set-cookie"), false);
  const body = await res.json(); assert.equal(body.error, "password_breached"); assert.deepEqual(body.fields, ["password"]);
  for (const key of ["accountCreated", "sessionCreated", "persisted", "emailSent"]) assert.equal(body[key], false);
  assert.doesNotMatch(JSON.stringify(body), /password1234|[A-F0-9]{35,40}|breach-demo/u);
});
test("unavailable, thrown or unexpected checks cannot reach account creation; clean is not success", async () => {
  for (const checker of [async () => "unavailable", async () => {throw new Error("sensitive error");}, async () => "unexpected"]) {
    const res = await previewAuthRequest(request(), "signup", enabled, {checkPassword: checker});
    assert.equal(res.status, 503); assert.equal(res.headers.get("retry-after"), "30");
    assert.equal((await res.json()).error, "password_check_unavailable");
  }
  const res = await previewAuthRequest(request(), "signup", enabled, {checkPassword: async () => "not_found"});
  assert.equal(res.status, 503); assert.equal((await res.json()).error, "authentication_unavailable");
});
test("login/reset and flag-off signup never run the breach lookup", async () => {
  const dependencies = {checkPassword: async () => assert.fail("Unexpected breach lookup")};
  for (const operation of ["login", "reset"]) {
    const value = {email: payload.email, ...(operation === "login" ? {password} : {})};
    assert.equal((await previewAuthRequest(request(operation, value), operation, enabled, dependencies)).status, 503);
  }
  assert.equal((await previewAuthRequest(request(), "signup", {...enabled, ENABLE_AUTH_BREACH_CHECK: "false"}, dependencies)).status, 503);
});
test("checker and preview do not log secrets, outbound errors or digest fragments", async t => {
  for (const key of ["log", "info", "warn", "error"]) t.mock.method(console, key, () => assert.fail("No logging"));
  assert.equal(await checkPwnedPassword(password, {fetcher: async () => response(suffixFor(password) + ":3")}), "breached");
  await previewAuthRequest(request(), "signup", enabled, {checkPassword: async () => {throw new Error(password);}});
});
test("owner evidence driver imports inertly, requires opt-in and rejects misleading responses", () => {
  assert.doesNotThrow(() => authorizeEvidence(["--owner-check"], {TASK04_BREACH_EVIDENCE_CONFIRMED: "true"}));
  for (const config of [{}, {TASK04_BREACH_EVIDENCE_CONFIRMED: "true", NODE_ENV: "production"}]) assert.throws(() => authorizeEvidence(["--owner-check"], config));
  assert.throws(() => authorizeEvidence(["--owner-check", "--url=http://example.com"], {TASK04_BREACH_EVIDENCE_CONFIRMED: "true"}));
  const body = {error: "password_breached", fields: ["password"], message: "This password has appeared in a data breach. Choose a different password.", accountCreated: false, sessionCreated: false, persisted: false, emailSent: false};
  assert.doesNotThrow(() => verifyRejection(422, new Headers({"cache-control": "no-store"}), body));
  assert.throws(() => verifyRejection(503, new Headers(), body));
  assert.throws(() => verifyRejection(422, new Headers({"set-cookie": "session=value"}), body));
  assert.throws(() => verifyRejection(422, new Headers(), {...body, accountCreated: true}));
});
test("range checker remains server-only and has no storage or logging imports", () => {
  const source = readFileSync(new URL("../../lib/auth/breach-check.server.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/); assert.doesNotMatch(source, /console\.|writeFile|localStorage|sessionStorage|PrismaClient|nodemailer/u);
});
