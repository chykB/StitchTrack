// Owner-only reconciliation. Importing this module never launches a subprocess.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertTaskFourRequiredNameResolution, TASK_FOUR_INITIAL_SQL_SHA256,
  TASK_FOUR_REQUIRED_NAME_MIGRATION, TASK_FOUR_REQUIRED_NAME_SHA256 } from "../prisma/config.ts";

export const resolutionArgs = Object.freeze(["migrate", "resolve", "--applied",
  TASK_FOUR_REQUIRED_NAME_MIGRATION, "--config", "task-04-server-security/prisma/prisma.config.ts"]);
export const statusArgs = Object.freeze(["migrate", "status", "--config", "task-04-server-security/prisma/prisma.config.ts"]);
const initialName = "20261028_task04_initial";
const originalInitialId = "bb1d3fb7-90cf-4fc5-b7e3-6fdb00b1f878";
export const originalFailureId = "e91a14f3-686e-4929-8e3f-bcec0baaff30"; // Evidence 05, 528e166.
function requireState(ok) { if (!ok) throw new Error("Unexpected inspection/history state; stop and preserve the supplementary log."); }

export function checkBefore(state) {
  requireState(state.database === "stitchtrack_assessment" && state.role === "stitchtrack_task04_test_app");
  requireState(Array.isArray(state.history) && state.history.length === 2);
  const initial = state.history.find(row => row.id === originalInitialId);
  const failed = state.history.find(row => row.id === originalFailureId);
  requireState(initial?.migration_name === initialName && initial.checksum === TASK_FOUR_INITIAL_SQL_SHA256 &&
    Boolean(initial.finished_at) && initial.rolled_back_at === null);
  requireState(failed?.migration_name === TASK_FOUR_REQUIRED_NAME_MIGRATION && failed.checksum === TASK_FOUR_REQUIRED_NAME_SHA256 &&
    failed.finished_at === null && failed.rolled_back_at === null && typeof failed.logs === "string" &&
    failed.logs.includes("23502") && failed.logs.includes('column "name"'));
}

export function checkAfter(before, after) {
  for (const key of ["database", "role", "columns", "constraints", "indexes", "users"]) {
    requireState(isDeepStrictEqual(before[key], after[key]));
  }
  requireState(Array.isArray(after.history));
  for (const old of before.history) {
    const current = after.history.find(row => row.id === old.id);
    requireState(Boolean(current));
    for (const key of Object.keys(old)) {
      // Only Prisma resolution metadata may change on the original failed row.
      if (old.id === originalFailureId && ["finished_at", "rolled_back_at"].includes(key)) continue;
      requireState(isDeepStrictEqual(current[key], old[key]));
    }
  }
  const applied = after.history.filter(row => row.migration_name === TASK_FOUR_REQUIRED_NAME_MIGRATION &&
    row.checksum === TASK_FOUR_REQUIRED_NAME_SHA256 && row.finished_at && row.rolled_back_at === null);
  requireState(applied.length === 1);
  requireState(after.history.every(row => row.finished_at || row.rolled_back_at));
  const old = after.history.find(row => row.id === originalFailureId);
  const additions = after.history.filter(row => !before.history.some(previous => previous.id === row.id));
  // Capture rather than assume in-place success. Current engines normally mark
  // the failed row rolled back and insert a separate applied record.
  requireState((old.rolled_back_at && old.finished_at === null && additions.length === 1 && additions[0].id === applied[0].id) ||
    (old.finished_at && old.rolled_back_at === null && additions.length === 0 && old.id === applied[0].id));
}

function ownerMain(args) {
  if (args.length !== 1 || args[0] !== "--owner-resolve-required-name") {
    throw new Error("Only the explicit owner required-name resolution invocation is supported.");
  }
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  requireState(process.cwd() === repo.replace(/\/$/u, ""));
  assertTaskFourRequiredNameResolution(); // Exact URLs, separate confirmation, immutable SQL inventory.
  // No inherited libpq/service/hostaddr overrides. psql prompts privately.
  const host = process.env.TASK04_EXPECTED_HOST === "[::1]" ? "::1" : process.env.TASK04_EXPECTED_HOST;
  const psqlArgs = ["--no-psqlrc", "--password", "--host=" + host, "--port=" + process.env.TASK04_EXPECTED_PORT,
    "--dbname=stitchtrack_assessment", "--username=stitchtrack_task04_test_app", "--set=ON_ERROR_STOP=on",
    "--set=VERBOSITY=verbose", "--pset=pager=off", "--quiet", "--tuples-only", "--no-align",
    "--file=task-04-server-security/experiments/required-column/resolution/inspect.sql"];
  const psqlEnv = { PATH: "/usr/bin:/bin", PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5",
    PGCLIENTENCODING: "UTF8", PGPASSFILE: "/dev/null" };
  const cliEnv = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "NODE_ENV", "TASK04_DATABASE_URL",
    "TASK04_EXPECTED_HOST", "TASK04_EXPECTED_PORT", "TASK04_DATABASE_CONFIRMED",
    "TASK04_SHADOW_DATABASE_URL", "TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED"]) {
    if (process.env[key] !== undefined) cliEnv[key] = process.env[key];
  }
  function inspect(phase) {
    console.log("\nREAD-ONLY " + phase + " inspection; command arguments: " + JSON.stringify(psqlArgs));
    console.log(readFileSync(new URL("../experiments/required-column/resolution/inspect.sql", import.meta.url), "utf8"));
    const result = spawnSync("/usr/lib/postgresql/16/bin/psql", psqlArgs,
      { env: psqlEnv, stdio: ["inherit", "pipe", "inherit"], encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    process.stdout.write(result.stdout ?? "");
    console.log(phase + "_inspection_exit_status=" + result.status);
    requireState(!result.error && result.status === 0);
    return JSON.parse(result.stdout.trim());
  }
  function prisma(command) {
    console.log("Command: ./node_modules/.bin/prisma " + command.join(" "));
    const result = spawnSync("./node_modules/.bin/prisma", command, { env: cliEnv, stdio: "inherit" });
    console.log(command[1] + "_exit_status=" + result.status);
    return !result.error && result.status === 0;
  }
  const before = inspect("before");
  checkBefore(before);
  const resolved = prisma(resolutionArgs);
  // Inspect even on a nonzero resolve: history may already have changed.
  const after = inspect("after");
  requireState(resolved);
  checkAfter(before, after);
  requireState(prisma(statusArgs));
  console.log("STOP FOR REVIEW: command/status returned zero and original diagnostics/users are preserved. Inspect the real records.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { ownerMain(process.argv.slice(2)); }
  catch { console.error("STOP: reconciliation/verification did not complete. Preserve output; no automatic retry, reset or history edit."); process.exitCode = 1; }
}
