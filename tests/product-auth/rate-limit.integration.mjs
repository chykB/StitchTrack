// OWNER ONLY. Default inert; no connection, socket or journal on import.
import {pathToFileURL} from "node:url";
import {createHash, createHmac, randomBytes, randomUUID} from "node:crypto";
import {readFileSync, writeFileSync, mkdirSync, lstatSync, openSync, fsyncSync, closeSync} from "node:fs";
import {userInfo} from "node:os";
import {join} from "node:path";
import {PRODUCT_PRISMA_CONNECTION_OPTIONS,productDatabaseConfig, productMigrationConfig} from "../../prisma/product/targets.ts";
import {assertProductMigrationFiles, PRODUCT_MIGRATIONS} from "../../prisma/product/migration-files.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function authorizeRateProof(args, env) {
  if (process.platform !== "linux" || env.NODE_ENV !== "test" || env.PRODUCT_DATABASE_MODE !== "test" ||
      env.PGOPTIONS || env.PGSERVICE || env.PGSERVICEFILE || env.DEBUG || env.NODE_DEBUG || env.RUST_LOG || env.PRISMA_LOG_LEVEL || env.NODE_OPTIONS || env.PRODUCT_EMAIL_WORKER_ENABLED === "true" || env.ENABLE_PRODUCT_SESSION_HTTP === "true") throw new Error("Isolated owner rate proof authorization required.");
  if (args.length === 1 && args[0] === "--owner-integration" && env.PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED === "true" && env.PRODUCT_RATE_LIMIT_CLEANUP_CONFIRMED !== "true") {
    return {action: "proof", target: productDatabaseConfig(env)};
  }
  if (args.length === 2 && args[0] === "--owner-cleanup" && UUID.test(args[1]) && env.PRODUCT_RATE_LIMIT_CLEANUP_CONFIRMED === "true" && env.PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED !== "true") {
    return {action: "cleanup", runId: args[1], target: productMigrationConfig(env)};
  }
  throw new Error("Isolated owner rate proof authorization required.");
}
// Fixed synthetic plan. Cleanup accepts NO caller-supplied keys, emails or SQL.
export function rateProofPlan(runId, key) {
  if (!UUID.test(runId) || !(key instanceof Uint8Array) || key.length !== 32) throw new Error("Invalid private rate proof manifest.");
  const version = name => "rp_" + runId.replaceAll("-", "") + "_" + name;
  const email = name => name + "-" + runId + "@example.invalid";
  const policy = (name, account, ip) => ({version: version(name), account, ip});
  const slow = capacity => ({capacity, refillIntervalMs: 120_000}); // PROOF ONLY; not a product policy.
  const cases = {
    account: {policy: policy("a", slow(3), slow(64)), emails: [email("account")]},
    ip: {policy: policy("i", slow(64), slow(3)), emails: Array.from({length: 20}, (_, i) => email("ip" + i))},
    canonical: {policy: policy("c", slow(1), slow(64)), emails: [email("canonical")]},
    refill: {policy: policy("r", {capacity: 1, refillIntervalMs: 2500}, slow(64)), emails: [email("refill")]},
  };
  const digest = (v, kind, identity) => "rl:v1:" + createHmac("sha256", key)
    .update(JSON.stringify(["stitchtrack/auth-rate/v1", "login", v, kind, identity])).digest("hex");
  const keys = new Set();
  for (const c of Object.values(cases)) {
    keys.add(digest(c.policy.version, "ip", "127.0.0.1"));
    for (const value of c.emails) keys.add(digest(c.policy.version, "account", value));
  }
  const probeKey = digest(version("p"), "account", email("constraint")); keys.add(probeKey);
  if (keys.size !== 28) throw new Error("Unexpected bounded rate proof plan.");
  return {cases, keys: [...keys].sort(), probeKey, ipKey: c => digest(c.policy.version, "ip", "127.0.0.1"), accountKey: (c, index = 0) => digest(c.policy.version, "account", c.emails[index])};
}
function proofRoot() {return join(userInfo().homedir, ".stitchtrack-rate-proofs");}
function directory(runId) {if (!UUID.test(runId)) throw new Error(); return join(proofRoot(), runId);}
function syncDirectory(path) {const fd = openSync(path, "r"); try {fsyncSync(fd);} finally {closeSync(fd);}}
function sourceDigest() {return createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");}
function savePrivateManifest(runId, key) {
  const root = proofRoot();
  try {mkdirSync(root, {mode: 0o700}); syncDirectory(userInfo().homedir);} catch (e) {if (e.code !== "EEXIST") throw e;}
  const base = lstatSync(root);
  if (!base.isDirectory() || base.isSymbolicLink() || base.uid !== process.getuid() || (base.mode & 0o777) !== 0o700) throw new Error();
  const dir = directory(runId); mkdirSync(dir, {mode: 0o700}); syncDirectory(root); // EEXIST refuses overwrite.
  const fd = openSync(dir + "/manifest.json", "wx", 0o600);
  try {writeFileSync(fd, JSON.stringify({format: 1, runId, key: Buffer.from(key).toString("base64"), source: sourceDigest()})); fsyncSync(fd);}
  finally {closeSync(fd);}
  syncDirectory(dir);
}
function loadPrivateManifest(runId) {
  const dir = directory(runId), file = dir + "/manifest.json";
  const base = lstatSync(proofRoot()), d = lstatSync(dir), f = lstatSync(file);
  if (!base.isDirectory() || base.isSymbolicLink() || base.uid !== process.getuid() || (base.mode & 0o777) !== 0o700 || !d.isDirectory() || d.isSymbolicLink() || d.uid !== process.getuid() || (d.mode & 0o777) !== 0o700 ||
      !f.isFile() || f.isSymbolicLink() || f.nlink !== 1 || f.uid !== process.getuid() || (f.mode & 0o777) !== 0o600 || f.size > 1024) throw new Error();
  const m = JSON.parse(readFileSync(file, "utf8"));
  if (JSON.stringify(Object.keys(m).sort()) !== JSON.stringify(["format", "key", "runId", "source"]) || m.format !== 1 || m.runId !== runId || m.source !== sourceDigest()) throw new Error();
  const key = Buffer.from(m.key, "base64"); if (key.length !== 32 || key.toString("base64") !== m.key) throw new Error();
  return key;
}
function lockId(runId) {return BigInt.asIntN(64, BigInt("0x" + createHash("sha256").update("stitchtrack/rate-proof/" + runId).digest("hex").slice(0, 16))).toString();}
function pgConfig(target, applicationName) {
  return {connectionString: target.url, application_name: applicationName, ssl: false,
    connectionTimeoutMillis: 5000, query_timeout: 7000, statement_timeout: 5000, lock_timeout: 4000,
    idle_in_transaction_session_timeout: 10_000, keepAlive: true, keepAliveInitialDelayMillis: 1000};
}
async function assertConnection(client, target) {
  const {rows} = await client.query(`SELECT current_database() AS db, current_user AS role, session_user AS session_role,
    current_setting('port') AS port, pg_backend_pid() AS pid,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS safe
    FROM pg_roles WHERE rolname=current_user`);
  if (rows.length !== 1 || rows[0].db !== target.database || rows[0].role !== target.user || rows[0].session_role !== target.user || rows[0].port !== "5432" || !rows[0].safe) throw new Error();
  return rows[0].pid;
}
async function assertHistory(client) {
  const objects = await client.query(`SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='product' AND c.relname IN ('_prisma_migrations','AuthRateBucket') AND pg_get_userbyid(c.relowner)=current_user AND c.relkind='r'`);
  const namespace = await client.query("SELECT 1 FROM pg_namespace WHERE nspname='product' AND pg_get_userbyid(nspowner)=current_user");
  if (namespace.rowCount !== 1 || objects.rows.length !== 2 || (await client.query(`SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='_prisma_migrations'`)).rowCount) throw new Error();
  const {rows} = await client.query('SELECT migration_name,checksum,finished_at,rolled_back_at,logs,applied_steps_count FROM product._prisma_migrations ORDER BY migration_name');
  if (rows.length !== 2 || rows.some(r => PRODUCT_MIGRATIONS[r.migration_name] !== r.checksum || !r.finished_at || r.rolled_back_at || r.logs !== null || r.applied_steps_count !== 1) || new Set(rows.map(r => r.migration_name)).size !== 2) throw new Error();
}
export async function closeRateProofClients(clients) {
  const outcomes = await Promise.allSettled(clients.map(c => Promise.resolve().then(() => c.$disconnect())));
  if (outcomes.some(r => r.status === "rejected")) throw new Error("Rate proof connection cleanup failed.");
}
async function cleanup(target, runId) {
  assertProductMigrationFiles();
  const key = loadPrivateManifest(runId), plan = rateProofPlan(runId, key), dir = directory(runId);
  try {lstatSync(dir + "/cleanup-complete.json"); throw new Error("Cleanup already recorded; stop.");} catch (e) {if (e.code !== "ENOENT") throw e;}
  const {Client} = await import("pg"); const client = new Client(pgConfig(target, "stitchtrack-rate-cleanup")); client.on("error", () => {});
  try {
    await client.connect(); await assertConnection(client, target);
    await client.query("BEGIN"); await client.query("SET LOCAL search_path=pg_catalog");
    await assertHistory(client);
    const lock = await client.query("SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired", [lockId(runId)]);
    if (!lock.rows[0].acquired) throw new Error("Proof still holds its lock.");
    const active = await client.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND pid<>pg_backend_pid()", ["stitchtrack-rate-proof-" + runId]);
    if (active.rows[0].count !== 0) throw new Error("Proof connections still exist.");
    const removed = await client.query('DELETE FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[]) RETURNING 1', [plan.keys]);
    if (removed.rowCount > 28) throw new Error();
    const left = await client.query('SELECT count(*)::integer AS count FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])', [plan.keys]);
    if (left.rows[0].count !== 0) throw new Error();
    await client.query("COMMIT");
    // No automatic cleanup/retry. If receipt capture fails, commit may have succeeded.
    writeFileSync(dir + "/cleanup-complete.json", JSON.stringify({runId, deleted: removed.rowCount}), {flag: "wx", mode: 0o600});
    console.log("PASS exact-key cleanup committed; removed_rows=" + removed.rowCount);
  } catch {await client.query("ROLLBACK").catch(() => {}); throw new Error("Rate proof cleanup unconfirmed.");}
  finally {key.fill(0); await client.end(); console.log("Cleanup connection closed.");}
}
async function run(target) {
  assertProductMigrationFiles();
  const runId = randomUUID(), key = randomBytes(32), plan = rateProofPlan(runId, key);
  savePrivateManifest(runId, key); // Durable recovery material BEFORE any database connection/write.
  console.log("Synthetic rate proof run_id=" + runId);
  console.log("Private cleanup manifest retained outside Git; never capture its contents.");
  await import("../../scripts/register-server-only.mjs");
  const {default: assert} = await import("node:assert/strict");
  const {Client} = await import("pg");
  const {PrismaClient} = await import("../../prisma/product/generated/client.ts");
  const {PrismaPg} = await import("@prisma/adapter-pg");
  const {createServer, createConnection} = await import("node:net");
  const {once} = await import("node:events");
  const {setTimeout: sleep} = await import("node:timers/promises");
  const {createAuthRateLimiter, rateTransportFromSocket} = await import("../../lib/product-auth/rate-limit.server.ts");
  const name = "stitchtrack-rate-proof-" + runId, clients = [], sockets = [];
  const probe = new Client(pgConfig(target, name)), server = createServer(socket => {
    sockets.push(socket); socket.on("error", () => {alive = false;});
  });
  let alive = true; probe.on("error", () => {alive = false;}); probe.on("end", () => {alive = false;});
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => {throw new Error("External services prohibited.");};
  try {
    await probe.connect(); const pids = [await assertConnection(probe, target)];
    assert.equal((await probe.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [lockId(runId)])).rows[0].acquired, true);
    for (let i = 0; i < 4; i++) {
      const c = new PrismaClient({adapter: new PrismaPg({...pgConfig(target, name), max: 1,options:PRODUCT_PRISMA_CONNECTION_OPTIONS}, {schema: "product"}), log: []}); clients.push(c);
      const identity = await c.$queryRaw`SELECT current_database() AS db, current_user AS role, pg_backend_pid() AS pid`;
      assert.equal(identity[0].db, target.database); assert.equal(identity[0].role, target.user); pids.push(identity[0].pid);
    }
    assert.equal(new Set(pids).size, 5); // Four independently constructed Prisma pools, max one connection each.
    const present = await probe.query('SELECT count(*)::integer AS count FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])', [plan.keys]);
    assert.equal(present.rows[0].count, 0, "Fresh plan collision: no writes permitted.");
    const unknown = await probe.query('SELECT count(*)::integer AS count FROM product."User" WHERE "emailCanonical"=ANY($1::text[])',
      [Object.values(plan.cases).flatMap(c => c.emails)]);
    assert.equal(unknown.rows[0].count, 0, "Synthetic proof identities must be unknown; no User writes occur.");
    // Real loopback TCP socket, not HTTP headers or synthetic remoteAddress properties.
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const accepted = once(server, "connection"), outgoing = createConnection({host: "127.0.0.1", port: server.address().port}); sockets.push(outgoing); outgoing.on("error", () => {alive = false;});
    await once(outgoing, "connect"); const [incoming] = await accepted;
    const peer = rateTransportFromSocket(incoming); assert.equal(peer.peerAddress, "127.0.0.1");
    // Validate planned INSERT identifiers BEFORE forwarding the unchanged real
    // Prisma tagged query; no counter behavior is substituted or mocked.
    const guarded = c => ({$queryRaw: (strings, ...values) => {
      if (strings.join("").includes('INSERT INTO "product"."AuthRateBucket"') && !plan.keys.includes(values[0])) throw new Error("Unplanned proof key.");
      return c.$queryRaw(strings, ...values);
    }});
    const limiter = (c, policy) => createAuthRateLimiter(guarded(c), {mode: "test", identifierKey: key, policies: {login: policy}});
    const now = async () => Number((await probe.query("SELECT extract(epoch FROM clock_timestamp()) * 1000 AS ms")).rows[0].ms);
    for (const scenario of ["account", "ip"]) {
      const c = plan.cases[scenario], limits = clients.map(db => limiter(db, c.policy)), start = await now();
      const jobs = Array.from({length: 20}, (_, i) => limits[i % clients.length].consume("login", peer, c.emails[i % c.emails.length]));
      const results = await Promise.all(jobs), end = await now();
      assert.ok(alive && end >= start && end - start < 120_000, "Refill-free timing window unconfirmed.");
      assert.equal(results.filter(r => r.allowed).length, 3);
      assert.equal(results.filter(r => r.reason === "rate_limited").length, 17);
      const ipState = await probe.query('SELECT "tokens" FROM product."AuthRateBucket" WHERE "keyDigest"=$1', [plan.ipKey(c)]);
      assert.equal(ipState.rows[0].tokens, scenario === "account" ? 44 : 0);
      const accountRows = await probe.query('SELECT "tokens" FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])',
        [c.emails.map((_, i) => plan.accountKey(c, i))]);
      assert.equal(accountRows.rows.length, scenario === "account" ? 1 : 3);
      assert.ok(accountRows.rows.every(r => r.tokens === (scenario === "account" ? 0 : 63)));
      console.log("PASS " + scenario + " budget: 20 concurrent attempts, exactly 3 admitted; db_elapsed_ms=" + Math.ceil(end - start) + " (below refill interval).");
    }
    const canonical = plan.cases.canonical, service = limiter(clients[0], canonical.policy);
    assert.equal((await service.consume("login", peer, " " + canonical.emails[0].toUpperCase() + " ")).allowed, true);
    assert.equal((await service.consume("login", peer, canonical.emails[0])).reason, "rate_limited");
    assert.equal((await limiter(clients[1], {...canonical.policy, account: {...canonical.policy.account, capacity: 2}}).consume("login", peer, canonical.emails[0])).reason, "unavailable");
    console.log("PASS canonical equivalents share unknown-account budget; unchanged version rejects policy mismatch.");
    const refill = plan.cases.refill, rs = limiter(clients[0], refill.policy);
    assert.equal((await rs.consume("login", peer, refill.emails[0])).allowed, true);
    const before = await now(), denied = await rs.consume("login", peer, refill.emails[0]), after = await now();
    assert.equal(denied.reason, "rate_limited");
    const state = await probe.query('SELECT "refilledAt", "refillIntervalMs" FROM product."AuthRateBucket" WHERE "keyDigest"=$1', [plan.accountKey(refill)]);
    const next = state.rows[0].refilledAt.getTime() + state.rows[0].refillIntervalMs;
    assert.ok(denied.retryAfterSeconds >= Math.max(1, Math.ceil((next - after) / 1000)) && denied.retryAfterSeconds <= Math.max(1, Math.ceil((next - before) / 1000)));
    await sleep(Math.max(0, next - await now()) + 50); assert.ok(await now() >= next);
    assert.equal((await rs.consume("login", peer, refill.emails[0])).allowed, true);
    console.log("PASS Retry-After matches database deadlines; genuine elapsed-time refill admits again.");
    const expectState = async (sql, values, expected, setup) => {
      await probe.query("BEGIN");
      try {if (setup) await setup(); let state; try {await probe.query(sql, values);} catch (e) {state = e.code;}
        assert.equal(state, expected);
      } finally {await probe.query("ROLLBACK");}
    };
    for (const sql of ['UPDATE product."AuthRateBucket" SET "capacity"="capacity" WHERE false',
      'UPDATE product."AuthRateBucket" SET "keyDigest"="keyDigest" WHERE false',
      'DELETE FROM product."AuthRateBucket" WHERE false', 'SELECT count(*) FROM product._prisma_migrations',
      'UPDATE product."User" SET "emailCanonical"="emailCanonical" WHERE false',
      'DELETE FROM product."Account" WHERE false', 'UPDATE product."Session" SET "expiresAt"="expiresAt" WHERE false']) await expectState(sql, [], "42501");
    // Every constraint probe is rolled back, including unexpected successful writes.
    const insert = `INSERT INTO product."AuthRateBucket" ("keyDigest","capacity","refillIntervalMs","tokens","refilledAt","expiresAt","lastAllowed")
      SELECT $1,$2::integer,$3::integer,$4::integer,t.n,t.n+$5::integer*INTERVAL '1 millisecond',true
      FROM (SELECT date_trunc('milliseconds',clock_timestamp()) AS n) t`;
    for (const args of [["invalid", 3, 1000, 2, 1000], [plan.probeKey, 0, 1000, 0, 0],
      [plan.probeKey, 1, 0, 0, 0], [plan.probeKey, 3, 1000, -1, 4000], [plan.probeKey, 3, 1000, 2, 5000]]) await expectState(insert, args, "23514");
    await expectState(insert, [plan.probeKey, 3, 1000, null, 1000], "23502");
    const valid = [plan.probeKey, 3, 1000, 2, 1000];
    await expectState(insert, valid, "23505", () => probe.query(insert, valid));
    await expectState(`INSERT INTO product."AuthRateBucket" ("keyDigest","capacity","refillIntervalMs","tokens","refilledAt","expiresAt","lastAllowed")
      VALUES ($1,3,1000,2,'infinity'::timestamptz,'infinity'::timestamptz,true)`, [plan.probeKey], "23514");
    const rollback = new Error("intentional read-only rollback");
    await assert.rejects(clients[0].$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const result = await limiter(tx, plan.cases.account.policy).consume("login", peer, plan.cases.account.emails[0]);
      assert.deepEqual(result, {allowed: false, reason: "unavailable", retryAfterSeconds: null});
      throw rollback;
    }), error => error === rollback);
    console.log("PASS actual 42501 permissions, 23514 CHECKs, 23502 required fields, 23505 uniqueness and read-only storage failure closed; probes rolled back.");
    const rows = (await probe.query('SELECT "keyDigest" FROM product."AuthRateBucket" WHERE "keyDigest"=ANY($1::text[])', [plan.keys])).rows;
    assert.ok(rows.length > 0 && rows.every(r => /^rl:v1:[0-9a-f]{64}$/u.test(r.keyDigest)));
    assert.ok(alive); console.log("PASS digest-only synthetic rows; no identities, credentials, sessions, SMTP or Terms fixtures changed.");
    console.log("STOP FOR SEPARATE OWNER CLEANUP: committed synthetic rate buckets remain; preserve run_id and private manifest.");
  } finally {
    globalThis.fetch = originalFetch;
    const closed = await Promise.allSettled([closeRateProofClients(clients), Promise.resolve().then(() => probe.end()), (async () => {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    })()]);
    key.fill(0); if (closed.some(r => r.status === "rejected")) throw new Error("Rate proof cleanup failed.");
    console.log("All proof database connections and loopback sockets closed.");
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const authorized = authorizeRateProof(process.argv.slice(2), process.env);
    if (authorized.action === "proof") await run(authorized.target); else await cleanup(authorized.target, authorized.runId);
  } catch {console.error("STOP: rate proof/cleanup unconfirmed. Preserve output and private manifest; no automatic rerun, reset or broad cleanup."); process.exitCode = 1;}
}
