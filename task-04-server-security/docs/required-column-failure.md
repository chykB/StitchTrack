# Evidence 04: genuine required-column Prisma migration failure

**Historical Evidence 04 procedure: completed by the owner and committed at b3af65d. Do not rerun the seed or failure attempt below.** [Evidence 04](../evidence/04-required-column-failure.txt) records P3018/PostgreSQL 23502. The owner verifies two synthetic users remain and User.name is absent. Continue with the separately prepared [Evidence 05 three-step recovery](required-column-recovery.md); it has not been executed. Initial migration/Evidence 03 remains committed at 1201216. All expectations and execution instructions below describe the earlier failure preparation, not a new authorization to repeat it.

## Artifacts and exact scope

- [Synthetic seed](../experiments/required-column/seed-users.sql): transactionally requires the exact main database/role, owned task04_test schema, successful original migration/checksum, no other migration records, the original three-column User table and an empty User table. It locks that table, inserts exactly two synthetic IDs with example.invalid emails, commits and prints the rows/count. There is no upsert, cleanup or Task Two access. Existing records cause a stop, not replacement.
- [New pending migration](../prisma/migrations/20261028_task04_user_name/migration.sql): 20261028_task04_user_name sorts after 20261028_task04_initial. It adds name TEXT NOT NULL, without DEFAULT, plus the final nonblank CHECK. The role/database preflight is real safety validation, not a manufactured migration failure. With the two committed rows, the actual ALTER should fail on NOT NULL. This is an expectation, not an observed result.
- [Configuration](../prisma/config.ts): the explicit failure-phase flag admits only these reviewed artifacts and the exact initial SQL. Main/shadow URL safeguards are unchanged. Initial-only confirmation no longer permits deploy while this additional candidate is present. reset/dev/diff/resolve/db push/db execute/generate remain blocked.

No Prisma model change or real signup writer is included. migrate deploy executes migration SQL independently of client generation; model alignment belongs to the later successful recovery. The seed is outside migration history so fresh replay has no seeded rows. Neither a config rejection nor an empty-shadow success counts as Evidence 04.

Reviewed candidate SHA-256: 482f61d709079ac088dda61c1d901d17a4d6f42dd3cd81c690211ad03f105e33. Seed SHA-256: 83c98b132026fa160c581a74b744055aaeab76bd807176e551473d62144820c9. Runtime guards reject changes or extra pending migrations. The original migration is never edited.

## Risks to accept before owner execution

1. This deliberately creates a failed Prisma history record on the isolated synthetic assessment target. Further deploys will be blocked until reviewed recovery. Approve the manual-completion/resolve plan below before starting; recovery is not automatic and resolve remains disabled now.
2. The User table must currently be empty and used exclusively by this exercise. If not, stop for a revised plan. No script deletes, overwrites or ignores existing users. Do not run another writer/migrator between the committed seed, verification and Prisma attempt.
3. A single ALTER statement is atomic; the candidate deliberately has no explicit outer BEGIN that could leave Prisma's connection in an aborted transaction while it records the failure. Nevertheless, inspect actual state/logs before recovery, rather than assuming column absence or metadata shape.
4. A nonzero exit can also mean authentication, transport, configuration or another SQL failure. Only the captured actual required-column error with the populated-table proof satisfies the assessment. Expected diagnostic classes are Prisma migration-application failure (commonly P3018) and PostgreSQL NOT NULL violation (23502); do not write those as observed until they appear.
5. Capturing may fail after seeding or after the attempted migration. Preserve partial output and investigate; never automatically retry/reseed, delete history, reset or overwrite an evidence file. Main and shadow remain distinct; Task Two stays untouched.

## Owner-run sequence - review first, do not run automatically

Use the existing Node 24 WSL shell and five privately exported connection variables from the [setup notes](../prisma/README.md). Review the seed, candidate and recovery plan. The block below creates evidence only when the owner runs it. It refuses an existing Evidence 04 path and never creates Evidence 05. psql uses the validated local main host/port, a clean environment, the fixed assessment database/role and a private terminal password prompt; no connection URL/password is printed.

```bash
bash <<'TASK04_REQUIRED_COLUMN_FAILURE'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
unset TASK04_INITIAL_DEPLOY_CONFIRMED
export TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED=true
task04_evidence='task-04-server-security/evidence/04-required-column-failure.txt'
if [[ -e "$task04_evidence" || -L "$task04_evidence" ]]; then
  printf 'STOP: Evidence 04 already exists; preserve it unchanged.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_evidence") || exit 1
(
  printf 'EVIDENCE 04 - actual populated-table required-column Prisma attempt\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  sha256sum task-04-server-security/prisma/migrations/20261028_task04_initial/migration.sql
  sha256sum task-04-server-security/prisma/migrations/20261028_task04_user_name/migration.sql
  sha256sum task-04-server-security/experiments/required-column/seed-users.sql
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'TASK04_GUARD_CHECK'
import { taskFourDatasource, assertTaskFourDeploy } from './task-04-server-security/prisma/config.ts';
taskFourDatasource();
assertTaskFourDeploy();
console.log('Reviewed failure phase and exact dedicated targets validated offline.');
TASK04_GUARD_CHECK
  task04_guard_status=$?
  printf 'configuration_exit_status=%s\n' "$task04_guard_status"
  if (( task04_guard_status != 0 )); then exit "$task04_guard_status"; fi
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
  printf 'Owner seed command: psql with fixed main target, --file=task-04-server-security/experiments/required-column/seed-users.sql\n'
  task04_psql --file=task-04-server-security/experiments/required-column/seed-users.sql
  task04_seed_status=$?
  printf 'seed_exit_status=%s\n' "$task04_seed_status"
  if (( task04_seed_status != 0 )); then exit "$task04_seed_status"; fi
  printf 'Read-only independent committed-row verification before migration.\n'
  task04_psql --file=- <<'TASK04_VERIFY_SEED'
BEGIN READ ONLY;
DO LANGUAGE plpgsql $seed_proof$
BEGIN
  IF pg_catalog.current_database()<>'stitchtrack_assessment'
      OR CURRENT_USER<>'stitchtrack_task04_test_app' THEN RAISE EXCEPTION 'Wrong verification target/role'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User")<>2
      OR (SELECT count(*) FROM "task04_test"."User" WHERE
        ("id"='task04-required-name-01' AND "emailCanonical"='required-name-01@example.invalid') OR
        ("id"='task04-required-name-02' AND "emailCanonical"='required-name-02@example.invalid'))<>2 THEN
    RAISE EXCEPTION 'Expected exactly the two committed synthetic rows';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='task04_test'
      AND table_name='User' AND column_name='name') THEN RAISE EXCEPTION 'name must be absent before the attempt'; END IF;
END;
$seed_proof$;
SELECT "id","emailCanonical","createdAt" FROM "task04_test"."User" ORDER BY "id";
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='task04_test' AND table_name='User' ORDER BY ordinal_position;
COMMIT;
TASK04_VERIFY_SEED
  task04_before_status=$?
  printf 'before_verification_exit_status=%s\n' "$task04_before_status"
  if (( task04_before_status != 0 )); then exit "$task04_before_status"; fi
  printf 'Actual pending migration SQL (not an invented response):\n'
  cat task-04-server-security/prisma/migrations/20261028_task04_user_name/migration.sql
  printf 'Command: ./node_modules/.bin/prisma migrate deploy --config task-04-server-security/prisma/prisma.config.ts\n'
  ./node_modules/.bin/prisma migrate deploy --config task-04-server-security/prisma/prisma.config.ts
  task04_migration_status=$?
  printf 'migration_attempt_exit_status=%s\n' "$task04_migration_status"
  if (( task04_migration_status == 0 )); then
    printf 'STOP: unexpected migration success; preserve actual state/output, do not undo it automatically.\n' >&2
    exit 70
  fi
  printf 'Nonzero is not itself proof of the expected failure. Read-only post-attempt inspection follows.\n'
  task04_psql --file=- <<'TASK04_VERIFY_FAILURE'
BEGIN READ ONLY;
DO LANGUAGE plpgsql $post_failure$
BEGIN
  IF pg_catalog.current_database()<>'stitchtrack_assessment'
      OR CURRENT_USER<>'stitchtrack_task04_test_app' THEN RAISE EXCEPTION 'Wrong post-failure target/role'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='task04_test'
      AND table_name='User' AND column_name='name') THEN RAISE EXCEPTION 'Unexpected name column: inspect partial state'; END IF;
  IF (SELECT count(*) FROM "task04_test"."User")<>2 THEN RAISE EXCEPTION 'Unexpected row count after failure'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "task04_test"."_prisma_migrations"
      WHERE migration_name='20261028_task04_user_name' AND finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Expected unresolved failed Prisma migration record is absent';
  END IF;
END;
$post_failure$;
SELECT "id","emailCanonical","createdAt" FROM "task04_test"."User" ORDER BY "id";
SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,logs
FROM "task04_test"."_prisma_migrations" ORDER BY started_at;
SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='task04_test' AND table_name='User' ORDER BY ordinal_position;
COMMIT;
TASK04_VERIFY_FAILURE
  task04_after_status=$?
  printf 'after_verification_exit_status=%s\n' "$task04_after_status"
  if (( task04_after_status != 0 )); then exit "$task04_after_status"; fi
  printf 'STOP FOR REVIEW: assess the actual required-column diagnostic; recovery is not run.\n'
  exit "$task04_migration_status"
) 2>&1 | tee -a "$task04_evidence"
task04_pipeline_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" >> "$task04_evidence"
task04_append_status=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" "$task04_append_status" "$task04_evidence"
printf 'Preserve the log and stop. A nonzero migration exit is expected only if the actual cause is the required-column violation.\n'
if (( task04_pipeline_status[1] != 0 || task04_append_status != 0 )); then
  printf 'Capture failed; database state may already have changed. No retry or recovery.\n' >&2
  exit 1
fi
exit "${task04_pipeline_status[0]}"
TASK04_REQUIRED_COLUMN_FAILURE
```

The wrapper deliberately propagates the real nonzero Prisma status after its read-only checks; it does not turn an error into a fake success. stdout/stderr are unfiltered, and individual seed/config/before/migration/after/capture statuses are retained. Evidence qualifies only after the owner reviews the actual failure and populated rows. Never replace a failed capture with expected text. If seeding committed but any later phase failed, the next run must not silently reseed; preserve the rows and request a revised continuation plan.

## Evidence 05 recovery plan - NOT implemented or authorized here

**Recommended: complete the failed migration forward manually, then resolve it as applied only after proving completion.** This preserves both the already-applied initial SQL and the failed candidate's bytes/checksum, avoiding a replay-breaking failed file edit or deleting history.

1. Review the genuine Evidence 04, failed Prisma row, preserved two users, absent name column and unchanged initial checksum. Do not assume this state solely from a nonzero exit.
2. In a separately reviewed owner-controlled slice, prepare and capture all three forward operations: add name TEXT nullable; backfill deterministic nonblank synthetic names for the two IDs; then make name NOT NULL and install the exact User_name_nonblank_check from the candidate. Capture command/output, row values/counts and schema constraints after each stage in Evidence 05. No operations or evidence file are supplied/executed now.
3. Verify the completed schema exactly matches what 20261028_task04_user_name intends, no NULL/blank names remain, the two rows are preserved and both migration checksums remain unchanged. Align the isolated Prisma model in that approved recovery slice. This is completion of the migration's actual DDL, not a fictitious applied marker.
4. Only then separately enable the exact guarded owner command migrate resolve --applied 20261028_task04_user_name with the isolated config and actual-state preconditions. It reconciles Prisma tracking; it does not perform the DDL. Capture its genuine output and resulting history as part of Evidence 05, preserving the earlier failed record/log as Prisma records it. **resolve remains blocked now.** No reset or direct tracking-table edits.
5. Verify future fresh replay: the initial migration creates an empty User table and this unchanged candidate can add a required name to that empty table. The two synthetic seeds are not in migration history. Replay itself is future owner work; it has not passed here.

This follows Prisma's [manual completion of a failed migration](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing#option-2-manually-complete-migration-and-resolve-as-applied). Evidence 05 would show three genuine forward SQL operations plus honest Prisma-history reconciliation, not three automatic Prisma deploys. If the owner wants each operation as a distinct successful Prisma migration instead, agree that alternative history strategy **before** executing Evidence 04; simply appending three migrations behind an unresolved failed one will not work.

Do not use resolve --rolled-back merely to unblock deploy: it permits retrying the same bad required-column SQL, which still fails on populated rows. Do not resolve --applied before the nullable/backfill/required completion, delete failed history, remove data to force success, or edit the already-applied initial migration. The recovery decision is the main review dependency before running this prepared exercise.
