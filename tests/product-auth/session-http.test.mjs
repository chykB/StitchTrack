import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {TLSSocket} from "node:tls";
import "../../scripts/register-server-only.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {sessionHttpRequest, createHttpSessionService, requireBusinessSession, sessionConnectionFromSocket} = await import("../../lib/product-auth/session-http.server.ts");
const {hashPassword} = await import("../../lib/auth/password.server.ts");
const {ProductAuthError} = await import("../../lib/product-auth/secrets.server.ts");
const {TAILOR_SESSION_LIFETIME_SECONDS} = await import("../../lib/product-auth/session-policy.ts");
const env = {NODE_ENV: "development", ENABLE_PRODUCT_SESSION_HTTP: "true", PRODUCT_DATABASE_MODE: "test", PRODUCT_DATABASE_CONFIRMED: "true",
  PRODUCT_SESSION_HTTP_ORIGIN: "http://127.0.0.1:3000", PRODUCT_SESSION_HTTP_AUTH_SECRET: "offline-only-http-cookie-secret-not-for-deployment",
  PRODUCT_SESSION_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64"),
  PRODUCT_TEST_DATABASE_URL: "postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
const password = " Exact synthetic e\u0301 phrase ", encoded = await hashPassword(password);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => assert.fail("Offline HTTP tests may not use external services");
test.after(() => {globalThis.fetch = originalFetch;});
function request(operation, {settings = env, headers = {}, method = operation === "session" ? "GET" : "POST", body, query = ""} = {}) {
  const origin = settings.PRODUCT_SESSION_HTTP_ORIGIN;
  return new Request(origin + "/api/internal/tailor-session/" + operation + query, {method,
    headers: {host: new URL(origin).host, origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers},
    ...(method === "POST" ? {body: body ?? JSON.stringify(operation === "login" ? {email: " Synthetic@EXAMPLE.INVALID ", password} : {})} : {})});
}
// Socket/TLS metadata doubles only: never connect, listen or perform a handshake.
function connection(peerAddress = "127.0.0.1", secure = false) {
  const socket = secure ? new TLSSocket() : new Socket();
  Object.defineProperty(socket, "remoteAddress", {value: peerAddress});
  if (secure) {socket.getProtocol = () => "TLSv1.3"; socket.getPeerFinished = () => Buffer.alloc(12, 1);}
  try {return sessionConnectionFromSocket(socket);} finally {socket.destroy();}
}
function cookieHeaders(response) {return {cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")};}
async function setup(settings = env) {
  const f = fakeProduct({sessionAccess: true}), events = [];

  for (const [id, email, verified] of [["synthetic-a", "synthetic@example.invalid", true], ["synthetic-b", "other@example.invalid", true], ["synthetic-unverified", "unverified@example.invalid", false]]) {
    await f.client.user.create({data: {id, email, name: "Synthetic \u1eccl\u00e1", emailVerified: verified}});
    await f.client.account.create({data: {id: "credential-" + id, userId: id, accountId: id, providerId: "credential", password: encoded}});
  }
  const deps = {
    connection: () => connection("127.0.0.1", settings.PRODUCT_SESSION_HTTP_ORIGIN.startsWith("https:")),
    limits: {storage: "shared", consumeIp: async (operation, ip) => {events.push(["ip", operation, ip]); return {allowed: true, retryAfterSeconds: 1};},
      consumeAccount: async email => {events.push(["account", email]); return {allowed: true, retryAfterSeconds: 1};}},
    sessions: config => {events.push(["sessions", config.expiresInSeconds, config.renewal]); return createHttpSessionService(f.client, config);},
  };
  const call = (operation, options) => sessionHttpRequest(request(operation, {settings, ...options}), operation, settings, deps);
  return {...f, events, deps, call};
}
test("flag-off/production/wrong mode refuse before dependencies; missing secrets/origin/store/peer fail closed", async () => {
  const f = await setup();
  for (const patch of [{ENABLE_PRODUCT_SESSION_HTTP: undefined}, {NODE_ENV: "production"}, {PRODUCT_DATABASE_MODE: "development"}, {PRODUCT_DATABASE_CONFIRMED: "false"}]) {
    assert.equal((await sessionHttpRequest(request("login"), "login", {...env, ...patch}, f.deps)).status, 404);
  }
  for (const patch of [{PRODUCT_SESSION_HTTP_ORIGIN: undefined}, {PRODUCT_SESSION_HTTP_ORIGIN: "https://example.invalid"},
    {PRODUCT_SESSION_HTTP_AUTH_SECRET: undefined}, {PRODUCT_SESSION_TOKEN_KEY: "bad"}, {PRODUCT_TEST_DATABASE_URL: undefined}]) {
    assert.equal((await sessionHttpRequest(request("login"), "login", {...env, ...patch}, f.deps)).status, 503);
  }
  assert.equal((await sessionHttpRequest(request("login"), "login", env)).status, 503);
  assert.equal((await sessionHttpRequest(request("login"), "login", env, {...f.deps, connection: undefined})).status, 503);
  assert.equal((await sessionHttpRequest(request("login"), "login", env, {...f.deps, limits: {...f.deps.limits, storage: "memory"}})).status, 503);
  assert.equal(f.rows().session.length, 0);
});
test("exact host/origin/TLS/real loopback peer checks resist forwarded-header spoofing", async () => {
  const f = await setup();
  for (const headers of [{host: "example.invalid"}, {origin: "http://evil.invalid"}, {origin: "null"}, {origin: ""}, {"sec-fetch-site": "cross-site"}, {"sec-fetch-site": "same-site"}]) {
    const result = await f.call("login", {headers}); assert.ok([403, 404].includes(result.status));
  }
  const noOrigin = request("login"); noOrigin.headers.delete("origin");
  assert.equal((await sessionHttpRequest(noOrigin, "login", env, f.deps)).status, 403);
  f.deps.connection = () => connection("203.0.113.7");
  assert.equal((await f.call("login", {headers: {"x-forwarded-for": "127.0.0.1"}})).status, 404);
  f.deps.connection = () => connection("127.0.0.1", true);
  assert.equal((await f.call("login")).status, 404);
  f.deps.connection = () => connection("::ffff:127.0.0.1");
  assert.equal((await f.call("login", {headers: {"x-forwarded-for": "198.51.100.3", "x-forwarded-proto": "https"}})).status, 200);
  assert.deepEqual(f.events[0], ["ip", "login", "127.0.0.1"]);
});
test("strict body/query/method validation spends IP budget before parsing and never reaches password service", async () => {
  const f = await setup();
  for (const options of [{body: "{"}, {body: JSON.stringify({email: "a@b", password})}, {body: JSON.stringify({email: "synthetic@example.invalid", password, userId: "other"})}, {body: "[]"}, {body: JSON.stringify({email: "synthetic@example.invalid", password, rememberMe: true})}]) {
    assert.ok([400, 422].includes((await f.call("login", options)).status));
  }
  assert.equal((await f.call("login", {headers: {"content-type": "text/plain"}})).status, 415);
  assert.equal((await f.call("login", {body: "x".repeat(16385)})).status, 413);
  assert.equal((await f.call("session", {query: "?userId=other"})).status, 400);
  const wrong = await f.call("login", {method: "GET"}); assert.equal(wrong.status, 405); assert.equal(wrong.headers.get("allow"), "POST");
  assert.equal(f.events.some(event => event[0] === "sessions"), false); assert.equal(f.rows().session.length, 0);
});
test("account and IP decisions precede hashing; 429/Retry-After and failed store are safe", async () => {
  const f = await setup();
  f.deps.limits.consumeIp = async () => ({allowed: false, retryAfterSeconds: 17});
  const ip = await f.call("login"); assert.equal(ip.status, 429); assert.equal(ip.headers.get("retry-after"), "17");
  assert.equal(f.events.length, 0);
  f.deps.limits.consumeIp = async () => ({allowed: true, retryAfterSeconds: 1});
  f.deps.limits.consumeAccount = async email => {assert.equal(email, "synthetic@example.invalid"); return {allowed: false, retryAfterSeconds: 23};};
  assert.equal((await f.call("login")).status, 429);
  f.deps.limits.consumeAccount = async () => {throw new Error("synthetic private store details");};
  const failed = await f.call("login"); assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), {error: "authentication_unavailable"});
  f.deps.limits.consumeAccount = async () => ({allowed: true, retryAfterSeconds: NaN});
  assert.equal((await f.call("login")).status, 503);
  assert.equal(f.rows().session.length, 0);
});
test("injected shared account budget spans request instances and IP changes (not actual shared-store proof)", async () => {
  const f = await setup(); let calls = 0;
  f.deps.limits.consumeAccount = async () => ({allowed: ++calls === 1, retryAfterSeconds: 5}); // Synthetic test threshold only.
  assert.equal((await f.call("login")).status, 200);
  const secondInstance = {...f.deps, connection: () => connection("127.0.0.2")};
  assert.equal((await sessionHttpRequest(request("login"), "login", env, secondInstance)).status, 429);
  assert.equal(f.rows().session.length, 1);
});
test("real service HTTP login canonicalizes email, preserves password and enforces seven days without renewal", async () => {
  const f = await setup(), start = Date.now(), result = await f.call("login");
  assert.equal(result.status, 200); assert.equal((await result.json()).user.id, "synthetic-a");
  assert.deepEqual(f.events.slice(0, 3), [["ip", "login", "127.0.0.1"], ["account", "synthetic@example.invalid"], ["sessions", 604800, "none"]]);
  const row = f.rows().session[0]; assert.match(row.token, /^hmac-sha256:v1:/);
  assert.ok(row.expiresAt >= new Date(start + TAILOR_SESSION_LIFETIME_SECONDS * 1000));
  const rawCookie = result.headers.get("set-cookie"); assert.match(rawCookie, /Max-Age=604800/); assert.match(rawCookie, /HttpOnly/i); assert.match(rawCookie, /SameSite=Lax/i);
  assert.doesNotMatch(rawCookie, /; Secure/i); assert.doesNotMatch(rawCookie, /; Domain=/i);
  const originalExpiry = new Date(row.expiresAt);
  const lookup = await f.call("session", {headers: cookieHeaders(result)});
  assert.equal(lookup.status, 200); assert.equal((await lookup.json()).expiresAt, originalExpiry.toISOString());
  assert.deepEqual(f.rows().session[0].expiresAt, originalExpiry);
  const browserGet = request("session", {headers: cookieHeaders(result)}); browserGet.headers.delete("origin");
  assert.equal((await sessionHttpRequest(browserGet, "session", env, f.deps)).status, 200);
  assert.equal((await f.call("login", {body: JSON.stringify({email: "synthetic@example.invalid", password: password.trim()})})).status, 401);
});
test("unknown email, wrong password and unverified account yield identical HTTP credential responses", async () => {
  const f = await setup(), bodies = [];
  for (const input of [{email: "unknown@example.invalid", password}, {email: "synthetic@example.invalid", password: "wrong"}, {email: "unverified@example.invalid", password}]) {
    const response = await f.call("login", {body: JSON.stringify(input)}); assert.equal(response.status, 401);
    assert.equal(response.headers.getSetCookie().length, 0); bodies.push(await response.text());
  }
  assert.equal(new Set(bodies).size, 1); assert.equal(f.rows().session.length, 0);
});
test("HTTPS real library cookie attributes and separate header preservation (offline, not TLS/browser proof)", async () => {
  const settings = {...env, PRODUCT_SESSION_HTTP_ORIGIN: "https://127.0.0.1:3443"}, f = await setup(settings);
  const result = await f.call("login"); assert.equal(result.status, 200);
  assert.match(result.headers.get("set-cookie"), /^__Secure-better-auth.session_token=/);
  assert.match(result.headers.get("set-cookie"), /; Secure/i); assert.match(result.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal((await f.call("session", {headers: cookieHeaders(result)})).status, 200);
  const service = createHttpSessionService(f.client, {mode: "test", origin: settings.PRODUCT_SESSION_HTTP_ORIGIN,
    authSecret: settings.PRODUCT_SESSION_HTTP_AUTH_SECRET, sessionTokenKey: Buffer.from(settings.PRODUCT_SESSION_TOKEN_KEY, "base64"), expiresInSeconds: 604800, renewal: "none"});
  const cookies = new Headers(); cookies.append("set-cookie", "first=synthetic; HttpOnly; Secure; SameSite=Lax"); cookies.append("set-cookie", "second=synthetic; HttpOnly; Secure; SameSite=Lax");
  f.deps.sessions = () => ({...service, login: async () => ({user: {id: "synthetic", name: "Synthetic", email: "synthetic@example.invalid"}, token: "must-not-serialize", headers: cookies})});
  const response = await f.call("login"); assert.equal(response.headers.getSetCookie().length, 2);
  assert.ok(!(await response.text()).includes("must-not-serialize"));
});
test("protected lookup isolates cookie identity; invalid/expired sessions never authorize", async () => {
  const f = await setup(), first = await f.call("login");
  const second = await f.call("login", {body: JSON.stringify({email: "other@example.invalid", password})});
  for (const [result, id] of [[first, "synthetic-a"], [second, "synthetic-b"]]) {
    const response = await f.call("session", {headers: {...cookieHeaders(result), "x-user-id": "attacker"}});
    const data = await response.json(); assert.equal(data.user.id, id); assert.ok(!("businessId" in data));
  }
  assert.equal((await f.call("session")).status, 401);
  assert.equal((await f.call("session", {headers: {cookie: "better-auth.session_token=forged"}})).status, 401);
  f.rows().session.find(row => row.userId === "synthetic-a").expiresAt = new Date(Date.now() - 1);
  assert.equal((await f.call("session", {headers: cookieHeaders(first)})).status, 401);
});
test("current-session logout revokes/clears only that device; injected server/network failure never reports success", async () => {
  const f = await setup(), first = await f.call("login"), second = await f.call("login");
  assert.equal((await f.call("logout", {headers: cookieHeaders(first), body: JSON.stringify({userId: "other"})})).status, 422);
  const out = await f.call("logout", {headers: cookieHeaders(first)}); assert.equal(out.status, 200); assert.deepEqual(await out.json(), {loggedOut: true});
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/i); assert.equal((await f.call("session", {headers: cookieHeaders(first)})).status, 401);
  assert.equal((await f.call("session", {headers: cookieHeaders(second)})).status, 200);
  f.client.session.deleteMany = async () => {throw new TypeError("Synthetic network failure with private values");};
  const failed = await f.call("logout", {headers: cookieHeaders(second)});
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), {error: "authentication_unavailable"}); assert.equal(failed.headers.getSetCookie().length, 0);
  assert.equal(f.rows().session.length, 1);
});
test("business permission helper authenticates from session and distinguishes 401 from 403", async () => {
  const f = await setup(), login = await f.call("login");
  const service = createHttpSessionService(f.client, {mode: "test", origin: env.PRODUCT_SESSION_HTTP_ORIGIN,
    authSecret: env.PRODUCT_SESSION_HTTP_AUTH_SECRET, sessionTokenKey: Buffer.from(env.PRODUCT_SESSION_TOKEN_KEY, "base64"), expiresInSeconds: 604800, renewal: "none"});
  assert.equal((await requireBusinessSession(service, new Headers(), async () => assert.fail("No anonymous authorization"))).status, 401);
  const denied = await requireBusinessSession(service, new Headers({...cookieHeaders(login), "x-user-id": "forged"}), async id => {assert.equal(id, "synthetic-a"); return false;});
  assert.equal(denied.status, 403);
});
test("shared Fetch boundary remains unavailable without transport dependencies; preview route is not replaced",async()=>{
  for(const operation of ["login","session","logout"])assert.equal((await sessionHttpRequest(request(operation),operation,env)).status,503);
});
test("native/private errors and sensitive cookies are never logged or copied into JSON", async t => {
  const logged = []; for (const name of ["log", "warn", "error", "info", "debug"]) t.mock.method(console, name, (...args) => logged.push(args));
  const f = await setup(); f.deps.sessions = () => {throw new Error("private cookie/password/key details");};
  const response = await f.call("login"); assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), JSON.stringify({error: "authentication_unavailable"})); assert.deepEqual(logged, []);
});

test("only opaque socket metadata is accepted; missing peer/TLS cannot be repaired with headers", async () => {
  const f = await setup();
  for (const metadata of [undefined, {peerAddress: "127.0.0.1", secure: false}, {...connection()},
    {peerAddress: "127.0.0.1", secure: false, rateTransport: {peerAddress: "127.0.0.1"}}]) {
    f.deps.connection = () => metadata;
    const result = await f.call("login", {headers: {"forwarded": "for=127.0.0.1;proto=http", "x-real-ip": "127.0.0.1", "x-forwarded-for": "127.0.0.1"}});
    assert.equal(result.status, 404); assert.equal(result.headers.getSetCookie().length, 0);
  }
  assert.deepEqual(f.events, []); assert.equal(f.rows().session.length, 0);
  assert.throws(() => sessionConnectionFromSocket({remoteAddress: "127.0.0.1"}), ProductAuthError);
  const empty = new Socket(), incompleteTls = new TLSSocket();
  Object.defineProperty(incompleteTls, "remoteAddress", {value: "127.0.0.1"});
  incompleteTls.getProtocol = () => "TLSv1.3"; // Protocol alone still cannot prove a completed handshake.
  try {assert.throws(() => sessionConnectionFromSocket(empty), ProductAuthError); assert.throws(() => sessionConnectionFromSocket(incompleteTls), ProductAuthError);}
  finally {empty.destroy(); incompleteTls.destroy();}
  assert.equal(connection("0:0:0:0:0:0:0:1").peerAddress, "::1");
  assert.equal(connection("::ffff:7f00:1").peerAddress, "127.0.0.1");
});
test("disabled/deletion-locked credentials are generic and fresh HTTP lookup refuses locks/revocation", async () => {
  const f = await setup(), first = await f.call("login");
  const user = f.rows().user.find(u => u.id === "synthetic-a");
  for (const field of ["disabledAt", "deletionRequestedAt"]) {
    user[field] = new Date(); // Offline existing-state fixture, not a lifecycle operation.
    const denied = await f.call("login"); assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), {error: "invalid_credentials"}); assert.equal(denied.headers.getSetCookie().length, 0);
    assert.equal((await f.call("session", {headers: cookieHeaders(first)})).status, 401);
    user[field] = null;
  }
  assert.equal(f.rows().session.length, 1);
  await f.client.session.deleteMany({where: {userId: "synthetic-a"}});
  assert.equal((await f.call("session", {headers: cookieHeaders(first)})).status, 401);
});
test("IP store failures and malformed denials stop before account checks or session construction", async () => {
  const f = await setup();
  for (const decision of [null, {allowed: true, retryAfterSeconds: null}, {allowed: false, retryAfterSeconds: 0}]) {
    f.deps.limits.consumeIp = async () => decision;
    assert.equal((await f.call("login")).status, 503);
  }
  f.deps.limits.consumeIp = async () => {throw new Error("private storage details");};
  const result = await f.call("login"); assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), {error: "authentication_unavailable"}); assert.deepEqual(f.events, []);
});
test("logout mutations require exact Origin even with a valid cookie; uncertain revocation never reports success", async () => {
  const f = await setup(), loggedIn = await f.call("login");
  const req = request("logout", {headers: cookieHeaders(loggedIn)}); req.headers.delete("origin");
  assert.equal((await sessionHttpRequest(req, "logout", env, f.deps)).status, 403);
  assert.equal((await f.call("logout", {headers: {...cookieHeaders(loggedIn), origin: "http://evil.invalid"}})).status, 403);
  assert.equal(f.rows().session.length, 1);
  const remove = f.client.session.deleteMany;
  f.client.session.deleteMany = async args => {
    await remove(args);
    f.client.session.findFirst = async () => {throw new Error("private confirmation read unavailable");};
    throw new Error("private lost revocation acknowledgement");
  };
  const result = await f.call("logout", {headers: cookieHeaders(loggedIn)});
  assert.equal(result.status, 503); assert.deepEqual(await result.json(), {error: "authentication_unavailable"});
  assert.equal(result.headers.getSetCookie().length, 0); assert.equal(f.rows().session.length, 0);
});
test("uncertain login commit never releases an authenticated cookie through HTTP", async () => {
  const f = await setup(), transaction = f.client.$transaction;
  f.client.$transaction = async (...args) => {await transaction(...args); throw new Error("private lost commit acknowledgement");};
  const result = await f.call("login"); assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), {error: "authentication_unavailable"}); assert.equal(result.headers.getSetCookie().length, 0);
  assert.equal(f.rows().session.length, 1); // May have committed, but its bearer cookie was never released.
});
