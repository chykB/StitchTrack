import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { taskFourCommand, assertTaskFourDeploy } from "../prisma/config.ts";

const base = new URL("../experiments/required-column/recovery/", import.meta.url);
const read = name => readFileSync(new URL(name, base), "utf8");
const code = source => source.replace(/--[^\n]*/gu, "");
const failed = readFileSync(new URL("../prisma/migrations/20261028_task04_user_name/migration.sql", import.meta.url), "utf8");
const check = source => source.match(/CONSTRAINT "User_name_nonblank_check" CHECK \([\s\S]*?\n    \)/u)?.[0];

test("recovery CHECK source exactly matches the preserved failed migration", () => {
  assert.ok(check(failed));
  assert.equal(check(read("03-require-name.sql")), check(failed));
  assert.match(code(read("03-require-name.sql")), /ALTER COLUMN "name" SET NOT NULL/u);
  assert.doesNotMatch(code(read("01-add-nullable.sql")), /ADD COLUMN "name" TEXT NOT NULL/u);
});

test("all three stages include locked preconditions, preservation checks and committed reporting", () => {
  for (const name of ["01-add-nullable.sql", "02-backfill.sql", "03-require-name.sql"]) {
    const sql = read(name);
    assert.match(sql, /BEGIN;[\s\S]*SET LOCAL lock_timeout = '5s';[\s\S]*SET LOCAL statement_timeout = '30s';/u);
    assert.ok(sql.indexOf("\\ir preconditions.sql") < sql.indexOf("$before_step$"));
    assert.equal((sql.match(/\\ir verify-unchanged.sql/gu) ?? []).length, 2);
    assert.equal((sql.match(/\\ir report.sql/gu) ?? []).length, 2);
    assert.match(sql, /COMMIT;[\s\S]*BEGIN READ ONLY;/u);
  }
});

test("recovery SQL cannot silently reseed, resolve history or target other schemas", () => {
  for (const name of ["preconditions.sql", "verify-unchanged.sql", "report.sql", "01-add-nullable.sql", "02-backfill.sql", "03-require-name.sql"]) {
    const sql = code(read(name));
    assert.doesNotMatch(sql, /\b(?:INSERT|DELETE|TRUNCATE|DROP|CREATE SCHEMA)\b/iu);
    assert.doesNotMatch(sql, /(?:UPDATE|ALTER TABLE) "task04_test"\."_prisma_migrations"/u);
    assert.doesNotMatch(sql, /"public"\.|task_two_enquiries/u);
  }
  const pre = read("preconditions.sql");
  assert.match(pre, /current_database\(\)<>'stitchtrack_assessment'/u);
  assert.match(pre, /CURRENT_USER<>'stitchtrack_task04_test_app'/u);
  assert.ok(pre.indexOf('"_prisma_migrations" IN SHARE MODE') < pre.indexOf('"User" IN ACCESS EXCLUSIVE MODE'));
  assert.match(pre, /logs LIKE '%23502%'/u);
  assert.match(read("verify-unchanged.sql"), /:'task04_history_snapshot'::JSONB/u);
  assert.match(read("02-backfill.sql"), /THEN 'Synthetic User 01'/u);
  assert.match(read("02-backfill.sql"), /THEN 'Synthetic User 02'/u);
});

test("source manifest pins both unchanged migrations and all six recovery SQL inputs", () => {
  const entries = read("artifacts.sha256").trim().split("\n");
  assert.equal(entries.length, 8);
  const root = new URL("../../", import.meta.url);
  for (const line of entries) {
    const [hash, relative] = line.split("  ");
    const content = readFileSync(new URL(relative, root));
    assert.equal(createHash("sha256").update(content).digest("hex"), hash, relative);
  }
});

test("manual recovery confirmation cannot authorize Prisma resolution or deployment", () => {
  const env = { TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED: "true" };
  assert.throws(() => assertTaskFourDeploy(env), /exactly one/u);
  for (const mode of ["--applied", "--rolled-back"]) {
    assert.throws(() => taskFourCommand(["migrate", "resolve", mode, "20261028_task04_user_name", "--config", "task-04-server-security/prisma/prisma.config.ts"]), /Task Four permits only/u);
  }
});
