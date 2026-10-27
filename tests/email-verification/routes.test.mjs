import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";

const base = new URL(process.env.AUTH_TEST_BASE_URL || "http://127.0.0.1:3000");
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username || base.password || base.pathname !== "/" || base.search || base.hash)
  throw new Error("Use a loopback HTTP origin.");
const enabled = process.env.AUTH_TEST_VERIFICATION_PREVIEW === "true";

test("direct verification URL is 200 only in enabled local preview; otherwise real 404 with no code field", async () => {
  const res = await fetch(new URL("/auth?verify", base), {
    redirect: "manual", headers: { "user-agent": "Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36" },
  });
  assert.equal(res.status, enabled ? 200 : 404);
  assert.equal(res.headers.get("set-cookie"), null);
  const html = await res.text();
  if (enabled) {
    assert.match(html, /<title>Verify your email \| StitchTrack<\/title>/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<fieldset[^>]*disabled=""/);
    assert.match(html, /<input(?=[^>]*id="verification-code")(?=[^>]*type="text")/);
    assert.match(html, /inputMode="numeric"/);
    assert.match(html, /pattern="\[0-9\]\{6\}"/);
    assert.doesNotMatch(html, /type="number"/);
    assert.ok(html.includes("Enter the code for your email."));
    assert.doesNotMatch(html, /six-digit|six digits|6 digits|[Ww]e (have )?sent/);
    assert.match(html, /<form(?=[^>]*method="post")(?=[^>]*noValidate="")/);
    assert.doesNotMatch(html, /name="email"|name="password"|name="draftAcknowledgement"|[Cc]ode (has been|was) sent/);
    assert.match(html, /id="verification-feedback"[^>]*role="status"/);
  } else assert.doesNotMatch(html, /id="verification-code"/);
});
test("verification RSC navigation uses the same activation boundary", async () => {
  const res = await fetch(new URL("/auth?verify=&_rsc=verification-test", base), { headers: { rsc: "1" } });
  assert.equal(res.status, enabled ? 200 : 404);
  assert.equal(res.headers.get("set-cookie"), null);
  if (enabled) {
    assert.match(res.headers.get("content-type") || "", /text\/x-component/);
    assert.ok((await res.text()).includes("EmailVerificationForm"));
  }
});
test("non-loopback Host cannot enable the UI-only verification view", async () => {
  const res = await new Promise((resolve, reject) => {
    const req = request(new URL("/auth?verify", base), { headers: { Host: "unapproved.example" } }, incoming => {
      let body = ""; incoming.setEncoding("utf8"); incoming.on("data", c => body += c);
      incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
    });
    req.on("error", reject); req.end();
  });
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.body, /id="verification-code"/);
});
test("caller-supplied screen hint cannot replace the URL or grant verification access", async () => {
  const res = await fetch(new URL("/auth?login", base), { headers: { "x-stitchtrack-auth-state": "verify" } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="login-email"/);
  assert.doesNotMatch(html, /id="verification-code"/);
});

test("retired numeric comparison stays 404 for document and RSC requests even when verification is enabled", async () => {
  for (const [path, headers] of [
    ["/assessment/code-input", {}],
    ["/assessment/code-input?_rsc=retired-comparison", { rsc: "1" }],
  ]) {
    const response = await fetch(new URL(path, base), { redirect: "manual", headers });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.doesNotMatch(await response.text(), /id="comparison-code"|id="verification-code"/);
  }
});
