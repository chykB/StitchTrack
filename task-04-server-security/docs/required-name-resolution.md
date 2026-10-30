# Owner-only required-name migration reconciliation

**Prepared, not executed.** The owner completed initial deployment (Evidence 03), the P3018/23502 failure (Evidence 04), and nullable/backfill/required recovery (Evidence 05, commit 528e166). See [genuine recovery output](../evidence/05-required-column-three-steps.txt). Resolution remains pending. No account/authentication functionality is introduced.

## Model alignment and immutable history

The isolated [User model](../prisma/schema.prisma) now has `name String @db.Text`: required, no default, no index. Seven lab models now declare 42 scalar columns. The exact nonblank CHECK remains SQL-managed; Prisma's DSL does not express it. Root/application Prisma files, Task Two and product proposals are unchanged.

Both executed migrations are preserved byte-for-byte:

| Migration | SHA-256 |
| --- | --- |
| 20261028_task04_initial | 1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501 |
| 20261028_task04_user_name | 482f61d709079ac088dda61c1d901d17a4d6f42dd3cd81c690211ad03f105e33 |

The [configuration guard](../prisma/config.ts) checks the migration-directory inventory, hashes and existing synthetic seed integrity again. It admits only this exact resolution argument order/config spelling, with a new exclusive `TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED=true` confirmation and the existing dedicated main/shadow URL safeguards:

```bash
./node_modules/.bin/prisma migrate resolve --applied 20261028_task04_user_name --config task-04-server-security/prisma/prisma.config.ts
```

Use the wrapper below rather than invoking this command alone: the config checks files/targets, while the wrapper independently verifies live state. The old initial/failure/recovery confirmations cannot authorize resolution and must be unset. The resolution flag cannot authorize deploy. Reset, client generation, migration creation, db push/execute/pull, diff and arbitrary resolution names/options remain blocked. No command falls back to root config. This is a guard against accidental use, not a security sandbox against someone editing code or running PostgreSQL directly.

## Independent read-only checks

The [owner wrapper](../scripts/resolve-required-name.mjs) first runs [inspect.sql](../experiments/required-column/resolution/inspect.sql) through native PostgreSQL 16 psql. It validates the exact main database stitchtrack_assessment, role stitchtrack_task04_test_app, owned schema task04_test and UTF8. No public/Task Two objects are queried. Connections use validated loopback host/port, a clean libpq environment and private password prompts; URLs/passwords are never printed.

Each inspection is a repeatable-read, read-only transaction with 5-second lock and 30-second statement timeouts. It checks four required User columns, TEXT name without default, and the validated, name-only CHECK with the exact Unicode whitespace set from the failed SQL. It checks the two preserved IDs/emails and names Synthetic User 01/02. PostgreSQL's deparsed CHECK is compared to the expected expression; an unexpected representation stops the procedure for review rather than being silently accepted.

The before result contains User rows/timestamps, column/constraint/index definitions and **all history fields, including complete original logs**. The wrapper requires exactly the original successful initial record and unresolved failed record, their checksums and the original 23502 diagnostic. Original IDs are pinned to Evidence 05: initial bb1d3fb7-90cf-4fc5-b7e3-6fdb00b1f878; failed e91a14f3-686e-4929-8e3f-bcec0baaff30. A missing, replaced or already-resolved failure stops before resolution.

After the exact command, another read-only inspection prints the actual records, even if resolution returned nonzero. On success, the wrapper compares schema/indexes/users with the before snapshot, preserves original record IDs/checksums/start times/logs, permits only resolution timestamp changes on the original failure, requires one applied candidate and no unresolved history, then runs guarded migrate status. Unexpected history shape stops for review. The snapshots live only in process memory and the owner's supplementary log.

Reserve an exclusive lab maintenance window from first inspection through final status. No writer, resolver, seed, deploy or other schema operation may run concurrently. Read-only inspections cannot hold history locks across Prisma's separate write connection; holding such locks would obstruct resolution. This procedure is not atomic across processes. If anything fails, history may already be changed: preserve output and inspect before any further action.

## Exact owner capture procedure

Review the model, guard, wrapper and inspector first. In an interactive WSL terminal, use Node 24 and privately export the five dedicated connection variables in the [setup notes](../prisma/README.md). No new password file or credential is committed. The private shadow URL remains required by the existing config, but resolve/status do not replay or reset the shadow.

After review, run this block **once** from WSL. It refuses existing/partial supplementary evidence, captures actual commands/stdout/stderr and statuses, and never alters Evidence 03/04/05. Password prompts may appear for each read-only psql connection; use the restricted main role password. Do not paste a password into a command or evidence file.

```bash
bash <<'TASK04_OWNER_RESOLUTION'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
unset TASK04_INITIAL_DEPLOY_CONFIRMED TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED
export TASK04_REQUIRED_NAME_RESOLVE_CONFIRMED=true
task04_log='task-04-server-security/evidence/05-required-column-resolution-supplement.txt'
if [[ -e "$task04_log" || -L "$task04_log" ]]; then
  printf 'STOP: supplementary evidence already exists; preserve it.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_log") || exit 1
(
  printf 'SUPPLEMENT - owner-run required-name migration reconciliation\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  printf 'Command: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/scripts/resolve-required-name.mjs --owner-resolve-required-name\n'
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/scripts/resolve-required-name.mjs --owner-resolve-required-name
  task04_owner_status=$?
  printf 'owner_wrapper_exit_status=%s\n' "$task04_owner_status"
  exit "$task04_owner_status"
) 2>&1 | tee -a "$task04_log"
task04_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${task04_status[0]}" "${task04_status[1]}" >> "$task04_log"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_status[0]}" "${task04_status[1]}" "$task04_append_status" "$task04_log"
if (( task04_status[0] != 0 || task04_status[1] != 0 || task04_append_status != 0 )); then
  printf 'STOP: preserve partial output; resolution may already have committed. No retry/reset/history edit.\n' >&2
  exit 1
fi
TASK04_OWNER_RESOLUTION
```

The wrapper prints the exact Prisma resolve command, genuine output, resolve status, before/after JSON records, inspection statuses, and status command/output/status. No successful status or history is prewritten in this documentation. If a command cannot start, its recorded status can be null and the wrapper fails. If output capture fails, stop even if Prisma returned zero; preserve partial evidence and obtain a separately reviewed investigation plan. Never rerun the original recovery, resolve automatically, delete history, edit checksums, or use --rolled-back to make an apparent success.

The owner can subsequently check history through the same guarded config (with the private connection variables still exported):

```bash
./node_modules/.bin/prisma migrate status --config task-04-server-security/prisma/prisma.config.ts
```

Status is a migration-history check, not a schema-drift or application-writer test. The independent SQL checks are still necessary.

## What resolution records and remaining review

Prisma's [manual-completion workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing#option-2-manually-complete-migration-and-resolve-as-applied) records completion without executing the migration DDL again. It can mark the original failure rolled back as history metadata and insert a separate finished/applied record. That metadata does not undo the recovered column or erase the failed event. Do not assume the original row simply acquires a successful finished_at. Capture and inspect the actual records and preserve the original logs and ID.

The comparison supports a separate applied record or an in-place timestamp-only resolution while preserving diagnostics; an unexplained row change, deleted diagnostic, extra migration or inconsistent status is a stop. This is verification policy, not a claim that both shapes were observed. See the [Prisma CLI reference](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference#migrate-resolve).

Only offline checks have been run by the agent. Actual SQL deparsing, database inspection, resolution, resulting timestamps/history and status remain owner-controlled and unverified here. Fresh replay, drift Evidence 06, product writers and real authentication are separate work. Evidence 03/04/05 and both executed SQL files remain untouched.
