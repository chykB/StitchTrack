// Deterministic algorithm/SQL contracts only. Never connects to PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import {Socket} from "node:net";
import {createHmac, createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import "../../scripts/register-server-only.mjs";
const {createAuthRateLimiter, rateTransportFromSocket, cleanupExpiredAuthRateBuckets} = await import("../../lib/product-auth/rate-limit.server.ts");
const key = Buffer.alloc(32, 17);
const email = " Synthetic@EXAMPLE.INVALID ";
function transport(address = "127.0.0.1") {
  // Socket metadata double only: no connect/listen or forged HTTP headers.
  const socket = new Socket(); Object.defineProperty(socket, "remoteAddress", {value: address});
  try {return rateTransportFromSocket(socket);} finally {socket.destroy();}
}
function policy(account = {capacity: 2, refillIntervalMs: 1000}, ip = {capacity: 50, refillIntervalMs: 1000}, version = "offline-v1") {
  return {account, ip, version}; // Test numbers, NOT approved production policies.
}
function database() {
  const rows = new Map(), calls = [];
  let now = 0, queue = Promise.resolve(), failure, maintenance = false;
  const target = {database: "stitchtrack_product_test", role: "stitchtrack_product_test_app", namespace: "product", safe: true};
  const client = {$queryRaw: async (strings, ...values) => {
    const sql = strings.join("?"); calls.push({sql, values});
    if (failure?.(sql, values)) throw new Error("private-synthetic-identity-key-SQL-error");
    if (sql.includes("current_database()")) return [{...target, ...(maintenance ? {role: "stitchtrack_product_test_migrator"} : {})}];
    // Serialize a deterministic row double. This DOES NOT prove PG locking.
    const run = queue.then(() => {
      if (sql.includes("WITH expired")) {
        let deleted = 0;
        for (const [k, r] of [...rows].sort((a, b) => a[1].expiresAt - b[1].expiresAt)) {
          if (deleted >= values[0]) break;
          if (r.expiresAt <= now) {rows.delete(k); deleted++;}
        }
        return [{deleted}];
      }
      assert.ok(sql.includes('INSERT INTO "product"."AuthRateBucket"'));
      const [digest, capacity, interval, initialTokens, repeatedInterval] = values;
      assert.equal(values.length, 5); assert.equal(initialTokens, capacity - 1); assert.equal(interval, repeatedInterval);
      assert.match(digest, /^rl:v1:[0-9a-f]{64}$/);
      let r = rows.get(digest), allowed;
      if (!r) {
        r = {capacity, interval, tokens: capacity - 1, refilledAt: now, expiresAt: now + interval}; allowed = true;
      } else {
        if (r.capacity !== capacity || r.interval !== interval) return [];
        const clock = Math.max(now, r.refilledAt), gained = Math.min(capacity, Math.floor((clock - r.refilledAt) / interval));
        const available = Math.min(capacity, r.tokens + gained);
        r.refilledAt = available === capacity ? clock : r.refilledAt + gained * interval;
        allowed = available >= 1; r.tokens = Math.max(0, available - 1);
        r.expiresAt = r.refilledAt + (capacity - r.tokens) * interval;
      }
      rows.set(digest, r);
      return [{allowed, retryAfterSeconds: r.tokens >= 1 ? 1 : Math.max(1, Math.ceil((r.refilledAt + interval - now) / 1000))}];
    }); queue = run.catch(() => {}); return run;
  }};
  return {client, rows, calls, target, time: value => {now = value;}, fail: value => {failure = value;}, maintenance: () => {maintenance = true;}};
}
function setup(p = policy(), db = database(), extra = {}) {
  return {...db, limiter: createAuthRateLimiter(db.client, {mode: "test", identifierKey: key, policies: {login: p}, ...extra})};
}
function digest(operation, version, kind, identity, secret = key) {
  return "rl:v1:" + createHmac("sha256", secret).update(JSON.stringify(["stitchtrack/auth-rate/v1", operation, version, kind, identity])).digest("hex");
}
const attempt = (f, address = transport(), value = email) => f.limiter.consume("login", address, value);
const limited = d => {assert.equal(d.allowed, false); assert.equal(d.reason, "rate_limited");};
const unavailable = d => assert.deepEqual(d, {allowed: false, reason: "unavailable", retryAfterSeconds: null});

test("initial allocation spends one token per budget; no work occurs on import/factory", async () => {
  const f = setup(); assert.equal(f.calls.length, 0);
  assert.deepEqual(await attempt(f), {allowed: true, retryAfterSeconds: 1});
  assert.equal(f.rows.size, 2);
  assert.equal(f.rows.get(digest("login", "offline-v1", "account", "synthetic@example.invalid")).tokens, 1);
  assert.equal(f.rows.get(digest("login", "offline-v1", "ip", "127.0.0.1")).tokens, 49);
  assert.deepEqual(Object.keys(f.limiter), ["consumeIp", "consumeAccount", "consume"]);
});
test("exact whole-token refill boundary, no fractional credit, and accurate ceiling Retry-After", async () => {
  const f = setup(); await attempt(f); await attempt(f);
  f.time(999); limited(await attempt(f));
  f.time(1000); assert.equal((await attempt(f)).allowed, true); limited(await attempt(f));
  f.time(1999); limited(await attempt(f)); f.time(2000); assert.equal((await attempt(f)).allowed, true);
  const slow = setup(policy({capacity: 1, refillIntervalMs: 2500})); await attempt(slow);
  slow.time(1); assert.equal((await attempt(slow)).retryAfterSeconds, 3);
  slow.time(1500); assert.equal((await attempt(slow)).retryAfterSeconds, 1);
  slow.time(2500); assert.equal((await attempt(slow)).allowed, true);
});
test("account denial includes the already-spent IP budget's longer retry delay", async () => {
  const f = setup(policy({capacity: 1, refillIntervalMs: 20_000}, {capacity: 2, refillIntervalMs: 30_000}));
  await attempt(f); const denied = await attempt(f); limited(denied); assert.equal(denied.retryAfterSeconds, 30);
});
test("burst exhaustion and concurrent callers spend each token once in the serialized DOUBLE", async () => {
  const f = setup(policy({capacity: 3, refillIntervalMs: 1000})), peer = transport();
  const results = await Promise.all(Array.from({length: 20}, () => attempt(f, peer)));
  assert.equal(results.filter(r => r.allowed).length, 3);
  assert.equal(results.filter(r => r.reason === "rate_limited").length, 17);
  assert.equal(f.rows.get(digest("login", "offline-v1", "ip", "127.0.0.1")).tokens, 30);
});
test("account and IP budgets are independent; either denial stops permission without refunds", async () => {
  const f = setup(policy({capacity: 1, refillIntervalMs: 1000}, {capacity: 2, refillIntervalMs: 1000}));
  assert.equal((await attempt(f)).allowed, true);
  limited(await attempt(f)); // Account denies, second IP token stays consumed.
  const count = f.calls.length; limited(await attempt(f, transport(), "unknown@example.invalid"));
  assert.equal(f.calls.length - count, 2); // target + IP, no account operation after IP denial.
  assert.equal(f.rows.size, 2);
  limited(await attempt(f, transport("127.0.0.2"))); // New IP does not escape account budget.
  assert.equal((await attempt(f, transport("127.0.0.2"), "unknown@example.invalid")).allowed, true);
});
test("known/unknown canonical emails share the same storage path; password/account lookups never occur", async () => {
  const f = setup(); await attempt(f); await attempt(f, transport(), "synthetic@example.invalid");
  assert.equal(f.rows.size, 2); limited(await attempt(f));
  assert.equal((await attempt(f, transport(), "never-registered@example.invalid")).allowed, true);
  assert.ok(f.calls.every(c => !/FROM .*"User"|"Account"|password/iu.test(c.sql)));
  unavailable(await attempt(f, transport(), "invalid email"));
});
test("operation, policy version, identity kind and dedicated HMAC key separate identifiers", async () => {
  const db = database(), p = policy();
  const f = setup(p, db, {policies: {login: p, reset: p}}), peer = transport();
  await attempt(f, peer); await f.limiter.consume("reset", peer, email);
  assert.equal(db.rows.size, 4);
  await attempt(setup(policy(undefined, undefined, "offline-v2"), db), peer); assert.equal(db.rows.size, 6);
  await attempt(setup(p, db, {identifierKey: Buffer.alloc(32, 18)}), peer); assert.equal(db.rows.size, 8);
  const mismatch = setup(policy({capacity: 9, refillIntervalMs: 1000}), db);
  unavailable(await attempt(mismatch)); // Reusing a version with changed settings cannot replenish account.
  assert.ok(db.calls.flatMap(c => c.values).every(v => typeof v === "number" || /^rl:v1:[0-9a-f]{64}$/.test(v)));
  assert.doesNotMatch(JSON.stringify(db.calls), /synthetic@|never-registered@|127\.0\.0\.1/u);
});
test("IPv4-mapped IPv6 and equivalent IPv6 spellings normalize consistently", async () => {
  const f = setup(); await attempt(f, transport("::ffff:127.0.0.1")); await attempt(f, transport("::ffff:7f00:1"));
  assert.equal(f.rows.size, 2); limited(await attempt(f, transport("127.0.0.1")));
  const v6 = setup(); await attempt(v6, transport("2001:DB8:0:0:0:0:0:1")); await attempt(v6, transport("2001:db8::1"));
  assert.equal(v6.rows.size, 2);
});
test("untrusted, malformed, zone-qualified and header-only metadata fails closed before SQL", async () => {
  const f = setup();
  for (const value of [null, {}, {peerAddress: "127.0.0.1"}, {headers: {"x-forwarded-for": "127.0.0.1"}}, "127.0.0.1"]) {
    unavailable(await attempt(f, value));
  }
  assert.equal(f.calls.length, 0);
  for (const value of ["", " 127.0.0.1", "0127.0.0.1", "fe80::1%lo", "[::1]", "not-an-IP"]) assert.throws(() => transport(value), /Verified socket peer required/);
  assert.throws(() => rateTransportFromSocket({remoteAddress: "127.0.0.1"}), /Verified socket peer required/);
  assert.equal(Object.isFrozen(transport()), true);
});
test("storage/target failures and partial budget consumption deny without leaking native errors", async t => {
  const logs = []; for (const method of ["log", "warn", "error", "info", "debug"]) t.mock.method(console, method, (...args) => logs.push(args));
  const f = setup(); let writes = 0;
  f.fail(sql => sql.includes("INSERT INTO") && ++writes === 2);
  unavailable(await attempt(f)); assert.equal(f.rows.size, 1); // IP spent; account write failed.
  assert.equal([...f.rows.values()][0].tokens, 49);
  f.fail(() => true); unavailable(await attempt(f)); assert.deepEqual(logs, []);
  for (const patch of [{database: "stitchtrack_assessment"}, {role: "stitchtrack_product_dev_app"}, {namespace: "public"}, {safe: false}]) {
    const other = setup(); Object.assign(other.target, patch); unavailable(await attempt(other)); assert.equal(other.rows.size, 0);
  }
});
test("malformed storage decisions cannot accidentally authorize a request", async () => {
  for (const response of [[], [{allowed: true, retryAfterSeconds: 0}], [{allowed: "true", retryAfterSeconds: 1}], [{allowed: false, retryAfterSeconds: Infinity}]]) {
    const db = database(), query = db.client.$queryRaw;
    db.client.$queryRaw = (strings, ...values) => strings.join("").includes("INSERT INTO") ? response : query(strings, ...values);
    unavailable(await attempt(setup(policy(), db)));
  }
});
test("expired buckets reset only after full refill; denied requests do not extend expiration", async () => {
  const f = setup(); await attempt(f); await attempt(f);
  const id = digest("login", "offline-v1", "account", "synthetic@example.invalid");
  assert.equal(f.rows.get(id).expiresAt, 2000);
  f.time(999); limited(await attempt(f)); assert.equal(f.rows.get(id).expiresAt, 2000);
  f.time(100_000); assert.equal((await attempt(f)).allowed, true); assert.equal(f.rows.get(id).tokens, 1);
  assert.equal(f.rows.get(id).expiresAt, 101_000);
  f.time(0); assert.equal((await attempt(f)).allowed, true); limited(await attempt(f)); // One saved token remains, but no backwards refill.
});
test("maintenance cleanup is separately authorized, bounded and deletes only expired rows", async () => {
  const f = setup(); await attempt(f); await attempt(f);
  assert.equal(await cleanupExpiredAuthRateBuckets(f.client, "test", 1), null); // Runtime has no maintenance authorization.
  f.maintenance(); f.time(1000);
  assert.deepEqual(await cleanupExpiredAuthRateBuckets(f.client, "test", 1), {deleted: 0});
  f.time(2000); assert.deepEqual(await cleanupExpiredAuthRateBuckets(f.client, "test", 1), {deleted: 1});
  assert.deepEqual(await cleanupExpiredAuthRateBuckets(f.client, "test", 1), {deleted: 1});
  for (const n of [0, -1, 1001, 1.5]) assert.equal(await cleanupExpiredAuthRateBuckets(f.client, "test", n), null);
});
test("configuration has no defaults, requires bounded integer policies, copies keys and refuses production", async () => {
  const db = database(), config = {mode: "test", identifierKey: Buffer.alloc(32, 9), policies: {login: policy()}};
  for (const patch of [{identifierKey: Buffer.alloc(31)}, {policies: {}}, {mode: "production"},
    {policies: {login: policy({capacity: 0, refillIntervalMs: 1})}}, {policies: {login: policy({capacity: 1, refillIntervalMs: 0.5})}},
    {policies: {login: policy({capacity: 2_147_483_647, refillIntervalMs: 2})}}, {policies: {login: {...policy(), version: "unsafe value"}}}]) {
    assert.throws(() => createAuthRateLimiter(db.client, {...config, ...patch}), /configuration required/);
  }
  const f = createAuthRateLimiter(db.client, config); config.identifierKey.fill(0); config.policies.login.account.capacity = 99;
  await f.consume("login", transport(), email);
  assert.ok(db.rows.has(digest("login", "offline-v1", "account", "synthetic@example.invalid", Buffer.alloc(32, 9))));
  const previous = process.env.NODE_ENV;
  try {process.env.NODE_ENV = "production"; unavailable(await f.consume("login", transport(), email)); assert.throws(() => createAuthRateLimiter(db.client, config));}
  finally {if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;}
});

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
test("atomic SQL, model, additive migration and grants preserve the isolated least-privilege boundary", () => {
  const source = read("../../lib/product-auth/rate-limit.server.ts");
  for (const contract of ['ON CONFLICT ("keyDigest") DO UPDATE', 'clock_timestamp()', 'b."capacity" = EXCLUDED."capacity"', 'FOR UPDATE SKIP LOCKED', 'LIMIT ${batchSize}', 'new WeakSet']) assert.ok(source.includes(contract), contract);
  assert.doesNotMatch(source, /\$queryRawUnsafe|Date\.now|console\.|headers\.get/iu);
  const sql = read("../../prisma/product/migrations/20261030_auth_rate_bucket/migration.sql"), ddl = sql.split('CREATE TABLE "product"."AuthRateBucket" (')[1].split('\n);')[0];
  assert.equal([...ddl.matchAll(/^  "\w+" (TEXT|INTEGER|TIMESTAMPTZ\(3\)|BOOLEAN) NOT NULL/gmu)].length, 7);
  const model = read("../../prisma/product/schema.prisma").match(/model AuthRateBucket \{([\s\S]*?)\n\}/u)[1];
  const fields = {keyDigest: ["String", "TEXT"], capacity: ["Int", "INTEGER"], refillIntervalMs: ["Int", "INTEGER"],
    tokens: ["Int", "INTEGER"], refilledAt: ["DateTime", "TIMESTAMPTZ(3)"], expiresAt: ["DateTime", "TIMESTAMPTZ(3)"], lastAllowed: ["Boolean", "BOOLEAN"]};
  for (const [name, [type, physical]] of Object.entries(fields)) {
    assert.ok(model.split("\n").some(line => line.startsWith(`  ${name} ${type}`) && !line.includes("?")));
    assert.ok(ddl.includes(`"${name}" ${physical} NOT NULL`));
  }
  assert.match(model, /@@index\(\[expiresAt, keyDigest\]\)/u);
  assert.doesNotMatch(model, /@relation|@default/u);
  assert.equal((sql.match(/CONSTRAINT /gu) ?? []).length, 5);
  assert.match(sql, /PRIMARY KEY \("keyDigest"\)/u); assert.match(sql, /CREATE INDEX "AuthRateBucket_expiresAt_keyDigest_idx"/u);
  assert.doesNotMatch(sql, /CREATE (?:SCHEMA|DATABASE|ROLE|TRIGGER|FUNCTION)|ALTER TABLE|DROP |GRANT |REFERENCES /u);
  const checksum = createHash("sha256").update(sql).digest("hex");
  for (const suffix of ["test", "dev"]) {
    const grants = read(`../../prisma/product/setup/rate-limit-${suffix}-permissions.sql`);
    assert.ok(grants.includes(`current_database() <> 'stitchtrack_product_${suffix}'`)); assert.ok(grants.includes(checksum));
    assert.match(grants, /GRANT UPDATE \("tokens", "refilledAt", "expiresAt", "lastAllowed"\)/u);
    assert.equal(grants.match(/^GRANT /gmu).length, 3);
    assert.doesNotMatch(grants, /^GRANT (?:ALL|DELETE|CREATE|TRUNCATE)|^GRANT [^\n]*ON product\."(?:Session|User|Account|TermsVersion)"/mu);
    assert.doesNotMatch(grants, /to_regclass\('public/u);
  }
});

test("split HTTP budgets enforce real limiter SQL separately and have explicit session/logout IP policies", async () => {
  const db=database(),f=setup(policy(),db,{ipOnlyPolicies:{session:{version:"offline-session",ip:{capacity:1,refillIntervalMs:1000}},logout:{version:"offline-logout",ip:{capacity:1,refillIntervalMs:1000}}}}),peer=transport();
  assert.equal((await f.limiter.consumeIp("login",peer)).allowed,true);assert.equal(f.rows.size,1);
  assert.equal((await f.limiter.consumeAccount("login",peer,email)).allowed,true);assert.equal(f.rows.size,2);
  assert.equal((await f.limiter.consumeAccount("login",peer,email)).allowed,true);limited(await f.limiter.consumeAccount("login",peer,email));
  assert.equal((await f.limiter.consumeIp("session",peer)).allowed,true);limited(await f.limiter.consumeIp("session",peer));
  assert.equal((await f.limiter.consumeIp("logout",peer)).allowed,true); // Independent operation, not the login budget.
  f.time(1000);assert.equal((await f.limiter.consumeIp("session",peer)).allowed,true);
  unavailable(await setup().limiter.consumeIp("logout",peer));
  unavailable(await f.limiter.consumeAccount("login",{peerAddress:"127.0.0.1"},email));
  f.fail(()=>true);unavailable(await f.limiter.consumeIp("login",peer));unavailable(await f.limiter.consumeAccount("login",peer,email));
});
