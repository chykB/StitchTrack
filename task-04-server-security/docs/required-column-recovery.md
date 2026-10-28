# Evidence 05: three-step required-column recovery

**Prepared for owner review. No SQL, evidence capture or Prisma resolution was executed.** The owner verifies Evidence 04 at commit b3af65d: P3018/PostgreSQL 23502, two preserved synthetic users and no User.name. The [failed migration](../prisma/migrations/20261028_task04_user_name/migration.sql) and [initial migration](../prisma/migrations/20261028_task04_initial/migration.sql) remain unchanged. Their live failed/successful history is checked again by each prepared step.

## Recovery implementation and safeguards

All SQL is outside the active migration directory, under [recovery/](../experiments/required-column/recovery/). These are manual forward completion operations, not new successful Prisma migrations placed behind an unresolved failure.

| Step | Prepared owner SQL | Strict starting state / committed result |
| --- | --- | --- |
| 1 | [01-add-nullable.sql](../experiments/required-column/recovery/01-add-nullable.sql) | Original three-column User, name and its CHECK absent. Adds name TEXT with NULL allowed, no default; both existing values must be NULL. |
| 2 | [02-backfill.sql](../experiments/required-column/recovery/02-backfill.sql) | Nullable TEXT/no default, no name CHECK, both values still NULL. Updates only name: task04-required-name-01 becomes Synthetic User 01; task04-required-name-02 becomes Synthetic User 02. No user is inserted, deleted or replaced. |
| 3 | [03-require-name.sql](../experiments/required-column/recovery/03-require-name.sql) | Nullable TEXT, exact two mapped names, no prior name CHECK. Sets NOT NULL and adds the exact User_name_nonblank_check copied from the failed migration. No default or name index is added. |

Each step has its own transaction, 5-second lock timeout and 30-second statement timeout. [Shared preconditions](../experiments/required-column/recovery/preconditions.sql) require the exact stitchtrack_assessment/task04_test/stitchtrack_task04_test_app context, schema ownership, UTF8, exactly the initial successful and original unresolved failed migration records/checksums/23502 diagnostic, and exactly the two expected user IDs/emails. Lock order is migration history SHARE, then User ACCESS EXCLUSIVE. This prevents concurrent history updates or User writes during a step; it is not an automatic retry policy.

The preconditions snapshot **all migration-history fields including original IDs/logs**, plus User id/emailCanonical/createdAt, into psql memory. [Preservation checks](../experiments/required-column/recovery/verify-unchanged.sql) compare those exact values before COMMIT and again in a read-only post-commit transaction. [Reports](../experiments/required-column/recovery/report.sql) print rows/names, NULL counts, column type/nullability/default, actual CHECK definition and complete original history/diagnostic. No script writes _prisma_migrations. Shared SQL uses psql relative includes, so run the stage files through psql, not Prisma db execute.

Locks release at each COMMIT. Reserve the lab exclusively for the whole sequence; no other writer, resolver, seed or migrator may run between steps. A timeout, wrong starting state or a preservation failure stops execution. A later failure leaves earlier successful commits intact. Do not restart step 1 or replace partial evidence; inspect actual state and obtain a tailored continuation plan.

## Exact owner-only review and capture

Review the six SQL files and the [source manifest](../experiments/required-column/recovery/artifacts.sha256). The manifest is integrity metadata, not execution evidence. Its SHA-256 is 30f44f46803de5ee7e540aed0fc16a82b09d02249d9525d22b79491db26ec690. The capture block checks it, the migration checksums and all included SQL before opening a database connection.

Use an interactive WSL terminal, existing Node 24 and the five private connection variables from the [setup notes](../prisma/README.md). No passwords/URLs are printed; native psql prompts privately for the **main assessment role** password. It uses a clean environment with the validated local main host/port and fixed database/role. The confirmation below authorizes only this owner SQL capture block; it does not enable a Prisma command.

**Do not run until this prepared recovery is reviewed.** The owner block creates evidence/05-required-column-three-steps.txt exclusively and refuses to overwrite existing/partial evidence. It captures actual commands, complete stdout/stderr, per-step and capture exit statuses. There are no expected-output substitutions or automatic retries.

```bash
bash <<'TASK04_OWNER_RECOVERY'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
unset TASK04_INITIAL_DEPLOY_CONFIRMED TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED
export TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED=true
task04_evidence='task-04-server-security/evidence/05-required-column-three-steps.txt'
if [[ -e "$task04_evidence" || -L "$task04_evidence" ]]; then
  printf 'STOP: Evidence 05 already exists; preserve it unchanged.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_evidence") || exit 1
(
  printf 'EVIDENCE 05 - owner-run nullable, backfill, required recovery\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'TASK04_RECOVERY_GUARD'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { taskFourDatasource } from './task-04-server-security/prisma/config.ts';
taskFourDatasource();
if (process.env.TASK04_REQUIRED_COLUMN_RECOVERY_CONFIRMED !== 'true' ||
    process.env.TASK04_INITIAL_DEPLOY_CONFIRMED === 'true' ||
    process.env.TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED === 'true') throw new Error('Exclusive owner recovery confirmation required.');
const file = 'task-04-server-security/experiments/required-column/recovery/artifacts.sha256';
if (createHash('sha256').update(readFileSync(file)).digest('hex') !== '30f44f46803de5ee7e540aed0fc16a82b09d02249d9525d22b79491db26ec690') throw new Error('Recovery manifest differs from reviewed source.');
console.log('Dedicated targets and reviewed recovery manifest validated offline.');
TASK04_RECOVERY_GUARD
  task04_guard_status=$?
  printf 'configuration_exit_status=%s\n' "$task04_guard_status"
  if (( task04_guard_status != 0 )); then exit "$task04_guard_status"; fi
  printf 'Command: sha256sum --check task-04-server-security/experiments/required-column/recovery/artifacts.sha256\n'
  sha256sum --check task-04-server-security/experiments/required-column/recovery/artifacts.sha256
  task04_integrity_status=$?
  printf 'integrity_exit_status=%s\n' "$task04_integrity_status"
  if (( task04_integrity_status != 0 )); then exit "$task04_integrity_status"; fi
  task04_psql_host="$TASK04_EXPECTED_HOST"
  if [[ "$task04_psql_host" == '[::1]' ]]; then task04_psql_host='::1'; fi
  task04_psql() {
    /usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 \
      PGCLIENTENCODING=UTF8 PGPASSFILE=/dev/null \
      /usr/lib/postgresql/16/bin/psql --no-psqlrc --password \
      --host="$task04_psql_host" --port="$TASK04_EXPECTED_PORT" \
      --dbname=stitchtrack_assessment --username=stitchtrack_task04_test_app \
      --set=ON_ERROR_STOP=on --set=VERBOSITY=verbose --pset=pager=off --echo-all "$@"
  }
  for task04_step in 01-add-nullable 02-backfill 03-require-name; do
    task04_file="task-04-server-security/experiments/required-column/recovery/$task04_step.sql"
    printf '\nSTEP %s\n' "$task04_step"
    printf 'Command: env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGCLIENTENCODING=UTF8 PGPASSFILE=/dev/null '
    printf '%q ' /usr/lib/postgresql/16/bin/psql --no-psqlrc --password \
      --host="$task04_psql_host" --port="$TASK04_EXPECTED_PORT" \
      --dbname=stitchtrack_assessment --username=stitchtrack_task04_test_app \
      --set=ON_ERROR_STOP=on --set=VERBOSITY=verbose --pset=pager=off --echo-all --file="$task04_file"
    printf '\n'
    task04_psql --file="$task04_file"
    task04_step_status=$?
    printf '%s_exit_status=%s\n' "$task04_step" "$task04_step_status"
    if (( task04_step_status != 0 )); then
      printf 'STOP: preserve partial evidence and prior commits. No retry, reset, resolve or reseed.\n' >&2
      exit "$task04_step_status"
    fi
  done
  printf 'STOP FOR REVIEW: all three step commands returned zero; inspect genuine catalog/results before enabling any resolution.\n'
) 2>&1 | tee -a "$task04_evidence"
task04_pipeline_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" >> "$task04_evidence"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" "$task04_append_status" "$task04_evidence"
if (( task04_pipeline_status[0] != 0 || task04_pipeline_status[1] != 0 || task04_append_status != 0 )); then
  printf 'STOP: database changes may already be committed. Preserve the file; do not rerun it.\n' >&2
  exit 1
fi
TASK04_OWNER_RECOVERY
```

Zero exit/capture statuses are not invented in this document. If a post-commit report or tee fails, that step may already be committed. Preserve the partial file and report the last completed COMMIT, step status and any error. The SQL checks preserve the failed diagnostic; they do not reconcile Prisma history, so Prisma still correctly reports the unresolved failed migration afterward.

## Inspecting the completed intended schema

After the three real steps, verify User has exactly four columns, name is PostgreSQL TEXT, NOT NULL, with no default, and the validated User_name_nonblank_check references name. The report prints pg_get_constraintdef; compare it with the failed migration's intended CHECK. Offline contract tests require the prepared source expression to be byte-identical, while PostgreSQL may normalize its displayed expression. Both exact synthetic names must be present, identities/timestamps unchanged, and original migration IDs/checksums/logs still preserved. These real results remain pending owner execution/review.

No new name index, Prisma migration record or payment/retrieval behaviour is intended. The final lab has 42 scalar columns and one additional CHECK, with its previous indexes/FKs unchanged. No SQL parser/database test or fresh replay has been performed by the agent; source checks are not runtime proof.

## Subsequent model alignment and guarded resolution - DISABLED

Only after reviewing the genuine recovery results, align the isolated User model with `name String @db.Text` (required, no default or name index), remove the transitional omission note and run separately approved database-free schema checks. Do not change root/product models or generate a live client prematurely. This slice deliberately leaves the isolated Prisma model unchanged while recovery is pending.

Then prepare an exact-migration guarded resolution path after independently checking both unchanged SQL hashes and the completed live schema/data. The future owner command is:

```bash
./node_modules/.bin/prisma migrate resolve --applied 20261028_task04_user_name --config task-04-server-security/prisma/prisma.config.ts
```

**It remains rejected by the current command allow-list. Do not run it now.** The resolution will not execute the DDL; it must only reconcile work already completed and verified. Capture that later real command/output and before/after history in a supplementary continuation, preserving this three-step evidence. Confirm Prisma retains the original failed record ID and original logs; it may update resolution metadata/add an applied record. No direct tracking-table edits, deleting/replacing the failure, reset, --rolled-back retry or editing either migration is approved.

This follows Prisma's [manual completion recovery](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing#option-2-manually-complete-migration-and-resolve-as-applied). See [PostgreSQL locking](https://www.postgresql.org/docs/16/explicit-locking.html) and [psql includes/variables](https://www.postgresql.org/docs/16/app-psql.html). The original failed migration can still replay on a fresh empty User table later; replay/verification is future owner-controlled work, not a result claimed here.
