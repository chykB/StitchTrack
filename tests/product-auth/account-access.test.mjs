// OFFLINE: real Better Auth/Argon2id on serialized transaction doubles, not PG locks.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import "../../scripts/register-server-only.mjs";
import {fakeProduct, modelNames} from "./fake-product.mjs";
import {PRODUCT_MIGRATIONS, assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
const {createAccountAccessService, ACCOUNT_ACCESS_TRANSACTION_OPTIONS} = await import("../../lib/product-auth/account-access.server.ts");
const {createSessionService} = await import("../../lib/product-auth/session.server.ts");
const {hashPassword} = await import("../../lib/auth/password.server.ts");
const {ProductAuthError} = await import("../../lib/product-auth/secrets.server.ts");
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {throw new Error("External requests prohibited in offline account tests");};
test.after(() => {globalThis.fetch = originalFetch;});
const config = {mode: "test", authSecret: "offline-account-access-not-for-deployment-secret", sessionTokenKey: Buffer.alloc(32, 7), expiresInSeconds: 600, renewal: "none"};
const password = " Exact synthetic e\u0301 phrase ", encoded = await hashPassword(password);
const cookie = result => new Headers({cookie: result.headers.getSetCookie().map(h => h.split(";")[0]).join("; ")});
const rejected = e => e instanceof ProductAuthError && e.code === "login_rejected" && !e.cause;
const refused = e => e instanceof ProductAuthError && e.code === "account_lock_refused" && !e.cause;
const unavailable = e => e instanceof ProductAuthError && ["account_access_unavailable", "session_unavailable"].includes(e.code) && !e.cause && !Object.hasOwn(e, "headers");
const barrier = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
async function fixture() {
  const f = fakeProduct({sessionAccess: true}), base = f.client, hooks = {authorize: async () => true};
  for (const id of ["primary", "other"]) {
    await base.user.create({data: {id, name: "Synthetic tailor", email: id + "@example.invalid", emailVerified: true}});
    await base.account.create({data: {id: "credential-" + id, accountId: id, providerId: "credential", userId: id, password: encoded}});
  }
  const raw = base.$queryRaw, create = base.session.create, remove = base.session.deleteMany;
  base.$queryRaw = async (...args) => {
    if (hooks.connectionFailure) throw new Error("private-connection-password-key");
    const sql = args[0].join(""); const result = await raw(...args);
    if (sql.includes('UPDATE "product"."User"') && hooks.afterStatus) await hooks.afterStatus();
    if (sql.includes("FOR UPDATE") && hooks.afterLock) await hooks.afterLock();
    return result;
  };
  base.session.create = async args => {assert.equal(f.inTransaction(), true, "Session insert must use the outer tx"); if (hooks.beforeSession) await hooks.beforeSession(); return create(args);};
  base.session.deleteMany = async args => {const result = await remove(args); if (hooks.afterDelete) await hooks.afterDelete(); return result;};
  // Distinct root and tx objects detect accidental root-bound Better Auth queries.
  const delegate = (object, transactional) => new Proxy(object, {get(target, method) {
    const value = Reflect.get(target, method);
    return typeof value !== "function" ? value : (...args) => {
      assert.equal(f.inTransaction(), transactional, "Delegate escaped its scoped client"); return value.apply(target, args);
    };
  }});
  const tx = new Proxy(base, {get(target, prop) {
    if (prop === "$transaction") return undefined;
    if (modelNames.includes(prop)) return delegate(Reflect.get(target, prop), true);
    const value = Reflect.get(target, prop); return typeof value !== "function" ? value : (...args) => {
      assert.equal(f.inTransaction(), true); return value.apply(target, args);
    };
  }});
  let tail = Promise.resolve();
  const transaction = (callback, options) => {
    assert.deepEqual(options, ACCOUNT_ACCESS_TRANSACTION_OPTIONS);
    const work = tail.then(async () => {
      if (hooks.connectionFailure) throw new Error("private-connection-password-key");
      const result = await base.$transaction(async () => {
        const value = await callback(tx);
        if (hooks.commitFailure === "before") throw new Error("private-before-commit-key");
        return value;
      });
      if (hooks.commitFailure === "after") throw new Error("private-uncertain-commit-key");
      return result;
    });
    tail = work.catch(() => {}); return work;
  };
  const root = new Proxy(base, {get(target, prop) {
    if (prop === "$transaction") return transaction;
    if (modelNames.includes(prop)) return delegate(Reflect.get(target, prop), false);
    const value = Reflect.get(target, prop); return typeof value !== "function" ? value : (...args) => {
      assert.equal(f.inTransaction(), false, "Root query occurred inside transaction callback"); return value.apply(target, args);
    };
  }});
  const service = createSessionService(root, config);
  const access = createAccountAccessService(root, {mode: "test", authorize: async (...args) => {assert.equal(args[0], tx); return hooks.authorize(...args);}});
  return {...f, hooks, root, tx, service, access, login: (id = "primary", secret = password) => service.login({email: " " + id.toUpperCase() + "@EXAMPLE.INVALID ", password: secret})};
}

test("enabled verified login uses the actual transaction-bound library, exact password and digest storage", async () => {
  const f = await fixture(), result = await f.login();
  assert.equal(result.user.id, "primary"); assert.match(result.headers.get("set-cookie"), /HttpOnly/u);
  assert.match(f.rows().session[0].token, /^hmac-sha256:v1:/u);
  assert.ok(f.events.includes("user.lock") && f.events.includes("outer.return"));
  await assert.rejects(f.login("primary", password.trim()), rejected);
  assert.equal(f.rows().session.length, 1);
});
test("disabled, deletion-locked, unverified and unknown accounts share generic refusals with no session", async () => {
  for (const patch of [{disabledAt: new Date()}, {deletionRequestedAt: new Date()}, {emailVerified: false}]) {
    const f = await fixture(); Object.assign(f.rows().user[0], patch);
    await assert.rejects(f.login(), rejected); assert.equal(f.rows().session.length, 0);
  }
  const f = await fixture(); await assert.rejects(f.login("unknown"), rejected); assert.equal(f.rows().session.length, 0);
});
test("locking atomically revokes every target session and preserves other users and first timestamp", async () => {
  const f = await fixture(), first = await f.login(), second = await f.login(), other = await f.login("other");
  const result = await f.access.lock({userId: "primary", kind: "disable"});
  assert.deepEqual(result, {locked: true, revokedSessions: 2});
  assert.equal(f.rows().session.length, 1); assert.equal(f.rows().session[0].userId, "other");
  assert.equal((await f.service.lookup(cookie(first))).session, null); assert.equal((await f.service.lookup(cookie(second))).session, null);
  assert.equal((await f.service.lookup(cookie(other))).session.user.id, "other");
  const original = f.rows().user[0].disabledAt;
  assert.equal((await f.access.lock({userId: "primary", kind: "disable"})).revokedSessions, 0);
  assert.deepEqual(f.rows().user[0].disabledAt, original); assert.equal(f.rows().user[0].deletionRequestedAt, null);
  await f.access.lock({userId: "primary", kind: "deletion-request"});
  assert.ok(f.rows().user[0].deletionRequestedAt instanceof Date); assert.deepEqual(f.rows().user[0].disabledAt, original);
});
test("fresh flags reject a deliberately retained legacy session; individual logout remains effective", async () => {
  for (const field of ["disabledAt", "deletionRequestedAt"]) {
    const f = await fixture(), first = await f.login(), second = await f.login();
    // In-memory legacy-state simulation only: no database record is modified.
    f.rows().user[0][field] = new Date();
    assert.equal((await f.service.lookup(cookie(first))).session, null);
    assert.equal(f.rows().session.length, 2);
    await f.service.logout(cookie(first)); assert.equal(f.rows().session.length, 1);
    f.rows().user[0][field] = null;
    assert.ok((await f.service.lookup(cookie(second))).session);
  }
});
test("missing or malformed state fails closed, rather than treating absent flags as enabled", async () => {
  const f = await fixture(), current = await f.login();
  delete f.rows().user[0].disabledAt;
  await assert.rejects(f.login(), unavailable); await assert.rejects(f.service.lookup(cookie(current)), unavailable);
});
test("lifecycle authorization is explicit, transaction-local, deny-by-default and accepts no restore/flag payload", async () => {
  const f = await fixture();
  assert.throws(() => createAccountAccessService(f.root, {mode: "test"}), ProductAuthError);
  assert.throws(() => createSessionService(f.tx, config), ProductAuthError);
  for (const verdict of [false, "true", undefined]) {
    f.hooks.authorize = async () => verdict;
    await assert.rejects(f.access.lock({userId: "primary", kind: "disable"}), refused);
  }
  for (const input of [{userId: "primary", kind: "restore"}, {userId: "primary", kind: "disable", authorized: true}, {userId: "primary", kind: "disable", disabledAt: null}]) await assert.rejects(f.access.lock(input), refused);
  f.hooks.authorize = async () => true;
  await assert.rejects(f.access.lock({userId: "missing", kind: "disable"}), refused);
  assert.equal(f.rows().user[0].disabledAt, null); assert.equal(f.rows().user[0].deletionRequestedAt, null);
  assert.deepEqual(Object.keys(f.access), ["lock"]);
});
test("failed status write, session revocation or authorization rolls back the complete operation", async () => {
  for (const stage of ["status", "delete", "authorize"]) {
    const f = await fixture(); await f.login(); const before = structuredClone(f.rows());
    if (stage === "status") f.hooks.afterStatus = async () => {throw new Error("private-status-fault");};
    if (stage === "delete") f.hooks.afterDelete = async () => {throw new Error("private-delete-fault");};
    if (stage === "authorize") f.hooks.authorize = async () => {throw new Error("private-authorization-fault");};
    await assert.rejects(f.access.lock({userId: "primary", kind: "deletion-request"}), unavailable);
    assert.deepEqual(f.rows(), before);
  }
});
test("failed/uncertain commit and connection failure return no login cookies, with no automatic retry", async () => {
  for (const stage of ["before", "after", "connection"]) {
    const f = await fixture(); if (stage === "connection") f.hooks.connectionFailure = true; else f.hooks.commitFailure = stage;
    await assert.rejects(f.login(), unavailable);
    assert.equal(f.rows().session.length, stage === "after" ? 1 : 0); // Uncertain commit is not fabricated rollback.
    assert.ok(!f.rows().session.some(r => !r.token.startsWith("hmac-sha256:v1:")));
  }
});
test("lock commit failure is reported honestly: rollback before commit, uncertain state afterward", async () => {
  for (const stage of ["before", "after"]) {
    const f = await fixture(); await f.login(); const before = structuredClone(f.rows());
    f.hooks.commitFailure = stage;
    await assert.rejects(f.access.lock({userId: "primary", kind: "disable"}), unavailable);
    if (stage === "before") assert.deepEqual(f.rows(), before);
    else {assert.ok(f.rows().user[0].disabledAt instanceof Date); assert.equal(f.rows().session.length, 0);}
  }
});
test("DOUBLE: login-first commits a session, then locking revokes it before lock returns", {timeout: 5000}, async () => {
  const f = await fixture(), entered = barrier(), release = barrier();
  f.hooks.beforeSession = async () => {entered.resolve(); await release.promise;};
  const login = f.login(); await entered.promise;
  const lock = f.access.lock({userId: "primary", kind: "disable"});
  await new Promise(setImmediate); assert.equal(f.rows().user[0].disabledAt, null);
  release.resolve(); const [result] = await Promise.all([login, lock]);
  assert.equal(f.rows().session.length, 0); assert.equal((await f.service.lookup(cookie(result))).session, null);
});
test("DOUBLE: lock-first commits before waiting login, which must refuse without creating a session", {timeout: 5000}, async () => {
  const f = await fixture(), entered = barrier(), release = barrier();
  f.hooks.afterStatus = async () => {entered.resolve(); await release.promise;};
  const lock = f.access.lock({userId: "primary", kind: "deletion-request"}); await entered.promise;
  const login = assert.rejects(f.login(), rejected);
  await new Promise(setImmediate); assert.equal(f.rows().session.length, 0);
  release.resolve(); await Promise.all([lock, login]); assert.equal(f.rows().session.length, 0);
});
test("safe errors and production refusal never log passwords, session material or native failure details", async t => {
  const logged = []; for (const method of ["log", "warn", "error", "info", "debug"]) t.mock.method(console, method, (...args) => logged.push(args));
  const f = await fixture(); f.hooks.connectionFailure = true;
  await assert.rejects(f.login(), e => unavailable(e) && !JSON.stringify(e).includes("private"));
  await assert.rejects(f.access.lock({userId: "primary", kind: "disable"}), e => unavailable(e) && !JSON.stringify(e).includes("private"));
  assert.deepEqual(logged, []);
  const previous = process.env.NODE_ENV;
  try {process.env.NODE_ENV = "production"; assert.throws(() => createAccountAccessService(f.root, {mode: "test", authorize: async () => true}), ProductAuthError);}
  finally {if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;}
});
test("additive migration/manifest and separate test grants preserve narrow schema and permissions", () => {
  const read = file => readFileSync(new URL("../../" + file, import.meta.url), "utf8");
  const file = "prisma/product/migrations/20261030_user_access_locks/migration.sql", sql = read(file);
  assert.equal(createHash("sha256").update(sql).digest("hex"), PRODUCT_MIGRATIONS["20261030_user_access_locks"]); assertProductMigrationFiles();
  assert.match(sql, /ADD COLUMN "disabledAt" TIMESTAMPTZ\(3\)/u); assert.match(sql, /ADD COLUMN "deletionRequestedAt" TIMESTAMPTZ\(3\)/u);
  assert.doesNotMatch(sql.slice(sql.indexOf('ALTER TABLE "product"."User"')), /DEFAULT|NOT NULL|CREATE INDEX|DROP |DELETE FROM|UPDATE "product"/u);
  assert.match(sql, /count\(\*\) FROM product\._prisma_migrations\)<>3/u);
  const schema = read("prisma/product/schema.prisma");
  for (const field of ["disabledAt", "deletionRequestedAt"]) assert.match(schema, new RegExp(`  ${field} DateTime\\? @db\\.Timestamptz\\(3\\)`));
  for (const [kind, field] of [["disable", "disabledAt"], ["deletion", "deletionRequestedAt"]]) {
    const grants = read("prisma/product/setup/account-access-test-" + kind + "-permissions.sql");
    assert.equal(grants.match(/^GRANT /gmu).length, 1); assert.ok(grants.includes(`GRANT UPDATE ("${field}") ON product."User" TO stitchtrack_product_test_app;`));
    assert.ok(grants.includes(PRODUCT_MIGRATIONS["20261030_user_access_locks"]));
    assert.doesNotMatch(grants, /stitchtrack_product_dev|^GRANT (?:ALL|DELETE|INSERT)|^GRANT UPDATE ON/mu);
  }
});
