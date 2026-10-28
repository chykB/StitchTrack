# Evidence 06: real Prisma Client runtime schema drift

**Prepared for owner review; not executed.** No client has been generated, database queried or Evidence 06 created by the agent. The owner completed reconciliation at 8464453: the [second resolution attempt](../evidence/05-required-column-resolution-attempt-02.txt) contains successful resolve/status and preserved original failure logs. The earlier [authentication-failed attempt](../evidence/05-required-column-resolution-supplement.txt) remains historical evidence; it is not labelled successful.

## Scope and dependencies

This is the owner's supplied Task Four Step 3 runtime-drift exercise: a successful application/ORM read, a client expecting a nonexistent column, the resulting genuine runtime error, and the same read after correcting/regenerating the client. A migrate-status message does not demonstrate that error. The PostgreSQL structure and migration history must never change.

The tracked [isolated lab schema](../prisma/schema.prisma) has seven models and 42 columns but **no generator**. Installed packages were inspected offline: Prisma CLI, @prisma/client and @prisma/adapter-pg are 7.10.1; pg is 8.16.3; Node 24 is required. No missing adapter dependency or installation is identified. Actual generation/adapter/runtime compatibility remains to be confirmed by the owner.

The [prepared policy](../experiments/runtime-drift/policy.ts) adds a prisma-client generator only to a working copy. It outputs ESM TypeScript to that copy's client/ directory with .ts import extensions for Node 24. The new [generation-only config](../experiments/runtime-drift/prisma.config.ts) has no datasource, migration path, dotenv or URL. It accepts only its exact generate command, an explicit owner flag and one of the two reviewed source variants. The existing lab migration config still rejects generation; root Task Two generation/output is untouched.

## Reversible source/client mismatch

All owner-generated copies and client output are under task-04-server-security/experiments/runtime-drift/work/, covered by the adjacent tracked .gitignore. The runner checks the ignore rule, rejects any tracked work files, refuses an existing work directory and rejects symlinked schema/client paths. Normal Git add omits them; do not force-add generated work.

| Phase | Working Prisma schema/client | PostgreSQL | Required genuine observation |
| --- | --- | --- | --- |
| Baseline | Copy of the correct canonical schema plus isolated generator; generate client. | Recovered User with four columns and two named synthetic rows. | The real Prisma user.findMany read returns those two users. |
| Drifted | Add only task04DriftProbe String? @db.Text to User; regenerate that client. | Unchanged: that column does not exist. | The same ORM read selects all known scalar fields and fails at runtime. P2022 is expected, not a result claimed in advance. |
| Restored | Restore the correct working source; regenerate the isolated client again. | Still unchanged. | The same read succeeds; complete rows/metadata/history match baseline. |

The canonical tracked schema is checksum-pinned and **never edited**. Its ignored working copy is the only temporary Prisma schema changed. This makes the deliberate missing field unable to enter an ordinary commit and avoids leaving the canonical model broken if the terminal is interrupted. Both migration SQL hashes are checked before/after; there are no migrations or database schema updates in this experiment.

The [single read program](../experiments/runtime-drift/read-users.mjs) uses the installed PrismaPg adapter and a separate fresh process/client for every phase. Its unchanged ORM call is prisma.user.findMany({ orderBy: { id: "asc" } }), with no select/omit. This is why a client generated from the drifted schema actually requests the missing column. It does not throw a simulated Prisma error. On a real PrismaClientKnownRequestError P2022 it prints the actual error/stack/metadata and exits 2; that exit code belongs to the read harness, not a claimed Prisma CLI exit convention. Unexpected errors do not satisfy the exercise.

Every connection validates the exact loopback main database stitchtrack_assessment, role stitchtrack_task04_test_app and schema task04_test, with explicit pool settings. All sessions default to read-only, with statement/lock/connect limits. A repeatable-read transaction verifies server identity, read-only state, schema ownership, four required User columns, validated name CHECK, two rows and the reconciled three-row history before the ORM read. It prints actual metadata/history and verifies the preserved synthetic IDs/emails/names. Baseline, drift and restored metadata are compared; restored row values/timestamps must match baseline. No payment, retrieval, authentication or Task Two query/writer is added.

Reserve exclusive lab access throughout; do not run another writer, resolver or migrator. Snapshot comparison catches unexpected changes but does not prevent a separate privileged process writing outside this program.

## Exact owner-only capture

Review [run.mjs](../experiments/runtime-drift/run.mjs), the reader, policy and generation config first. In an interactive WSL shell, activate existing Node 24 and privately export the existing TASK04_DATABASE_URL, TASK04_EXPECTED_HOST, TASK04_EXPECTED_PORT and TASK04_DATABASE_CONFIRMED variables. They must pass the existing main-target guard; no root URL fallback or new password file is used. The shadow URL is not used by this experiment. Do not print credentials.

Run this block **once after review**. It refuses an existing/symlinked Evidence 06, captures actual commands, complete stdout/stderr and stage/run/capture statuses, and preserves earlier evidence. Generation is owner-only and uses installed packages with auto-install disabled; no npm install, npx, db push, reset or migration command is invoked.

```bash
bash <<'TASK04_OWNER_DRIFT'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
unset TASK04_INITIAL_DEPLOY_CONFIRMED TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED
export TASK04_RUNTIME_DRIFT_CONFIRMED=true
task04_log='task-04-server-security/evidence/06-drift-error.txt'
if [[ -e "$task04_log" || -L "$task04_log" ]]; then
  printf 'STOP: Evidence 06 already exists; preserve it unchanged.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_log") || exit 1
(
  printf 'EVIDENCE 06 - owner-run real Prisma Client runtime drift and correction\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  printf 'Command: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/runtime-drift/run.mjs --owner-run\n'
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/runtime-drift/run.mjs --owner-run
  task04_owner_status=$?
  printf 'owner_experiment_exit_status=%s\n' "$task04_owner_status"
  exit "$task04_owner_status"
) 2>&1 | tee -a "$task04_log"
task04_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${task04_status[0]}" "${task04_status[1]}" >> "$task04_log"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_status[0]}" "${task04_status[1]}" "$task04_append_status" "$task04_log"
if (( task04_status[0] != 0 || task04_status[1] != 0 || task04_append_status != 0 )); then
  printf 'STOP: preserve partial evidence/work files and inspect restoration status; do not repeat the experiment.\n' >&2
  exit 1
fi
TASK04_OWNER_DRIFT
```

The runner prints each real generate/read command, their complete captured stdout/stderr and exit statuses. Child stdout and stderr are printed as separate complete streams after each child returns; this preserves their contents rather than claiming interleaved line timing. It uses fresh subprocesses to avoid stale module caches. The expected drift read exits 2; the baseline/restored reads and all three generate commands must exit 0. Only an actually observed expected error plus successful correction permits final run status 0. Authentication failures, generation/import errors or a normal drifted read are not substitutes for a missing-column error.

## Failure handling and restoration

The normal finally block restores the correct ignored schema, regenerates and repeats the read after the drift stage, even if that stage fails unexpectedly. This is source/client correction, not a database repair or automatic request retry. A failed baseline stops before inserting the extra field. Every partial log/work directory is preserved; the script never deletes or resets it.

An abrupt termination or failed correction can bypass/interrupt cleanup. The tracked canonical schema remains correct, and no product code imports the ignored client. Preserve Evidence 06 and inspect the last schema/generation/read statuses. After reviewing the interruption, the owner can use this **restore-only** command with the same private main variables and exclusive drift flag, capturing output in a new supplementary log rather than overwriting Evidence 06:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/runtime-drift/run.mjs --owner-restore-only
```

Restore-only refuses an unrecognized working schema, restores the reviewed correct copy, generates only that client and performs a read-only verification. It does not reintroduce drift, delete data or count as a new complete Evidence 06 run. No automatic repeat of the experiment is authorized. Keep work files ignored until review; subsequent cleanup is a separate owner action.

## Explanation and pending evidence

Prisma schema/client describe the columns the application expects; PostgreSQL is the actual stored structure. Generating from a schema containing a new field changes the client's query expectations but does not create that column. Restoring the correct schema and regenerating removes that expectation, fixing this deliberately introduced client-side mismatch without database changes. This is an assessment-only inconsistency, not proof that real authentication or production migrations are broken.

Actual baseline, P2022 message/metadata, correction, final reads and all exit statuses remain **pending owner execution**. Offline policy/static tests and syntax/type checks do not establish these runtime outcomes. Evidence 03-05, both resolution attempts and executed migrations remain unchanged. The original assessment PDF is unavailable; this follows the owner's supplied Step 3 requirements.

References: [Prisma generator configuration](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [Prisma P2022 error reference](https://www.prisma.io/docs/orm/v7/reference/error-reference#p2022). These explain the mechanism, not completed evidence.
