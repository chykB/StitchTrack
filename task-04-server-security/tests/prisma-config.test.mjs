import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { taskFourDatabaseUrl, taskFourShadowDatabaseUrl, taskFourDatasource, taskFourCommand, assertTaskFourInitialDeploy, assertTaskFourRequiredNameFailure, assertTaskFourDeploy, TaskFourConfigurationError } from "../prisma/config.ts";

// Synthetic in-memory URL only. Tests never create a client/socket or read .env.
function fixture() {
  const url = new URL("postgresql://127.0.0.1:5432/stitchtrack_assessment");
  url.username = "stitchtrack_task04_test_app";
  url.password = "synthetic-only";
  url.searchParams.set("schema", "task04_test");
  return { TASK04_DATABASE_URL: url.href, TASK04_EXPECTED_HOST: "127.0.0.1",
    TASK04_EXPECTED_PORT: "5432", TASK04_DATABASE_CONFIRMED: "true" };
}
function changeUrl(edit) {
  const env = fixture();
  const url = new URL(env.TASK04_DATABASE_URL);
  edit(url);
  return { ...env, TASK04_DATABASE_URL: url.href };
}
function rejects(env) {
  assert.throws(() => taskFourDatabaseUrl(env), TaskFourConfigurationError);
}

test("accepts only the dedicated confirmed local target", () => {
  const env = Object.freeze(fixture());
  assert.equal(taskFourDatabaseUrl(env), env.TASK04_DATABASE_URL);
  for (const host of ["localhost", "[::1]"]) {
    const alt = changeUrl(url => { url.hostname = host; });
    alt.TASK04_EXPECTED_HOST = host;
    assert.equal(new URL(taskFourDatabaseUrl(alt)).hostname, host);
  }
  for (const mode of ["disable", "require", "verify-full"]) {
    assert.equal(new URL(taskFourDatabaseUrl(changeUrl(url => url.searchParams.set("sslmode", mode)))).searchParams.get("sslmode"), mode);
  }
});

test("missing variables, production, malformed URLs and absent confirmation fail closed", () => {
  rejects({});
  for (const key of Object.keys(fixture())) {
    const env = fixture();
    delete env[key];
    rejects(env);
  }
  for (const value of ["", "TRUE", "false", " true "]) rejects({ ...fixture(), TASK04_DATABASE_CONFIRMED: value });
  rejects({ ...fixture(), NODE_ENV: "production" });
  for (const value of ["not-a-url", "", " " + fixture().TASK04_DATABASE_URL, fixture().TASK04_DATABASE_URL + " "]) {
    rejects({ ...fixture(), TASK04_DATABASE_URL: value });
  }
  for (const port of ["0", "65536", "05432", "5432.0", "-1", " 5432"]) rejects({ ...fixture(), TASK04_EXPECTED_PORT: port });
});

test("database, role, schema, host, protocol, port and password cannot silently change", () => {
  for (const edit of [url => { url.pathname = "/other"; }, url => { url.pathname += "/extra"; },
    url => { url.username = "postgres"; }, url => { url.hostname = "example.com"; },
    url => { url.port = "5433"; }, url => { url.password = ""; }, url => { url.hash = "override"; },
    url => { url.searchParams.set("schema", "public"); }, url => { url.searchParams.delete("schema"); }]) rejects(changeUrl(edit));
  rejects({ ...fixture(), TASK04_DATABASE_URL: fixture().TASK04_DATABASE_URL.replace("postgresql:", "http:") });
  rejects({ ...changeUrl(url => { url.hostname = "example.com"; }), TASK04_EXPECTED_HOST: "example.com" });
});

test("duplicate parameters and alternate connection overrides are rejected", () => {
  for (const edit of [url => url.searchParams.append("schema", "task04_test"),
    url => url.searchParams.append("schema", "public"),
    url => { url.searchParams.append("sslmode", "disable"); url.searchParams.append("sslmode", "require"); },
    url => url.searchParams.set("sslmode", "prefer"),
    ...["host", "port", "user", "dbname", "options", "search_path", "service", "sslcert", "schema[]"].map(key => url => url.searchParams.set(key, "override"))]) rejects(changeUrl(edit));
});

test("main configuration cannot fall back to root or shadow environment variables", () => {
  rejects({ DATABASE_URL: fixture().TASK04_DATABASE_URL, EXPERIMENT_DATABASE_URL: fixture().TASK04_DATABASE_URL });
  const env = { ...fixture(), DATABASE_URL: "ignored", SHADOW_DATABASE_URL: "ignored", TASK04_SHADOW_DATABASE_URL: "ignored" };
  assert.equal(taskFourDatabaseUrl(env), fixture().TASK04_DATABASE_URL);
});

test("configuration errors do not disclose URL, password or parser cause", () => {
  const env = changeUrl(url => { url.username = "not-approved"; url.password = "never-print-this"; });
  try { taskFourDatabaseUrl(env); assert.fail("Expected rejection"); } catch (error) {
    assert.ok(error instanceof TaskFourConfigurationError);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error.stack), /never-print-this|not-approved|postgresql:/);
  }
});

test("validate/status remain available; deploy requires the exact isolated config", () => {
  for (const suffix of [[], ["--config", "task-04-server-security/prisma/prisma.config.ts"], ["--config=task-04-server-security/prisma/prisma.config.ts"]]) {
    assert.equal(taskFourCommand(["validate", ...suffix]), "validate");
    assert.equal(taskFourCommand(["migrate", "status", ...suffix]), "status");
  }
  assert.equal(taskFourCommand(["--config", "local-config.ts", "validate"]), "validate");
  for (const args of [[], ["generate"], ["db", "push"], ["db", "execute"], ["db", "pull"],
    ...["dev", "reset", "resolve", "diff"].map(cmd => ["migrate", cmd]),
    ["validate", "--schema", "prisma/schema.prisma"], ["migrate", "status", "--url=other"],
    ["validate", "--config"], ["validate", "--config="],
    ["validate", "--config", "--schema"], ["validate", "--config=a", "--config=b"]]) {
    assert.throws(() => taskFourCommand(args), /Task Four permits only/);
  }
});

function shadowFixture() {
  const url = new URL("postgresql://127.0.0.1:5432/stitchtrack_task04_shadow");
  url.username = "stitchtrack_task04_shadow_app";
  url.password = "synthetic-shadow-only";
  url.searchParams.set("schema", "task04_test");
  return { ...fixture(), TASK04_SHADOW_DATABASE_URL: url.href };
}
function changeShadow(edit) {
  const env = shadowFixture();
  const url = new URL(env.TASK04_SHADOW_DATABASE_URL);
  edit(url);
  return { ...env, TASK04_SHADOW_DATABASE_URL: url.href };
}
function rejectsShadow(env) {
  assert.throws(() => taskFourShadowDatabaseUrl(env), TaskFourConfigurationError);
}

test("Prisma datasource maps the two independently validated URLs without connecting", () => {
  const env = Object.freeze(shadowFixture());
  const datasource = taskFourDatasource(env);
  assert.deepEqual(datasource, { url: env.TASK04_DATABASE_URL, shadowDatabaseUrl: env.TASK04_SHADOW_DATABASE_URL });
  assert.equal(new URL(datasource.shadowDatabaseUrl).searchParams.get("schema"), "task04_test");
  assert.notEqual(new URL(datasource.url).pathname, new URL(datasource.shadowDatabaseUrl).pathname);
  assert.throws(() => taskFourDatasource(fixture()), TaskFourConfigurationError);
  assert.throws(() => taskFourDatasource({ ...env, TASK04_DATABASE_URL: "mismatched-main" }), TaskFourConfigurationError);
});

test("shadow URL requires the exact dedicated database, role, IPv4 host and port", () => {
  assert.equal(taskFourShadowDatabaseUrl(shadowFixture()), shadowFixture().TASK04_SHADOW_DATABASE_URL);
  for (const edit of [
    ...["stitchtrack_assessment", "stitchtrack", "stitchtrack_test", "shared_shadow", "stitchtrack_task04_shadow/extra"].map(db => url => { url.pathname = "/" + db; }),
    ...["postgres", "stitchtrack_task04_test_app", "other_shadow_app"].map(role => url => { url.username = role; }),
    ...["localhost", "[::1]", "127.0.0.2", "example.com"].map(host => url => { url.hostname = host; }),
    url => { url.port = "5433"; }, url => { url.port = ""; },
    url => { url.password = ""; }, url => { url.hash = "override"; },
  ]) rejectsShadow(changeShadow(edit));
  rejectsShadow({ ...shadowFixture(), TASK04_SHADOW_DATABASE_URL: fixture().TASK04_DATABASE_URL });
  rejectsShadow({ ...shadowFixture(), TASK04_SHADOW_DATABASE_URL: shadowFixture().TASK04_SHADOW_DATABASE_URL.replace("postgresql:", "http:") });
});

test("shadow schema must match the multi-schema model with no query overrides", () => {
  for (const edit of [url => url.searchParams.delete("schema"),
    ...["public", "other", "task04_test,public"].map(value => url => url.searchParams.set("schema", value)),
    url => url.searchParams.append("schema", "task04_test"),
    url => url.searchParams.append("schema", "public"),
    url => { url.searchParams.append("sslmode", "disable"); url.searchParams.append("sslmode", "require"); },
    url => url.searchParams.set("sslmode", "prefer"),
    ...["host", "port", "user", "dbname", "options", "search_path", "service", "sslcert", "schema[]"].map(key => url => url.searchParams.set(key, "override"))]) rejectsShadow(changeShadow(edit));
  for (const mode of ["disable", "require", "verify-full"]) {
    assert.equal(new URL(taskFourShadowDatabaseUrl(changeShadow(url => url.searchParams.set("sslmode", mode)))).searchParams.get("sslmode"), mode);
  }
});

test("shadow configuration fails closed on missing input, production and fallbacks", () => {
  rejectsShadow({});
  rejectsShadow(fixture());
  rejectsShadow({ ...shadowFixture(), NODE_ENV: "production" });
  rejectsShadow({ ...shadowFixture(), TASK04_DATABASE_CONFIRMED: "false" });
  for (const raw of ["", "not-a-url", " " + shadowFixture().TASK04_SHADOW_DATABASE_URL, shadowFixture().TASK04_SHADOW_DATABASE_URL + " "]) {
    rejectsShadow({ ...shadowFixture(), TASK04_SHADOW_DATABASE_URL: raw });
  }
  rejectsShadow({ ...fixture(), SHADOW_DATABASE_URL: shadowFixture().TASK04_SHADOW_DATABASE_URL });
  const env = { ...shadowFixture(), SHADOW_DATABASE_URL: "ignored", DATABASE_URL: "ignored" };
  assert.equal(taskFourShadowDatabaseUrl(env), shadowFixture().TASK04_SHADOW_DATABASE_URL);
});

test("shadow password encoding is preserved and rejected input never appears in errors", () => {
  const env = changeShadow(url => { url.password = encodeURIComponent("synthetic:@/?#% space"); });
  for (const invalid of ["%", "%ZZ", "%E0%A4"]) {
    rejectsShadow(changeShadow(url => { url.password = invalid; }));
  }
  const checked = new URL(taskFourShadowDatabaseUrl(env));
  assert.equal(decodeURIComponent(checked.password), "synthetic:@/?#% space");
  for (const raw of ["not-a-url-never-print-shadow", env.TASK04_SHADOW_DATABASE_URL.replace("task04_test", "wrong-schema")]) {
    try { taskFourShadowDatabaseUrl({ ...env, TASK04_SHADOW_DATABASE_URL: raw }); assert.fail("Expected rejection"); } catch (error) {
      assert.ok(error instanceof TaskFourConfigurationError);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(String(error.stack), /never-print-shadow|synthetic|wrong-schema|postgresql:/);
    }
  }
});

test("configured shadow target does not authorize reset, generation or other migrations", () => {
  const env = shadowFixture();
  assert.ok(taskFourDatasource(env).shadowDatabaseUrl);
  for (const command of ["dev", "reset", "resolve", "diff"]) {
    assert.throws(() => taskFourCommand(["migrate", command, "--config", "task-04-server-security/prisma/prisma.config.ts"]), /Task Four permits only/);
  }
});

// Importing defineConfig constructs an object only; this never invokes Prisma CLI.
// Child environments are entirely synthetic, with no inherited database secrets.
function checkConfigImport(args, env, assertions) {
  const configUrl = new URL("../prisma/prisma.config.ts", import.meta.url).href;
  const source = `import assert from "node:assert/strict";
    process.argv = [process.execPath, "synthetic-prisma", ...${JSON.stringify(args)}];
    const { default: config } = await import(${JSON.stringify(configUrl)});
    ${assertions}`;
  const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "--eval", source], {
    env, encoding: "utf8", timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

test("actual Prisma config keeps offline validation independent of both secret URLs", () => {
  checkConfigImport(["validate"], {
    NODE_ENV: "production",
    TASK04_DATABASE_URL: "invalid-synthetic-main",
    TASK04_SHADOW_DATABASE_URL: "invalid-synthetic-shadow",
  }, `assert.equal(config.datasource, undefined);`);
});

test("actual Prisma config wires shadowDatabaseUrl without invoking a database command", () => {
  checkConfigImport(["migrate", "status"], shadowFixture(), `
    assert.equal(new URL(config.datasource.url).pathname, "/stitchtrack_assessment");
    assert.equal(new URL(config.datasource.shadowDatabaseUrl).pathname, "/stitchtrack_task04_shadow");
    assert.equal(new URL(config.datasource.shadowDatabaseUrl).searchParams.get("schema"), "task04_test");
  `);
});

const deployArgs = ["migrate", "deploy", "--config", "task-04-server-security/prisma/prisma.config.ts"];
const approvedReview = {
  entries: [".gitkeep", "migration_lock.toml", "20261028_task04_initial"],
  migrationEntries: ["migration.sql"],
  sqlSha256: "1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501",
  provider: 'provider = "postgresql"',
};

test("deploy permits only the isolated config and no additional execution flags", () => {
  assert.equal(taskFourCommand(deployArgs), "deploy");
  assert.equal(taskFourCommand(["--config=task-04-server-security/prisma/prisma.config.ts", "migrate", "deploy"]), "deploy");
  for (const args of [["migrate", "deploy"], ["migrate", "deploy", "--config", "prisma.config.ts"],
    ...["--force", "--schema=prisma/schema.prisma", "--url=other", "--help"].map(flag => [...deployArgs, flag])]) {
    assert.throws(() => taskFourCommand(args), /Task Four permits only/);
  }
});

test("initial deployment requires explicit confirmation and exact reviewed files", () => {
  const confirmed = { ...shadowFixture(), TASK04_INITIAL_DEPLOY_CONFIRMED: "true" };
  assert.throws(() => assertTaskFourInitialDeploy(confirmed)); // New candidate intentionally closes the old initial-only gate.
  assert.doesNotThrow(() => assertTaskFourInitialDeploy(confirmed, approvedReview));
  for (const value of [undefined, "false", "TRUE", " true "]) {
    assert.throws(() => assertTaskFourInitialDeploy({ ...confirmed, TASK04_INITIAL_DEPLOY_CONFIRMED: value }, approvedReview), /explicit owner confirmation/);
  }
  assert.throws(() => assertTaskFourInitialDeploy({ ...confirmed, NODE_ENV: "production" }, approvedReview));
  for (const review of [
    { ...approvedReview, sqlSha256: "0".repeat(64) },
    { ...approvedReview, entries: [...approvedReview.entries, "unreviewed_migration"] },
    { ...approvedReview, entries: [".gitkeep", ".gitkeep", "20261028_task04_initial"] },
    { ...approvedReview, migrationEntries: ["migration.sql", "extra.sql"] },
    { ...approvedReview, provider: 'provider = "sqlite"' },
  ]) assert.throws(() => assertTaskFourInitialDeploy(confirmed, review), /only the reviewed initial migration/);
});

test("actual failure-phase config constructs only the guarded main datasource without executing Prisma", () => {
  checkConfigImport(deployArgs, { ...shadowFixture(), TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED: "true" }, `
    assert.equal(new URL(config.datasource.url).pathname, "/stitchtrack_assessment");
    assert.equal(new URL(config.datasource.url).username, "stitchtrack_task04_test_app");
    assert.equal(new URL(config.datasource.url).searchParams.get("schema"), "task04_test");
  `);
});

test("deploy confirmation never bypasses main/role/schema or credential guards", () => {
  const confirmed = { ...shadowFixture(), TASK04_INITIAL_DEPLOY_CONFIRMED: "true" };
  for (const env of [
    { ...confirmed, TASK04_DATABASE_URL: confirmed.TASK04_SHADOW_DATABASE_URL },
    { ...confirmed, TASK04_DATABASE_CONFIRMED: "false" },
    { ...confirmed, TASK04_DATABASE_URL: undefined },
    { ...confirmed, TASK04_SHADOW_DATABASE_URL: undefined },
  ]) assert.throws(() => taskFourDatasource(env), TaskFourConfigurationError);
});

const requiredNameReview = {
  ...approvedReview,
  entries: [...approvedReview.entries, "20261028_task04_user_name"],
  failureEntries: ["migration.sql"],
  failureSha256: "482f61d709079ac088dda61c1d901d17a4d6f42dd3cd81c690211ad03f105e33",
  seedSha256: "83c98b132026fa160c581a74b744055aaeab76bd807176e551473d62144820c9",
};

test("required-column phase admits only its exact reviewed artifacts and confirmation", () => {
  const env = { ...shadowFixture(), TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED: "true" };
  assert.doesNotThrow(() => assertTaskFourRequiredNameFailure(env)); // Files only; no Prisma CLI/DB.
  assert.doesNotThrow(() => assertTaskFourRequiredNameFailure(env, requiredNameReview));
  assert.doesNotThrow(() => assertTaskFourDeploy(env));
  for (const value of [undefined, "false", "TRUE", " true "]) {
    assert.throws(() => assertTaskFourRequiredNameFailure({ ...env, TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED: value }, requiredNameReview));
  }
  assert.throws(() => assertTaskFourDeploy({ ...env, TASK04_INITIAL_DEPLOY_CONFIRMED: "true" }), /exactly one/);
  assert.throws(() => assertTaskFourDeploy({}), /exactly one/);
  assert.throws(() => assertTaskFourRequiredNameFailure({ ...env, NODE_ENV: "production" }, requiredNameReview));
  for (const review of [
    { ...requiredNameReview, entries: [...requiredNameReview.entries, "unreviewed_next"] },
    { ...requiredNameReview, sqlSha256: "0".repeat(64) },
    { ...requiredNameReview, failureSha256: "0".repeat(64) },
    { ...requiredNameReview, seedSha256: "0".repeat(64) },
    { ...requiredNameReview, failureEntries: ["migration.sql", "other.sql"] },
    { ...requiredNameReview, provider: 'provider = "sqlite"' },
  ]) assert.throws(() => assertTaskFourRequiredNameFailure(env, review));
});

test("failure phase does not enable resolution, reset, direct SQL, generation or URL overrides", () => {
  for (const args of [
    ["migrate", "resolve", "--applied", "20261028_task04_user_name", "--config", "task-04-server-security/prisma/prisma.config.ts"],
    ["migrate", "resolve", "--rolled-back", "20261028_task04_user_name"],
    ["migrate", "reset"], ["migrate", "dev"], ["migrate", "diff"],
    ["db", "push"], ["db", "execute"], ["generate"], [...deployArgs, "--url=other"],
  ]) assert.throws(() => taskFourCommand(args), /Task Four permits only/);
});
