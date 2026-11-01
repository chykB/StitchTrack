import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {AssessmentIpLimiter, IP_RATE_POLICIES, IP_RATE_MARKER, assessmentPeer} from "../../lib/assessment/ip-rate-limit.ts";
const {assessmentRateRequest} = await import("../../lib/assessment/auth-rate-limit.server.ts");
import {timingFixtures} from "../../lib/assessment/validation-timing-fixtures.ts";
const {authorizeServer} = await import("../experiments/rate-limiting/server.mjs");
import {authorizeOwner, verifyObservation} from "../experiments/rate-limiting/owner.mjs";
const env = {NODE_ENV: "development", ENABLE_AUTH_IP_RATE_LIMIT_EXPERIMENT: "true"};
const instance = "11111111-1111-4111-8111-111111111111";
function request(operation = "signup", options = {}) {
  const url = options.url ?? "http://127.0.0.1:3108/api/auth/" + operation;
  const method = options.method ?? "POST";
  return new Request(url, {method, headers: {host: new URL(url).host, "content-type": "application/json",
    "x-stitchtrack-assessment": IP_RATE_MARKER, ...options.headers},
    ...(["GET", "HEAD"].includes(method) ? {} : {body: options.raw ?? JSON.stringify(options.value ?? timingFixtures[operation])})});
}
const handle = (req, limiter, peer = "127.0.0.1", config = env) => assessmentRateRequest(req, peer, config, limiter, instance);

test("each endpoint permits its threshold and rejects the next attempt until the anchored window expires", () => {
  for (const operation of Object.keys(IP_RATE_POLICIES)) {
    let now = 100; const limiter = new AssessmentIpLimiter(() => now), policy = IP_RATE_POLICIES[operation];
    for (let i = 1; i <= policy.limit; i++) assert.deepEqual(limiter.consume(operation, "127.0.0.1"),
      {allowed: true, limit: policy.limit, remaining: policy.limit - i, resetSeconds: policy.windowMs / 1000});
    now += policy.windowMs - 1;
    assert.deepEqual(limiter.consume(operation, "127.0.0.1"), {allowed: false, limit: policy.limit, remaining: 0, resetSeconds: 1});
    now++; assert.equal(limiter.consume(operation, "127.0.0.1").allowed, true);
  }
});
test("budgets are independent per endpoint and normalized socket peer; keys are bounded", () => {
  const limiter = new AssessmentIpLimiter();
  for (let i = 0; i < 6; i++) limiter.consume("signup", "127.0.0.1");
  assert.equal(limiter.consume("signup", "127.0.0.1").allowed, false);
  assert.equal(limiter.consume("signup", "127.0.0.2").allowed, true);
  assert.equal(limiter.consume("login", "127.0.0.1").allowed, true);
  assert.equal(limiter.consume("reset", "127.0.0.1").allowed, true);
  assert.throws(() => limiter.consume("constructor", "127.0.0.1"));
  assert.throws(() => limiter.consume("signup", "192.0.2.1"));
  assert.equal(assessmentPeer("::ffff:127.0.0.2"), "127.0.0.2");
  for (const peer of [undefined, "::1", "localhost", "127.0.0.3", "192.0.2.1", "127.0.0.1 "]) assert.equal(assessmentPeer(peer), null);
});
test("default-off, production, host, scheme, peer and route guards reject before body access", async () => {
  for (const config of [{}, {NODE_ENV: "development"}, {...env, NODE_ENV: "production"}, {...env, NODE_ENV: "test"}]) {
    const req = request(); Object.defineProperty(req, "body", {get() {assert.fail("Body accessed behind gate");}});
    assert.equal((await handle(req, new AssessmentIpLimiter(), "127.0.0.1", config)).status, 404);
  }
  for (const options of [{url: "http://example.com/api/auth/signup"}, {url: "https://127.0.0.1:3108/api/auth/signup"},
    {headers: {host: "example.com"}}, {url: "http://127.0.0.1:3108/api/auth/signup?email=secret"},
    {url: "http://127.0.0.1:3108/api/auth/other"}]) assert.equal((await handle(request("signup", options), new AssessmentIpLimiter())).status, 404);
  for (const peer of [undefined, "192.0.2.1", "127.0.0.3"]) assert.equal((await handle(request(), new AssessmentIpLimiter(), peer ?? "bad")).status, 404);
});
test("three HTTP handler paths return 429 with retry/reset headers and truthful no-action responses", async () => {
  for (const operation of Object.keys(IP_RATE_POLICIES)) {
    const limiter = new AssessmentIpLimiter(() => 0), policy = IP_RATE_POLICIES[operation];
    for (let i = 0; i < policy.limit; i++) assert.equal((await handle(request(operation), limiter)).status, 200);
    const res = await handle(request(operation), limiter), body = await res.json();
    assert.equal(res.status, 429); assert.equal(body.error, "rate_limited");
    assert.equal(res.headers.get("retry-after"), String(policy.windowMs / 1000));
    assert.equal(res.headers.get("ratelimit-limit"), String(policy.limit));
    assert.equal(res.headers.get("ratelimit-remaining"), "0");
    assert.equal(res.headers.get("ratelimit-reset"), res.headers.get("retry-after"));
    assert.equal(res.headers.get("cache-control"), "no-store"); assert.equal(res.headers.has("set-cookie"), false);
    for (const key of ["accountCreated", "sessionCreated", "persisted", "emailSent"]) assert.equal(body[key], false);
    assert.doesNotMatch(JSON.stringify(body), /Synthetic timing phrase|Timing\+Demo/);
  }
});
test("forged forwarded headers cannot change the trusted peer budget", async () => {
  const limiter = new AssessmentIpLimiter();
  for (let i = 0; i < 5; i++) await handle(request(), limiter);
  const res = await handle(request("signup", {headers: {"x-forwarded-for": "127.0.0.2", "x-real-ip": "127.0.0.2", forwarded: "for=127.0.0.2"}}), limiter);
  assert.equal(res.status, 429); assert.equal(res.headers.get("x-stitchtrack-observed-peer"), "127.0.0.1");
  assert.equal((await handle(request(), limiter, "::ffff:127.0.0.1")).status, 429);
  // A pure handler test is not evidence of a real OS source-IP change.
  assert.equal((await handle(request(), limiter, "127.0.0.2")).status, 200);
  assert.equal((await handle(request(), limiter)).status, 429);
});
test("counting precedes JSON parsing; invalid requests spend budget and denied bodies are unread", async () => {
  const limiter = new AssessmentIpLimiter();
  for (let i = 0; i < 5; i++) assert.equal((await handle(request("signup", {raw: "{"}), limiter)).status, 400);
  const req = request(); Object.defineProperty(req, "body", {get() {assert.fail("Denied body read");}});
  assert.equal((await handle(req, limiter)).status, 429);
});
test("method and explicit marker reject without spending budget; no arbitrary credential receiver", async () => {
  const limiter = new AssessmentIpLimiter();
  assert.equal((await handle(request("signup", {method: "GET"}), limiter)).status, 405);
  assert.equal((await handle(request("signup", {headers: {"x-stitchtrack-assessment": "wrong"}}), limiter)).status, 403);
  const res = await handle(request("signup", {value: {...timingFixtures.signup, password: "never-echo-this"}}), limiter);
  assert.equal(res.status, 422); assert.doesNotMatch(await res.text(), /never-echo-this/);
  assert.equal(res.headers.get("ratelimit-remaining"), "4");
});
test("shared origin, media and resource bounds remain enforced", async () => {
  for (const [options, expected] of [[{headers: {origin: "http://example.com"}}, 403],
    [{headers: {"content-type": "text/plain"}}, 415], [{headers: {"content-length": "16385"}}, 413]]) {
    assert.equal((await handle(request("signup", options), new AssessmentIpLimiter())).status, expected);
  }
});
test("offline handler makes no network calls or credential logs", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected outbound network"));
  for (const key of ["log", "info", "warn", "error"]) t.mock.method(console, key, () => assert.fail("Credential logging"));
  for (const operation of ["signup", "login", "reset"]) assert.equal((await handle(request(operation), new AssessmentIpLimiter())).status, 200);
});
test("server and evidence drivers require exact owner opt-in; imports start no listener", () => {
  assert.doesNotThrow(() => authorizeServer(["--owner-serve"], env));
  for (const args of [[], ["--owner-serve", "--port=80"], ["--bypass"]]) assert.throws(() => authorizeServer(args, env));
  for (const config of [{}, {...env, NODE_ENV: "production"}]) assert.throws(() => authorizeServer(["--owner-serve"], config));
  for (const mode of ["--trigger", "--bypass"]) assert.equal(authorizeOwner([mode], {TASK04_RATE_LIMIT_OWNER_CONFIRMED: "true"}), mode);
  for (const config of [{}, {TASK04_RATE_LIMIT_OWNER_CONFIRMED: "true", NODE_ENV: "production"}]) assert.throws(() => authorizeOwner(["--trigger"], config));
  assert.throws(() => authorizeOwner(["--bypass", "--url=http://example.com"], {TASK04_RATE_LIMIT_OWNER_CONFIRMED: "true"}));
});
test("owner checks refuse fake peer/status, cookies, active auth or missing instance evidence", () => {
  const result = {status: 200, localAddress: "127.0.0.2", headers: {"x-stitchtrack-observed-peer": "127.0.0.2", "x-stitchtrack-rate-instance": instance},
    body: {assessmentFixture: IP_RATE_MARKER, outcome: "assessment_request_admitted", accountCreated: false, sessionCreated: false, persisted: false, emailSent: false}};
  assert.equal(verifyObservation(result, "127.0.0.2", 200), instance);
  for (const changed of [{...result, status: 503}, {...result, localAddress: "127.0.0.1"},
    {...result, headers: {...result.headers, "x-stitchtrack-observed-peer": "127.0.0.1"}},
    {...result, headers: {...result.headers, "set-cookie": ["session=value"]}},
    {...result, body: {...result.body, accountCreated: true}}, {...result, headers: {}}]) {
    assert.throws(() => verifyObservation(changed, "127.0.0.2", 200));
  }
});
test("adapter uses real socket peer and owner uses actual localAddress, never a forwarded header", () => {
  const server = readFileSync(new URL("../experiments/rate-limiting/server.mjs", import.meta.url), "utf8");
  const owner = readFileSync(new URL("../experiments/rate-limiting/owner.mjs", import.meta.url), "utf8");
  assert.match(server, /incoming\.socket\.remoteAddress/);
  assert.match(server, /server\.listen\(3108, "127\.0\.0\.1"/);
  assert.match(owner, /method: "POST", localAddress/);
  for (const source of [server, owner]) assert.doesNotMatch(source, /x-forwarded-for|x-real-ip|nodemailer|PrismaClient|betterAuth|fetch\(/);
});
