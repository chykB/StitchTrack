import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
const base = new URL(process.env.FORM_BYPASS_TEST_BASE_URL || "http://127.0.0.1:3000");
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash)
  throw new Error("Use an explicit loopback HTTP test origin.");
const enabled = process.env.FORM_BYPASS_EXPECT_ENABLED === "true";
const path = "/api/assessment/form-bypass";
const payload = readFileSync(new URL("../../task-03-client-validation/fixtures/form-bypass-payload.json", import.meta.url), "utf8");
const headers = { "content-type": "application/json", "x-stitchtrack-assessment": "form-bypass-v1" };

test("real POST is unavailable outside opt-in development; enabled response is explicitly non-registration", async () => {
  const res = await fetch(new URL(path, base), { method: "POST", headers, body: payload });
  assert.equal(res.status, enabled ? 200 : 404);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  if (enabled) {
    assert.equal(body.assessmentFixture, "form-bypass-v1");
    assert.equal(body.outcome, "fixed_synthetic_payload_observed");
    assert.ok(body.checksPerformed.includes("fixed_synthetic_payload"));
    assert.ok(body.checksNotPerformed.includes("signup_email_format"));
    for (const key of ["accountCreated", "sessionCreated", "persisted", "emailSent"]) assert.equal(body[key], false);
    for (const key of ["email", "password", "code", "id", "createdAt"]) assert.equal(Object.hasOwn(body, key), false);
  } else assert.deepEqual(body, { error: "not_found" });
});
test("GET and OPTIONS are guarded before method handling", async () => {
  for (const method of ["GET", "OPTIONS"]) {
    const res = await fetch(new URL(path, base), { method });
    assert.equal(res.status, enabled ? 405 : 404);
    if (enabled) assert.equal(res.headers.get("allow"), "POST");
  }
});
test("unapproved Host cannot activate fixture", async () => {
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest(new URL(path, base), { method: "POST", headers: { ...headers, host: "unapproved.example" } }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", c => body += c);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject); req.end(payload);
  });
  assert.equal(result.status, 404);
  assert.deepEqual(JSON.parse(result.body), { error: "not_found" });
});
test("invalid origin/marker/JSON/type/body/payload stay rejected without input echo", async () => {
  for (const [changes, body, status] of [
    [{ origin: "http://unapproved.example" }, payload, 403],
    [{ "x-stitchtrack-assessment": "" }, payload, 400],
    [{}, "{", 400],
    [{ "content-type": "text/plain" }, payload, 415],
    [{}, "x".repeat(1025), 413],
    [{}, JSON.stringify({ email: "must-not-echo@example.invalid", password: "SYNTHETIC-NOT-REAL", code: "004281" }), 422],
  ]) {
    const res = await fetch(new URL(path, base), { method: "POST", headers: { ...headers, ...changes }, body });
    assert.equal(res.status, enabled ? status : 404);
    assert.doesNotMatch(await res.text(), /must-not-echo|SYNTHETIC-NOT-REAL|004281|SyntaxError/);
  }
});
