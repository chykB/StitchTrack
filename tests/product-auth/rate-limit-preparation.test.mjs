// OFFLINE ONLY: no integration command, PostgreSQL operation or real socket is run.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {Socket} from "node:net";
import "../../scripts/register-server-only.mjs";
const {createAuthRateLimiter, rateTransportFromSocket} = await import("../../lib/product-auth/rate-limit.server.ts");
import {PRODUCT_MIGRATIONS, assertProductMigrationFiles} from "../../prisma/product/migration-files.ts";
import {authorizeRateProof, rateProofPlan, closeRateProofClients} from "./rate-limit.integration.mjs";
const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const runId = "1bc5ec4d-006e-481c-8fa5-dbf96632d399", key = Buffer.alloc(32, 7);
const env = {NODE_ENV: "test", PRODUCT_DATABASE_MODE: "test", PRODUCT_DATABASE_CONFIRMED: "true",
  PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED: "true",
  PRODUCT_TEST_DATABASE_URL: "postgresql://stitchtrack_product_test_app:synthetic-only@127.0.0.1:5432/stitchtrack_product_test?schema=product"};

test("owner proof is default-inert; exact CLI, test targets and exclusive confirmations are mandatory", () => {
  assert.equal(authorizeRateProof(["--owner-integration"], env).action, "proof");
  for (const patch of [{NODE_ENV: "production"}, {NODE_ENV: "development"}, {PRODUCT_DATABASE_MODE: "development"},
    {PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED: undefined}, {PRODUCT_RATE_LIMIT_CLEANUP_CONFIRMED: "true"},
    {PGOPTIONS: "override"}, {PGSERVICE: "override"}, {DEBUG: "*"}, {NODE_DEBUG: "net"}, {NODE_OPTIONS: "--inspect"}, {PRODUCT_EMAIL_WORKER_ENABLED: "true"}, {ENABLE_PRODUCT_SESSION_HTTP: "true"},
    {PRODUCT_TEST_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL.replace("/stitchtrack_product_test?", "/stitchtrack_assessment?")},
    {PRODUCT_TEST_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL.replace("_test_app:", "_test_migrator:")}]) {
    assert.throws(() => authorizeRateProof(["--owner-integration"], {...env, ...patch}));
  }
  for (const args of [[], ["--owner-integration", runId], ["--owner-cleanup", runId], ["--owner-integration", "--reset"]]) assert.throws(() => authorizeRateProof(args, env));
  const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", new URL("./rate-limit.integration.mjs", import.meta.url).pathname], {encoding: "utf8", env: {PATH: process.env.PATH, NODE_ENV: "test"}});
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /STOP: rate proof/);
  assert.doesNotMatch(result.stderr, /postgresql:|synthetic-only|run_id=/u);
});
test("cleanup is separate, exact-UUID, migrator-only and refuses runtime/development/assessment fallbacks", () => {
  const cleanupEnv = {...env, PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED: undefined, PRODUCT_RATE_LIMIT_CLEANUP_CONFIRMED: "true", PRODUCT_MIGRATION_CONFIRMED: "true",
    PRODUCT_TEST_MIGRATION_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL.replace("_test_app:", "_test_migrator:")};
  const approved = authorizeRateProof(["--owner-cleanup", runId], cleanupEnv);
  assert.equal(approved.target.user, "stitchtrack_product_test_migrator");
  for (const id of ["../escape", "", "1bc5ec4d-006e-181c-8fa5-dbf96632d399"]) assert.throws(() => authorizeRateProof(["--owner-cleanup", id], cleanupEnv));
  for (const patch of [{PRODUCT_MIGRATION_CONFIRMED: undefined}, {PRODUCT_RATE_LIMIT_INTEGRATION_CONFIRMED: "true"},
    {PRODUCT_TEST_MIGRATION_DATABASE_URL: undefined}, {PRODUCT_TEST_MIGRATION_DATABASE_URL: env.PRODUCT_TEST_DATABASE_URL}, {PRODUCT_DATABASE_MODE: "development"}]) {
    assert.throws(() => authorizeRateProof(["--owner-cleanup", runId], {...cleanupEnv, ...patch}));
  }
});
test("fresh run/key separates all 28 bounded planned keys; cleanup accepts no arbitrary key list", () => {
  const plan = rateProofPlan(runId, key);
  assert.equal(plan.keys.length, 28); assert.equal(new Set(plan.keys).size, 28);
  assert.ok(plan.keys.every(k => /^rl:v1:[0-9a-f]{64}$/u.test(k)));
  const other = rateProofPlan("2bc5ec4d-006e-481c-8fa5-dbf96632d399", key);
  const rotated = rateProofPlan(runId, Buffer.alloc(32, 8));
  assert.ok(other.keys.every(k => !plan.keys.includes(k))); assert.ok(rotated.keys.every(k => !plan.keys.includes(k)));
  for (const c of Object.values(plan.cases)) assert.ok(c.policy.version.length <= 48);
  assert.equal(plan.cases.account.policy.account.capacity, 3); assert.equal(plan.cases.ip.policy.ip.capacity, 3);
  assert.throws(() => rateProofPlan(runId, Buffer.alloc(31)));
});
test("cleanup plan derives exactly the keys emitted by the real limiter contract (offline)", async () => {
  const plan = rateProofPlan(runId, key), socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", {value: "127.0.0.1"});
  const peer = rateTransportFromSocket(socket); socket.destroy();
  const captured = [], client = {$queryRaw: async (strings, ...values) => {
    if (strings.join("").includes("current_database()")) return [{database: "stitchtrack_product_test", role: "stitchtrack_product_test_app", namespace: "product", safe: true}];
    captured.push(values[0]); return [{allowed: true, retryAfterSeconds: 1}];
  }};
  for (const c of Object.values(plan.cases)) {
    const service = createAuthRateLimiter(client, {mode: "test", identifierKey: key, policies: {login: c.policy}});
    for (const value of c.emails) assert.equal((await service.consume("login", peer, value)).allowed, true);
  }
  assert.ok(captured.every(k => plan.keys.includes(k))); assert.equal(new Set(captured).size, 27);
});
test("every constructed Prisma client is disconnected on failures, without exposing native errors", async () => {
  const called = [];
  await assert.rejects(closeRateProofClients([{ $disconnect: () => {called.push(1); throw new Error("private-key-detail");}}, {$disconnect: async () => {called.push(2);}}]), error => error.message === "Rate proof connection cleanup failed.");
  assert.deepEqual(called.sort(), [1, 2]);
});
test("manifest pins only exact SQL filenames/checksums; additions, replacements and symlinks fail closed", () => {
  assertProductMigrationFiles();
  const withCopy = mutate => {
    const dir = mkdtempSync(join(tmpdir(), "stitchtrack-rate-manifest-test-"));
    try {
      for (const [name, checksum] of Object.entries(PRODUCT_MIGRATIONS)) {
        mkdirSync(join(dir, name)); const bytes = readFileSync(new URL(`../../prisma/product/migrations/${name}/migration.sql`, import.meta.url));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum); writeFileSync(join(dir, name, "migration.sql"), bytes);
      }
      writeFileSync(join(dir, ".gitkeep"), ""); writeFileSync(join(dir, "migration_lock.toml"), 'provider = "postgresql"\n');
      const url = pathToFileURL(dir + "/"); assertProductMigrationFiles(url); mutate(dir);
      assert.throws(() => assertProductMigrationFiles(url), /exact reviewed/);
    } finally {assert.ok(dir.startsWith(join(tmpdir(), "stitchtrack-rate-manifest-test-"))); rmSync(dir, {recursive: true});}
  };
  withCopy(dir => mkdirSync(join(dir, "unapproved")));
  withCopy(dir => writeFileSync(join(dir, "20261030_auth_rate_bucket", "migration.sql"), "changed"));
  withCopy(dir => writeFileSync(join(dir, "20261029_product_auth_initial", "extra.sql"), "extra"));
  withCopy(dir => {const file = join(dir, "20261030_auth_rate_bucket", "migration.sql"); unlinkSync(file); symlinkSync(new URL("../../prisma/product/migrations/20261030_auth_rate_bucket/migration.sql", import.meta.url), file);});
  withCopy(dir => writeFileSync(join(dir, "migration_lock.toml"), 'provider = "sqlite"'));
  assert.deepEqual(readdirSync(new URL("../../prisma/product/migrations/", import.meta.url)).sort(), [...Object.keys(PRODUCT_MIGRATIONS), ".gitkeep", "migration_lock.toml"].sort());
});
test("history guards reject extras; only own clean Prisma in-flight row is admitted during deploy", () => {
  const migration = read("../../prisma/product/migrations/20261030_auth_rate_bucket/migration.sql");
  assert.match(migration, /count\(\*\) FROM product\._prisma_migrations\) <> 2/u);
  assert.match(migration, /logs IS NULL AND applied_steps_count=0/u);
  assert.match(migration, /started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL/u);
  assert.match(migration, /AND applied_steps_count=1/u);
  const preflight = read("../../prisma/product/setup/rate-limit-test-preflight.sql");
  assert.match(preflight, /BEGIN READ ONLY;/u); assert.match(preflight, /WHEN 'before' THEN 1 ELSE 2/u);
  assert.match(preflight, /finished_at IS NULL OR rolled_back_at IS NOT NULL OR logs IS NOT NULL/u);
  for (const name of ["prisma/product/setup/rate-limit-test-permissions.sql", "prisma/product/setup/rate-limit-dev-permissions.sql", "prisma/product/setup/rate-limit-test-preflight.sql"]) {
    assert.ok(read("../../" + name).includes(PRODUCT_MIGRATIONS["20261030_auth_rate_bucket"]), name);
  }
});
test("prepared real proof uses isolated Prisma connections and constrained writes; cleanup is exact-key and inactive-run guarded", () => {
  const source = read("./rate-limit.integration.mjs");
  for (const contract of ["new PrismaClient", "max: 1", "i < 4", "length: 20", "Promise.all(jobs)", "120_000", "createConnection", "rateTransportFromSocket(incoming)",
    "savePrivateManifest(runId, key)", 'mode: 0o700', '"wx", 0o600', "fsyncSync", "sourceDigest()", "pg_try_advisory_lock", "pg_try_advisory_xact_lock", "pg_stat_activity", 'ANY($1::text[])', "SET TRANSACTION READ ONLY", '"42501"', '"23514"']) assert.ok(source.includes(contract), contract);
  assert.match(source, /DELETE FROM product\."AuthRateBucket" WHERE "keyDigest"=ANY/u);
  assert.doesNotMatch(source, /TRUNCATE|DROP TABLE|smtp|\.env\.local|console\.(?:log|error)\([^\n]*(?:target\.url|plan\.keys|key\.toString|JSON\.stringify)/u);
  assert.ok(source.indexOf("savePrivateManifest(runId, key); //") < source.indexOf("await probe.connect()"));
  assert.match(source, /globalThis.fetch = originalFetch/u);
});
