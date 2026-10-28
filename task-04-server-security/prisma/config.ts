import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TaskFourEnvironment = Readonly<Record<string, string | undefined>>;

export const TASK_FOUR_TARGET = Object.freeze({
  database: "stitchtrack_assessment",
  user: "stitchtrack_task04_test_app",
  schema: "task04_test",
});

export const TASK_FOUR_SHADOW_TARGET = Object.freeze({
  database: "stitchtrack_task04_shadow",
  user: "stitchtrack_task04_shadow_app",
  host: "127.0.0.1",
  port: "5432",
  // Same namespace as the models, inside a DIFFERENT disposable database.
  schema: TASK_FOUR_TARGET.schema,
});

export class TaskFourConfigurationError extends Error {
  constructor() {
    super("Explicit local Task Four database/shadow configuration matching the approved targets is required.");
    this.name = "TaskFourConfigurationError";
  }
}

// No dotenv import, root configuration import or fallback to another URL.
// These checks validate configuration only; they do not prove live privileges.
export function taskFourDatabaseUrl(env: TaskFourEnvironment = process.env): string {
  try {
    const raw = env.TASK04_DATABASE_URL;
    const host = env.TASK04_EXPECTED_HOST;
    const port = env.TASK04_EXPECTED_PORT;
    if (env.NODE_ENV === "production" || env.TASK04_DATABASE_CONFIRMED !== "true" ||
        !raw || raw !== raw.trim() || !host || !port ||
        !["localhost", "127.0.0.1", "[::1]"].includes(host) ||
        !/^[1-9]\d*$/.test(port) || Number(port) > 65535) {
      throw new TaskFourConfigurationError();
    }
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash ||
        url.hostname !== host || url.port !== port || !url.password ||
        decodeURIComponent(url.pathname) !== "/" + TASK_FOUR_TARGET.database ||
        decodeURIComponent(url.username) !== TASK_FOUR_TARGET.user) {
      throw new TaskFourConfigurationError();
    }
    const params = [...url.searchParams];
    if (url.searchParams.getAll("schema").length !== 1 ||
        url.searchParams.get("schema") !== TASK_FOUR_TARGET.schema ||
        url.searchParams.getAll("sslmode").length > 1 ||
        params.some(([key, value]) => key !== "schema" &&
          (key !== "sslmode" || !["disable", "require", "verify-full"].includes(value)))) {
      throw new TaskFourConfigurationError();
    }
    // Return the same canonical URL whose authority/path/query were checked.
    return url.href;
  } catch {
    // Never attach input, credentials, environment values or a parser cause.
    throw new TaskFourConfigurationError();
  }
}

// Independent literal allow-list: no product/shared database or URL fallback.
export function taskFourShadowDatabaseUrl(env: TaskFourEnvironment = process.env): string {
  try {
    const raw = env.TASK04_SHADOW_DATABASE_URL;
    if (env.NODE_ENV === "production" || env.TASK04_DATABASE_CONFIRMED !== "true" ||
        !raw || raw !== raw.trim()) {
      throw new TaskFourConfigurationError();
    }
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash ||
        url.hostname !== TASK_FOUR_SHADOW_TARGET.host ||
        url.port !== TASK_FOUR_SHADOW_TARGET.port || !url.password ||
        !decodeURIComponent(url.password) ||
        decodeURIComponent(url.pathname) !== "/" + TASK_FOUR_SHADOW_TARGET.database ||
        decodeURIComponent(url.username) !== TASK_FOUR_SHADOW_TARGET.user) {
      throw new TaskFourConfigurationError();
    }
    const params = [...url.searchParams];
    if (url.searchParams.getAll("schema").length !== 1 ||
        url.searchParams.get("schema") !== TASK_FOUR_SHADOW_TARGET.schema ||
        url.searchParams.getAll("sslmode").length > 1 ||
        params.some(([key, value]) => key !== "schema" &&
          (key !== "sslmode" || !["disable", "require", "verify-full"].includes(value)))) {
      throw new TaskFourConfigurationError();
    }
    return url.href;
  } catch {
    throw new TaskFourConfigurationError();
  }
}

// Construct exactly Prisma 7's datasource shape, without clients or connections.
export function taskFourDatasource(env: TaskFourEnvironment = process.env): {
  url: string;
  shadowDatabaseUrl: string;
} {
  return {
    url: taskFourDatabaseUrl(env),
    shadowDatabaseUrl: taskFourShadowDatabaseUrl(env),
  };
}

export const TASK_FOUR_INITIAL_SQL_SHA256 = "1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501";
const initialMigration = "20261028_task04_initial";

type InitialDeployReview = Readonly<{
  entries: readonly string[];
  migrationEntries: readonly string[];
  sqlSha256: string;
  provider: string;
}>;

function readInitialDeployReview(): InitialDeployReview {
  const root = new URL("./migrations/", import.meta.url);
  return {
    entries: readdirSync(root),
    migrationEntries: readdirSync(new URL(initialMigration + "/", root)),
    sqlSha256: createHash("sha256").update(readFileSync(new URL(initialMigration + "/migration.sql", root))).digest("hex"),
    provider: readFileSync(new URL("migration_lock.toml", root), "utf8")
      .split(/\r?\n/u).filter(line => line.trim() && !line.trim().startsWith("#")).join("\n"),
  };
}

// The optional review value supports offline policy tests; the real config never
// overrides it and always hashes the fixed on-disk migration before deployment.
export function assertTaskFourInitialDeploy(
  env: TaskFourEnvironment = process.env,
  review?: InitialDeployReview,
): void {
  try {
    if (env.NODE_ENV === "production" || env.TASK04_INITIAL_DEPLOY_CONFIRMED !== "true") throw new Error();
    const inspected = review ?? readInitialDeployReview();
    const allowed = new Set([".gitkeep", "migration_lock.toml", initialMigration]);
    if (inspected.entries.length !== allowed.size || inspected.entries.some(name => !allowed.has(name)) ||
        new Set(inspected.entries).size !== allowed.size ||
        inspected.migrationEntries.length !== 1 || inspected.migrationEntries[0] !== "migration.sql" ||
        inspected.sqlSha256 !== TASK_FOUR_INITIAL_SQL_SHA256 || inspected.provider !== 'provider = "postgresql"') {
      throw new Error();
    }
  } catch {
    throw new Error("Initial Task Four deployment requires explicit owner confirmation, the rehearsed SQL checksum and only the reviewed initial migration.");
  }
}

export const TASK_FOUR_REQUIRED_NAME_MIGRATION = "20261028_task04_user_name";
export const TASK_FOUR_REQUIRED_NAME_SHA256 = "482f61d709079ac088dda61c1d901d17a4d6f42dd3cd81c690211ad03f105e33";
export const TASK_FOUR_SEED_SHA256 = "83c98b132026fa160c581a74b744055aaeab76bd807176e551473d62144820c9";

type RequiredNameReview = InitialDeployReview & Readonly<{
  failureEntries: readonly string[];
  failureSha256: string;
  seedSha256: string;
}>;

function readRequiredNameReview(): RequiredNameReview {
  const root = new URL("./migrations/", import.meta.url);
  return {
    ...readInitialDeployReview(),
    failureEntries: readdirSync(new URL(TASK_FOUR_REQUIRED_NAME_MIGRATION + "/", root)),
    failureSha256: createHash("sha256").update(readFileSync(new URL(TASK_FOUR_REQUIRED_NAME_MIGRATION + "/migration.sql", root))).digest("hex"),
    seedSha256: createHash("sha256").update(readFileSync(new URL("../experiments/required-column/seed-users.sql", import.meta.url))).digest("hex"),
  };
}

export function assertTaskFourRequiredNameFailure(
  env: TaskFourEnvironment = process.env,
  review?: RequiredNameReview,
): void {
  try {
    if (env.NODE_ENV === "production" || env.TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED !== "true" ||
        env.TASK04_INITIAL_DEPLOY_CONFIRMED === "true") throw new Error();
    const inspected = review ?? readRequiredNameReview();
    const allowed = new Set([".gitkeep", "migration_lock.toml", initialMigration, TASK_FOUR_REQUIRED_NAME_MIGRATION]);
    if (inspected.entries.length !== allowed.size || new Set(inspected.entries).size !== allowed.size ||
        inspected.entries.some(name => !allowed.has(name)) ||
        inspected.migrationEntries.length !== 1 || inspected.migrationEntries[0] !== "migration.sql" ||
        inspected.failureEntries.length !== 1 || inspected.failureEntries[0] !== "migration.sql" ||
        inspected.sqlSha256 !== TASK_FOUR_INITIAL_SQL_SHA256 ||
        inspected.failureSha256 !== TASK_FOUR_REQUIRED_NAME_SHA256 || inspected.seedSha256 !== TASK_FOUR_SEED_SHA256 ||
        inspected.provider !== 'provider = "postgresql"') throw new Error();
  } catch {
    throw new Error("Required-column experiment needs exclusive owner confirmation and only the reviewed initial, failure and synthetic-seed artifacts.");
  }
}

export function assertTaskFourDeploy(env: TaskFourEnvironment = process.env): void {
  const initial = env.TASK04_INITIAL_DEPLOY_CONFIRMED === "true";
  const failure = env.TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED === "true";
  if (initial === failure) throw new Error("Select exactly one owner-approved Task Four deployment phase.");
  if (failure) assertTaskFourRequiredNameFailure(env);
  else assertTaskFourInitialDeploy(env);
}

export type TaskFourCommand = "validate" | "status" | "deploy";

// Only reviewed owner-confirmed deploy phases are admitted; reset/generation stay blocked.
export function taskFourCommand(args: readonly string[]): TaskFourCommand {
  const operands: string[] = [];
  let configSeen = false;
  let selectedConfig: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" || arg.startsWith("--config=")) {
      if (configSeen) throw commandError();
      configSeen = true;
      const path = arg === "--config" ? args[++i] : arg.slice("--config=".length);
      if (!path || path.startsWith("-")) throw commandError();
      selectedConfig = path;
    } else {
      operands.push(arg);
    }
  }
  if (operands.length === 1 && operands[0] === "validate") return "validate";
  if (operands.length === 2 && operands[0] === "migrate" && operands[1] === "status") return "status";
  if (operands.length === 2 && operands[0] === "migrate" && operands[1] === "deploy" &&
      selectedConfig && resolve(selectedConfig) === fileURLToPath(new URL("./prisma.config.ts", import.meta.url))) return "deploy";
  throw commandError();
}

function commandError(): Error {
  return new Error("Task Four permits only validate, migrate status and explicitly configured reviewed migrate deploy; reset, generation and unrelated commands remain blocked.");
}
