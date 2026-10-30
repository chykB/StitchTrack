import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { taskFourDatabaseUrl, TASK_FOUR_INITIAL_SQL_SHA256, TASK_FOUR_REQUIRED_NAME_SHA256,
  type TaskFourEnvironment } from "../../prisma/config.ts";

export const canonicalHash = "26dea8f74fc95dde98b9e8a172c4ce507f823e48f64ed09e3566e245a5fbdba9";
export const configPath = "task-04-server-security/experiments/runtime-drift/prisma.config.ts";
export const workUrl = new URL("./work/", import.meta.url);
export const canonicalUrl = new URL("../../prisma/schema.prisma", import.meta.url);
export const probeField = "task04DriftProbe";
export const probeLine = "  task04DriftProbe String? @db.Text\n";
const generator = `generator driftClient {
  provider = "prisma-client"
  output = "./client"
  moduleFormat = "esm"
  runtime = "nodejs"
  generatedFileExtension = "ts"
  importFileExtension = "ts"
}

`;
export function digest(source: string | Uint8Array): string {
  return createHash("sha256").update(source).digest("hex");
}
export function requireDriftOwner(env: TaskFourEnvironment = process.env): void {
  if (env.NODE_ENV === "production" || env.TASK04_RUNTIME_DRIFT_CONFIRMED !== "true" ||
      ["TASK04_INITIAL_DEPLOY_CONFIRMED", "TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED",
       "TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED", "TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED"]
        .some(key => env[key] === "true")) throw new Error("Exclusive local owner drift confirmation required.");
}
export function workingSchemas(canonical: string): { correct: string; drifted: string } {
  if (digest(canonical) !== canonicalHash) throw new Error("Canonical Task Four model differs from reviewed source.");
  const correct = generator + canonical;
  const drifted = correct.replace("model User {\n", "model User {\n" + probeLine);
  if (drifted === correct) throw new Error("Expected User model anchor missing.");
  return { correct, drifted };
}
export function assertGenerate(args: readonly string[], env: TaskFourEnvironment,
  canonical: string, working: string): void {
  requireDriftOwner(env);
  if (args.length !== 3 || args[0] !== "generate" || args[1] !== "--config" || args[2] !== configPath) {
    throw new Error("Drift config permits only its exact isolated generate command.");
  }
  const schemas = workingSchemas(canonical);
  if (working !== schemas.correct && working !== schemas.drifted) throw new Error("Unreviewed working schema/output.");
}
export function assertMigrationFiles(): void {
  for (const [name, hash] of [["20261028_task04_initial", TASK_FOUR_INITIAL_SQL_SHA256],
    ["20261028_task04_user_name", TASK_FOUR_REQUIRED_NAME_SHA256]]) {
    if (digest(readFileSync(new URL("../../prisma/migrations/" + name + "/migration.sql", import.meta.url))) !== hash) {
      throw new Error("Executed migration checksum differs; stop.");
    }
  }
}
export function connectionOptions(env: TaskFourEnvironment = process.env) {
  requireDriftOwner(env);
  const url = new URL(taskFourDatabaseUrl(env));
  const sslmode = url.searchParams.get("sslmode");
  return {
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    port: Number(url.port), database: "stitchtrack_assessment", user: "stitchtrack_task04_test_app",
    password: () => decodeURIComponent(url.password),
    ssl: sslmode === "require" ? { rejectUnauthorized: false } : sslmode === "verify-full" ? { rejectUnauthorized: true } : false,
    // Explicit settings override ambient libpq defaults; all sessions are read-only.
    options: "-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=10000 -c lock_timeout=3000",
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
  };
}
