import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { observeFormBypass, formBypassEnabled, FORM_BYPASS_MARKER } from "../../lib/assessment/form-bypass.ts";
import { validateAuthValues } from "../../lib/auth/validation.ts";

const payload = JSON.parse(readFileSync(new URL("../../task-03-client-validation/fixtures/form-bypass-payload.json", import.meta.url), "utf8"));
const enabled = { NODE_ENV: "development", ENABLE_FORM_BYPASS_EXPERIMENT: "true" };
function request({ value = payload, raw, headers = {}, url = "http://127.0.0.1:3000/api/assessment/form-bypass", method = "POST" } = {}) {
  return new Request(url, { method, headers: {
    host: new URL(url).host, "content-type": "application/json",
    "x-stitchtrack-assessment": FORM_BYPASS_MARKER, ...headers,
  }, ...(["GET", "HEAD"].includes(method) ? {} : { body: raw ?? JSON.stringify(value) }) });
}
test("default, production and test gates reject before body access", async () => {
  for (const env of [{}, { NODE_ENV: "development" }, { ...enabled, NODE_ENV: "production" },
    { ...enabled, NODE_ENV: "test" }, { ...enabled, ENABLE_FORM_BYPASS_EXPERIMENT: "TRUE" }]) {
    const req = request();
    Object.defineProperty(req, "body", { get() { throw Error("body must remain unread"); } });
    assert.equal((await observeFormBypass(req, env)).status, 404);
  }
});
test("only matching approved loopback URL/Host and HTTP are allowed", () => {
  for (const host of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000"])
    assert.equal(formBypassEnabled(request({ url: "http://" + host + "/api/assessment/form-bypass" }), enabled), true);
  for (const req of [request({ url: "http://example.com/api/assessment/form-bypass" }),
    request({ url: "https://127.0.0.1:3000/api/assessment/form-bypass" }),
    request({ headers: { host: "example.com" } }), request({ headers: { host: "localhost:3000" } })])
    assert.equal(formBypassEnabled(req, enabled), false);
});
test("non-POST methods stay guarded and report POST-only only in enabled development", async () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
    const res = await observeFormBypass(request({ method }), enabled);
    assert.equal(res.status, 405); assert.equal(res.headers.get("allow"), "POST");
    assert.equal((await observeFormBypass(request({ method }), {})).status, 404);
  }
});
test("the fixed baseline is malformed signup input but produces only a truthful fixture acknowledgement", async () => {
  assert.deepEqual(payload, { email: "a@b", password: " " });
  assert.deepEqual(Object.keys(validateAuthValues("signup", payload)).sort(), ["email", "password"]);
  const res = await observeFormBypass(request(), enabled);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), {
    assessmentFixture: FORM_BYPASS_MARKER, outcome: "fixed_synthetic_payload_observed",
    checksPerformed: ["local_development_access", "request_envelope", "bounded_json", "fixed_synthetic_payload"],
    checksNotPerformed: ["signup_email_format", "signup_password_policy", "account_lookup", "terms_acceptance", "registration"],
    accountCreated: false, sessionCreated: false, persisted: false, emailSent: false,
  });
});
test("marker, origin, query and content type are checked without echoing inputs", async () => {
  for (const [options, status] of [
    [{ headers: { "x-stitchtrack-assessment": "" } }, 400],
    [{ headers: { origin: "http://example.com" } }, 403],
    [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
    [{ url: "http://127.0.0.1:3000/api/assessment/form-bypass?unexpected=1" }, 400],
    [{ headers: { "content-type": "text/plain" } }, 415],
  ]) {
    const res = await observeFormBypass(request(options), enabled);
    assert.equal(res.status, status);
    assert.equal((await res.text()).includes("a@b"), false);
  }
  assert.equal((await observeFormBypass(request({ headers: { origin: "http://127.0.0.1:3000" } }), enabled)).status, 200);
});
test("bad JSON, invalid encoding and any other parsed payload are rejected without raw exceptions", async () => {
  assert.equal((await observeFormBypass(request({ raw: "{" }), enabled)).status, 400);
  const utf8 = new Request("http://127.0.0.1:3000/api/assessment/form-bypass", {
    method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/json", "x-stitchtrack-assessment": FORM_BYPASS_MARKER },
    body: new Uint8Array([255]),
  });
  assert.equal((await observeFormBypass(utf8, enabled)).status, 400);
  for (const value of [null, [], {}, { ...payload, extra: true }, { email: "synthetic@example.invalid", password: "not-a-real-secret", code: "004281" },
    { email: payload.email, password: "" }, { email: 1, password: " " }]) {
    const res = await observeFormBypass(request({ value }), enabled);
    assert.equal(res.status, 422);
    const body = await res.text();
    assert.doesNotMatch(body, /synthetic@example|not-a-real-secret|004281|SyntaxError|stack/);
  }
});
test("advertised and streamed body limits bound reading, including without Content-Length", async () => {
  assert.equal((await observeFormBypass(request({ headers: { "content-length": "1025" } }), enabled)).status, 413);
  assert.equal((await observeFormBypass(request({ headers: { "content-length": "invalid" } }), enabled)).status, 400);
  assert.equal((await observeFormBypass(request({ raw: "a".repeat(1025) }), enabled)).status, 413);
  const req = new Request("http://127.0.0.1:3000/api/assessment/form-bypass", {
    method: "POST", headers: { host: "127.0.0.1:3000", "content-type": "application/json", "x-stitchtrack-assessment": FORM_BYPASS_MARKER },
    body: new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(700)); controller.enqueue(new Uint8Array(700)); controller.close();
    } }), duplex: "half",
  });
  assert.equal((await observeFormBypass(req, enabled)).status, 413);
});
test("handler emits no console logs or input-bearing responses, and has no persistence/auth dependency", async () => {
  const calls = [];
  const old = Object.fromEntries(["log", "info", "warn", "error"].map(key => [key, console[key]]));
  try {
    for (const key of Object.keys(old)) console[key] = (...args) => calls.push(args);
    await observeFormBypass(request(), enabled);
    await observeFormBypass(request({ value: { email: "must-not-echo@example.invalid", password: "SYNTHETIC-NOT-REAL" } }), enabled);
  } finally { for (const key of Object.keys(old)) console[key] = old[key]; }
  assert.equal(calls.length, 0);
  const source = readFileSync(new URL("../../lib/assessment/form-bypass.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.|prisma|nodemailer|better.auth|fetch\(/i);
});
