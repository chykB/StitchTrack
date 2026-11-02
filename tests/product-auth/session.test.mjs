import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
import {authorizeSessionIntegration, withSessionProofClients} from "./session.integration.mjs";
import {fakeProduct} from "./fake-product.mjs";
const {createSessionService} = await import("../../lib/product-auth/session.server.ts");
const {hashPassword} = await import("../../lib/auth/password.server.ts");
const {ProductAuthError} = await import("../../lib/product-auth/secrets.server.ts");

const config = {mode: "test", authSecret: "offline-only-session-secret-not-for-deployment", sessionTokenKey: Buffer.alloc(32, 7), expiresInSeconds: 600, renewal: "none"};
const password = " Exact synthetic e\u0301 phrase ";
const encoded = await hashPassword(password);
const fetcher = globalThis.fetch;
globalThis.fetch = async () => assert.fail("No external services in offline session tests");
test.after(() => {globalThis.fetch = fetcher;});
async function setup({verified = true, secret = password} = {}) {
  const f = fakeProduct({sessionAccess: true});
  // Real Better Auth on an explicit transaction/state double, never PostgreSQL.
  await f.client.user.create({data: {id: "synthetic-user", name: "\u1eccl\u00e1", email: "synthetic@example.invalid", emailVerified: verified}});
  await f.client.account.create({data: {id: "synthetic-credential", userId: "synthetic-user", accountId: "synthetic-user", providerId: "credential", password: secret === password ? encoded : await hashPassword(secret)}});
  return {...f, service: createSessionService(f.client, config)};
}
const login = (f, edit = {}) => f.service.login({email: " Synthetic@EXAMPLE.INVALID ", password, ...edit});
function cookies(result) {
  return new Headers({cookie: result.headers.getSetCookie().map(value => value.split(";")[0]).join("; ")});
}
const rejected = error => error instanceof ProductAuthError && error.code === "login_rejected" &&
  error.message === "Product authentication operation unavailable." && !error.cause;

test("inert private service requires explicit lifetime/fixed renewal and exports no Better Auth handler", async () => {
  const f = await setup();
  assert.deepEqual(Object.keys(f.service).sort(), ["hasSessionForLockedUser", "login", "logout", "logoutAll", "lookup"]);
  assert.equal(f.rows().session.length, 0);
  for (const patch of [{expiresInSeconds: undefined}, {expiresInSeconds: 0}, {expiresInSeconds: 1.5}, {expiresInSeconds: Infinity}, {expiresInSeconds: 34_560_001}, {sessionTokenKey: undefined}, {sessionTokenKey: Buffer.alloc(31)}, {renewal: undefined}, {renewal: "sliding"}, {mode: "production"}, {authSecret: "short"}]) {
    assert.throws(() => createSessionService(f.client, {...config, ...patch}), ProductAuthError);
  }
});
test("real Better Auth verified login canonicalizes email, issues signed HttpOnly cookie, and omits token from JSON", async () => {
  const f = await setup(), start = Date.now(), result = await login(f);
  assert.deepEqual(result.user, {id: "synthetic-user", name: "\u1eccl\u00e1", email: "synthetic@example.invalid"});
  assert.equal(f.rows().session.length, 1);
  const row = f.rows().session[0];
  assert.ok(row.expiresAt.getTime() >= start + 600_000 && row.expiresAt.getTime() <= Date.now() + 600_000);
  assert.match(result.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(result.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(result).includes(row.token));
  assert.ok(!Object.hasOwn(result, "token"));
});
test("wrong password, unknown account, unverified account and malformed input have the same safe rejection", async () => {
  for (const [options, edit] of [[{}, {password: "wrong"}], [{}, {email: "unknown@example.invalid"}], [{verified: false}, {}], [{}, {email: "a@b"}], [{}, {password: ""}], [{}, {callbackURL: "https://example.invalid"}]]) {
    const f = await setup(options); await assert.rejects(login(f, edit), rejected); assert.equal(f.rows().session.length, 0);
  }
});
test("spaces, case, Unicode form and passwords over 128 units are preserved; login adds no enrollment policy", async () => {
  const f = await setup();
  for (const wrong of [password.trim(), password.normalize("NFC"), password.toLowerCase()]) await assert.rejects(login(f, {password: wrong}), rejected);
  await login(f);
  for (const exact of ["x", "a".repeat(140), " "]) {
    const subject = await setup({secret: exact}); await login(subject, {password: exact}); assert.equal(subject.rows().session.length, 1);
  }
});
test("lookup uses signed cookies and fresh database state, fixed expiry does not renew, logout revokes", async () => {
  const f = await setup(), result = await login(f), headers = cookies(result), row = f.rows().session[0];
  const original = new Date(row.expiresAt);
  f.client.session.update = async () => assert.fail("Fixed-expiry lookup must never require UPDATE");
  const current = await f.service.lookup(headers);
  assert.deepEqual(current.session, {user: result.user, expiresAt: original});
  assert.ok(!JSON.stringify(current).includes(row.token));
  assert.deepEqual(f.rows().session[0].expiresAt, original);
  assert.equal((await f.service.lookup(new Headers())).session, null);
  assert.equal((await f.service.lookup(new Headers({cookie: "better-auth.session_token=forged"}))).session, null);
  const out = await f.service.logout(headers);
  assert.equal(f.rows().session.length, 0); assert.match(out.headers.get("set-cookie"), /Max-Age=0/i);
  assert.equal((await f.service.lookup(headers)).session, null);
  await f.service.logout(headers); // Idempotent, no token required in application input.
});
test("expired sessions are refused/deleted; unverified users and noncredential identities cannot authorize", async () => {
  const f = await setup(), result = await login(f), headers = cookies(result);
  f.rows().session[0].expiresAt = new Date(Date.now() - 1);
  assert.equal((await f.service.lookup(headers)).session, null); assert.equal(f.rows().session.length, 0);
  const other = await setup(), signed = cookies(await login(other));
  other.rows().user[0].emailVerified = false;
  assert.equal((await other.service.lookup(signed)).session, null);
  other.rows().user[0].emailVerified = true; other.rows().account.length = 0;
  assert.equal((await other.service.lookup(signed)).session, null);
});
test("wrong database, adapter failures and swallowed Better Auth logout errors fail safely without native details", async () => {
  const f = await setup(), headers = cookies(await login(f));
  f.client.session.deleteMany = async () => {throw new Error("synthetic private adapter detail");};
  await assert.rejects(f.service.logout(headers), error => error instanceof ProductAuthError && error.code === "session_unavailable" && !String(error).includes("private"));
  assert.equal(f.rows().session.length, 1);
  f.client.session.findFirst = async () => {throw new Error("synthetic private adapter detail");};
  await assert.rejects(f.service.lookup(headers), ProductAuthError);
  f.client.$queryRaw = async () => [{database: "stitchtrack_assessment", role: "stitchtrack_product_test_app", namespace: "product", safe: true}];
  await assert.rejects(login(f), error => error.code === "session_unavailable");
});
test("SQL proposal grants only Session INSERT columns and DELETE; fixed-expiry service requires no UPDATE", () => {
  const sql = readFileSync(new URL("../../prisma/product/setup/session-permissions.sql", import.meta.url), "utf8");
  const grants = sql.match(/^GRANT .*$/gm);
  assert.equal(grants.length, 2);
  assert.match(grants[0], /^GRANT INSERT \(.*\) ON product\."Session" TO/);
  assert.match(grants[1], /^GRANT DELETE ON product\."Session" TO/);
  assert.doesNotMatch(sql, /^GRANT (UPDATE|ALL|CREATE)/m);
  assert.match(sql, /stitchtrack_product_test_migrator/);
  assert.match(sql, /7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff/);
});

test("owner PostgreSQL harness is inert and rejects missing, production, assessment or development targets", () => {
  const env = {NODE_ENV: "test", PRODUCT_DATABASE_MODE: "test", PRODUCT_DATABASE_CONFIRMED: "true",
    PRODUCT_SESSION_INTEGRATION_CONFIRMED: "true", PRODUCT_TEST_DATABASE_URL:
    "postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};
  assert.equal(authorizeSessionIntegration(["--owner-integration"], env).mode, "test");
  for (const patch of [{NODE_ENV: "production"}, {PRODUCT_DATABASE_MODE: "development"}, {PRODUCT_SESSION_INTEGRATION_CONFIRMED: undefined},
    {PRODUCT_TEST_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?", "/stitchtrack_assessment?")}]) {
    assert.throws(() => authorizeSessionIntegration(["--owner-integration"], {...env, ...patch}));
  }
  assert.throws(() => authorizeSessionIntegration(["--owner-integration", "--reset"], env));
});

test("adapter failures do not log or return secrets, and production activation is refused", async t => {
  const logged = [];
  for (const method of ["log", "warn", "error", "debug", "info"]) t.mock.method(console, method, (...args) => logged.push(args));
  const f = await setup();
  f.client.session.create = async () => {throw new Error("synthetic-private-password-token-detail");};
  await assert.rejects(login(f), error => error.code === "session_unavailable" && !JSON.stringify(error).includes("private") && !error.cause);
  assert.deepEqual(logged, []);
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => createSessionService(f.client, config), error => error.code === "configuration_unavailable");
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test("actual installed Session insert columns match the narrowly proposed SQL grants", async () => {
  const f = await setup(), create = f.client.session.create;
  let inserted;
  f.client.session.create = async args => {inserted = Object.keys(args.data).sort(); return create(args);};
  await login(f);
  const sql = readFileSync(new URL("../../prisma/product/setup/session-permissions.sql", import.meta.url), "utf8");
  const granted = [...sql.match(/^GRANT INSERT \((.*)\) ON product\."Session"/m)[1].matchAll(/"([A-Za-z]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(inserted, granted);
});

const {sessionTokenDigester, sessionDigestAdapter} = await import("../../lib/product-auth/session-adapter.server.ts");
const {createHmac} = await import("node:crypto");
function rawToken(result) {
  const pair = result.headers.getSetCookie().find(cookie => cookie.startsWith("better-auth.session_token="));
  return decodeURIComponent(pair.split(";")[0].split("=").slice(1).join("=")).split(".")[0];
}
function signedCookie(token) {
  const signature = createHmac("sha256", config.authSecret).update(token).digest("base64");
  return new Headers({cookie: "better-auth.session_token=" + encodeURIComponent(token + "." + signature)});
}
test("two real library logins persist distinct HMAC digests, never raw tokens, and original cookies work", async () => {
  const f = await setup(), first = await login(f), second = await login(f);
  const tokens = [rawToken(first), rawToken(second)], rows = f.rows().session;
  const digest = sessionTokenDigester(config.sessionTokenKey);
  assert.notEqual(tokens[0], tokens[1]); assert.notEqual(rows[0].token, rows[1].token);
  for (const [i, row] of rows.entries()) {
    assert.match(tokens[i], /^[A-Za-z0-9]{32}$/);
    assert.equal(row.token, digest(tokens[i])); assert.notEqual(row.token, tokens[i]);
    assert.ok(!JSON.stringify(rows).includes(tokens[i]));
    assert.equal((await f.service.lookup(cookies(i ? second : first))).session.user.id, "synthetic-user");
  }
  assert.equal((await f.service.lookup(signedCookie("Z".repeat(32)))).session, null);
  await assert.rejects(f.service.lookup(signedCookie(rows[0].token)), ProductAuthError);
  await f.service.logout(cookies(first));
  assert.equal((await f.service.lookup(cookies(first))).session, null);
  assert.ok((await f.service.lookup(cookies(second))).session);
});
test("user-wide Better Auth revocation deletes all user digests, clears cookie and leaves other users alone", async () => {
  const f = await setup(), first = await login(f), second = await login(f);
  // Unrelated row only demonstrates scoped deletion in the offline double.
  await f.client.session.create({data: {id: "other-session", userId: "other-user", token: "unrelated-synthetic-digest", expiresAt: new Date(Date.now() + 10000)}});
  const result = await f.service.logoutAll(cookies(first));
  assert.match(result.headers.get("set-cookie"), /Max-Age=0/i);
  assert.deepEqual(f.rows().session.map(row => row.userId), ["other-user"]);
  assert.equal((await f.service.lookup(cookies(first))).session, null);
  assert.equal((await f.service.lookup(cookies(second))).session, null);
  await assert.rejects(f.service.logoutAll(new Headers()), ProductAuthError);
});
test("digest key/context are deterministic and separate; wrong keys and legacy raw storage cannot authenticate", async () => {
  const f = await setup(), result = await login(f), token = rawToken(result), digest = sessionTokenDigester(config.sessionTokenKey);
  assert.equal(digest(token), "hmac-sha256:v1:" + createHmac("sha256", config.sessionTokenKey).update("stitchtrack/session-token/v1\0").update(token).digest("hex"));
  const wrong = createSessionService(f.client, {...config, sessionTokenKey: Buffer.alloc(32, 8)});
  assert.equal((await wrong.lookup(cookies(result))).session, null);
  assert.throws(() => digest(digest(token)), ProductAuthError);
  f.rows().session[0].token = token; // Model an old plaintext row, never a real DB write.
  assert.equal((await f.service.lookup(cookies(result))).session, null);
});
test("public adapter transforms equality/in predicates once; metadata enumeration never returns stored digests", async () => {
  const f = await setup(), result = await login(f), token = rawToken(result);
  const adapter = sessionDigestAdapter(f.client, config.sessionTokenKey)({session: {disableSessionRefresh: true}});
  const byUser = await adapter.findMany({model: "session", where: [{field: "userId", value: "synthetic-user"}]});
  assert.equal(Object.hasOwn(byUser[0], "token"), false);
  const byTokens = await adapter.findMany({model: "session", where: [{field: "token", operator: "in", value: [token]}]});
  assert.equal(byTokens[0].token, token);
  assert.equal(await adapter.count({model: "session", where: [{field: "token", value: token}]}), 1);
  await adapter.transaction(async scoped => {
    const row = await scoped.findOne({model: "session", where: [{field: "token", value: token}]}); assert.equal(row.token, token);
  });
  assert.throws(() => adapter.update({model: "session", where: [{field: "token", value: token}], update: {token}}), ProductAuthError);
  await assert.rejects(adapter.findOne({model: "session", where: [{field: "token", operator: "contains", value: token}]}), ProductAuthError);
  assert.throws(() => sessionDigestAdapter(f.client, config.sessionTokenKey)({session: {disableSessionRefresh: true}, secondaryStorage: {}}), ProductAuthError);
  await adapter.deleteMany({model: "session", where: [{field: "token", operator: "in", value: [token]}]});
  assert.equal((await f.service.lookup(cookies(result))).session, null);
});
test("session lifetime bounds match installed cookie serializer before any session insert", async () => {
  const f = await setup();
  for (const duration of [-1, 0, NaN, Infinity, 0.5, 34_560_001, 2_147_483_647]) assert.throws(() => createSessionService(f.client, {...config, expiresInSeconds: duration}), ProductAuthError);
  assert.equal(f.rows().session.length, 0);
  const longest = createSessionService(f.client, {...config, expiresInSeconds: 34_560_000});
  const result = await longest.login({email: "synthetic@example.invalid", password});
  assert.match(result.headers.get("set-cookie"), /Max-Age=34560000/);
});

test("login/lookup/revocation and adapter failures never log bearer tokens, digest keys or cookies", async t => {
  const logged = [];
  for (const method of ["log", "warn", "error", "debug", "info"]) t.mock.method(console, method, (...args) => logged.push(args));
  const f = await setup(), first = await login(f), second = await login(f);
  await f.service.lookup(cookies(first));
  await f.service.logout(cookies(first));
  f.client.session.deleteMany = async () => {throw new Error("sensitive " + rawToken(second) + " " + config.sessionTokenKey.toString("hex") + " " + cookies(second).get("cookie"));};
  await assert.rejects(f.service.logoutAll(cookies(second)), error => error.code === "session_unavailable" && !String(error).includes(rawToken(second)) && !error.cause);
  assert.deepEqual(logged, []);
});
test("owner committed proof and cleanup stay test-only and scoped to fresh run fixtures", () => {
  const harness = readFileSync(new URL("./session.integration.mjs", import.meta.url), "utf8");
  const cleanup = readFileSync(new URL("../../prisma/product/setup/session-test-cleanup.sql", import.meta.url), "utf8");
  assert.match(harness, /withSessionProofClients\(connect, async \(writer, reader\)/);
  assert.match(harness, /new Set\(raw\.map\(digest\)\)/);
  assert.match(harness, /STOP FOR OWNER CLEANUP/);
  assert.match(cleanup, /current_database\(\)<>\x27stitchtrack_product_test\x27/);
  assert.match(cleanup, /current_user<>\x27stitchtrack_product_test_migrator\x27/);
  for (const table of ["Session", "Account", "User"]) assert.match(cleanup, new RegExp('DELETE FROM product\\."' + table + '" WHERE'));
  assert.doesNotMatch(cleanup, /TRUNCATE|DROP |DELETE FROM product\."(?:Terms|Email)/);
});

test("session grant proposal has only the exact test database/migrator/runtime path", () => {
  const sql = readFileSync(new URL("../../prisma/product/setup/session-permissions.sql", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\) <> 'stitchtrack_product_test'/);
  assert.match(sql, /expected constant text := 'stitchtrack_product_test_migrator'/);
  assert.match(sql, /runtime_role constant text := 'stitchtrack_product_test_app'/);
  assert.doesNotMatch(sql, /stitchtrack_product_dev|CASE current_database/);
  for (const grant of sql.match(/^GRANT .*$/gm)) assert.match(grant, /TO stitchtrack_product_test_app;$/);
});
test("all eight aggregate-count models already have table SELECT; fixtures use creates, not historical upserts", () => {
  const permissions = readFileSync(new URL("../../prisma/product/setup/permissions.sql", import.meta.url), "utf8");
  const harness = readFileSync(new URL("./session.integration.mjs", import.meta.url), "utf8");
  const granted = permissions.match(/GRANT SELECT ON TABLE ([\s\S]*?) TO/)[1];
  for (const table of ["User", "Account", "Session", "Verification", "TermsVersion", "TermsAcceptance", "EmailVerificationIssuance", "EmailOutbox"]) {
    assert.ok(granted.includes('product."' + table + '"'));
  }
  assert.ok(!granted.includes('_prisma_migrations'));
  assert.ok(harness.indexOf('const before = await totals()') < harness.indexOf('await writer.$transaction'));
  assert.match(harness, /findUnique\(\{where: \{email: unknownEmail\}\}\)/);
  assert.doesNotMatch(harness, /(?:tx|writer|reader)\.(?:user|account)\.(?:upsert|update|delete)/);
});
test("adapter transaction callback is a pass-through: no DB transaction and no rollback on callback failure", async () => {
  const f = await setup();
  f.client.$transaction = () => assert.fail("Adapter must not start a Prisma transaction");
  const adapter = sessionDigestAdapter(f.client, config.sessionTokenKey)({session: {disableSessionRefresh: true}});
  await assert.rejects(adapter.transaction(async scoped => {
    await scoped.create({model: "session", data: {userId: "synthetic-user", token: "A".repeat(32), expiresAt: new Date(Date.now() + 10000)}});
    throw new Error("synthetic callback failure");
  }), /synthetic callback failure/);
  assert.equal(f.rows().session.length, 1, "No rollback is promised by transaction:false");
  assert.match(f.rows().session[0].token, /^hmac-sha256:v1:/);
});
test("owner harness releases every constructed client on success, callback failure or second-constructor failure", async t => {
  t.mock.method(console, "log", () => {});
  for (const failure of [null, "operation", "construction", "disconnect"]) {
    let constructed = 0; const closed = [];
    const connect = () => {
      const id = ++constructed;
      if (failure === "construction" && id === 2) throw new Error("synthetic constructor failure");
      return {$disconnect: async () => {closed.push(id); if (failure === "disconnect" && id === 1) throw new Error("private native detail");}};
    };
    const operation = async () => {if (failure === "operation") throw new Error("synthetic operation failure"); return "done";};
    if (failure) await assert.rejects(withSessionProofClients(connect, operation), failure === "disconnect" ? /Session proof disconnect failed/ : /synthetic/);
    else assert.equal(await withSessionProofClients(connect, operation), "done");
    assert.deepEqual(closed, failure === "construction" ? [1] : [1, 2]);
  }
});

test("public migration-history guard inspects catalogs without resolving a relation in the restricted public schema", () => {
  const sql = readFileSync(new URL("../../prisma/product/setup/session-permissions.sql", import.meta.url), "utf8");
  assert.match(sql, /OR EXISTS \(SELECT 1 FROM pg_catalog\.pg_class c\s+JOIN pg_catalog\.pg_namespace n ON n\.oid=c\.relnamespace\s+WHERE n\.nspname='public' AND c\.relname='_prisma_migrations'\)/);
  assert.doesNotMatch(sql, /to_regclass\s*\(\s*'public\./i);
  assert.doesNotMatch(sql, /(?:FROM|JOIN|ON)\s+public\./i);
  assert.doesNotMatch(sql, /GRANT\s+(?:USAGE|CREATE|ALL)\b/i);
  assert.match(sql, /to_regclass\('product\._prisma_migrations'\) IS NULL/);
});
