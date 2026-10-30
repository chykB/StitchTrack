# Owner-only initial SQL rehearsal and evidence sequence

**Initial Prisma deployment and Evidence 03 are owner-verified complete, committed at 1201216. The earlier commands below are historical and must not be rerun. The owner has also captured the genuine required-column failure at b3af65d; continue with the prepared [Evidence 05 recovery](required-column-recovery.md). Do not repeat Evidence 04.** Read the [migration review](migrations.md), [initial SQL](../prisma/migrations/20261028_task04_initial/migration.sql) and [helper](../scripts/rehearse-initial-shadow.sh) before running anything. This is a one-time empty-schema SQL rehearsal on the dedicated disposable shadow, not a Prisma migration or account/payment workflow.

## Scope and prerequisites

The helper is fixed to 127.0.0.1:5432, database stitchtrack_task04_shadow, role stitchtrack_task04_shadow_app and schema task04_test. It has no target/file override and will not reset anything. It requires a reviewed SQL SHA-256 and an explicit execution argument. A shadow-only preflight on the same psql connection must pass before the migration file is read: exact database/role, schema ownership and no relations in task04_test. The original migration then independently checks its allowed target pair, ownership and UTF8 before transactional DDL.

The owner verifies the shadow is disposable, currently empty and exclusively available, with the existing schema and correct restricted owner. A successful rehearsal leaves the seven tables there. A second run must stop at the nonempty check; do not reset or broaden permissions to force it through. Further replay/reset needs a separate reviewed owner action. Do not edit the SQL between review and execution; the helper's checksum is a review guard, not a defence against concurrent malicious file changes.

The helper runs only the system PostgreSQL 16 psql binary with a clean connection environment. It skips psqlrc, removes inherited libpq/service/hostaddr overrides, disables password-file lookup and prompts privately for the **shadow** password. It does not read .env or TASK04 URLs. Prisma URL parameters such as schema are not passed to libpq. No password appears in a command argument, log or Git file. The fixed loopback connection uses sslmode=disable; this is not a production TLS recommendation.

## Completed shadow rehearsal - owner-reported

The owner reports seven CREATE TABLE statements, index/FK statements and final COMMIT succeeded, with rehearsal exit status 0 and capture status 0. The log is preserved outside the repository and is **not Evidence 03**. SQL SHA-256: 1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501; it matches the current file offline. The agent did not run or independently inspect that external transcript.

Do not rerun the successful rehearsal or reset the now-populated shadow. The historical helper remains for reference and stops on nonempty schemas. This owner-reported result establishes tested structural DDL on the shadow, not main application, financial lifecycle enforcement or Prisma migration tracking.

## Evidence 03 - genuine initial Prisma deployment

Historical Evidence 03 procedure: at that stage only owner-executed initial migrate deploy was enabled, with the exact isolated --config path. It requires all five existing private TASK04 variables from the [setup notes](../prisma/README.md) plus TASK04_INITIAL_DEPLOY_CONFIRMED=true. Offline validate remains independent of credentials. The configuration checks the approved main/shadow URLs and rejects additional migration directories, changed initial SQL or provider metadata. No reset, dev, diff, resolve, generation or db push/execute command is enabled.

The rehearsal log remains outside this repository and must not be renamed to Evidence 03. psql rehearsal did not create Prisma migration history. The real command to be recorded is:

```bash
./node_modules/.bin/prisma migrate deploy --config task-04-server-security/prisma/prisma.config.ts
```

Run the block below **only as the owner**, in an interactive WSL terminal with Node 24 available and private variables already exported. Do not print those variables or enable shell tracing. It refuses an existing Evidence 03 file, uses the rehearsed digest, runs a read-only empty-main-schema preflight, captures the real command with complete stdout/stderr and records individual exit statuses. Enter the **main assessment role's password** at psql prompts, not the shadow password. No password is placed in argv or a log. Prisma uses the privately exported URL.

The native psql checks use the validated local main host/port, a clean environment and fixed database/role; they cannot use inherited hostaddr/service/password overrides. They use loopback sslmode=disable, as the rehearsal did. They perform SELECT/catalog checks inside read-only transactions and never query Task Two objects. Do not edit SQL/configuration or run another migrator during this operation.

```bash
bash <<'TASK04_INITIAL_DEPLOY'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
export TASK04_INITIAL_DEPLOY_CONFIRMED=true
task04_evidence='task-04-server-security/evidence/03-initial-migration.txt'
if [[ -e "$task04_evidence" || -L "$task04_evidence" ]]; then
  printf 'STOP: Evidence 03 already exists; do not overwrite it.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$task04_evidence") || exit 1
(
  printf 'EVIDENCE 03 - genuine initial Task Four Prisma migration\n'
  date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
  printf 'Target: stitchtrack_assessment / task04_test / stitchtrack_task04_test_app\n'
  sha256sum task-04-server-security/prisma/migrations/20261028_task04_initial/migration.sql
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'TASK04_CONFIG_CHECK'
import { taskFourDatasource, assertTaskFourInitialDeploy } from './task-04-server-security/prisma/config.ts';
taskFourDatasource();
assertTaskFourInitialDeploy();
console.log('Dedicated configuration and rehearsed migration checks passed.');
TASK04_CONFIG_CHECK
  task04_config_status=$?
  printf 'configuration_exit_status=%s\n' "$task04_config_status"
  if (( task04_config_status != 0 )); then exit "$task04_config_status"; fi
  task04_psql_host="$TASK04_EXPECTED_HOST"
  if [[ "$task04_psql_host" == '[::1]' ]]; then task04_psql_host='::1'; fi
  task04_readonly_psql() {
    /usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 \
      PGCLIENTENCODING=UTF8 PGPASSFILE=/dev/null \
      /usr/lib/postgresql/16/bin/psql --no-psqlrc --password \
      --host="$task04_psql_host" --port="$TASK04_EXPECTED_PORT" \
      --dbname=stitchtrack_assessment --username=stitchtrack_task04_test_app \
      --set=ON_ERROR_STOP=on --set=VERBOSITY=verbose --pset=pager=off --echo-all --file=-
  }
  printf 'READ-ONLY preflight on intended assessment target (main-role password).\n'
  task04_readonly_psql <<'TASK04_MAIN_PREFLIGHT'
BEGIN READ ONLY;
DO LANGUAGE plpgsql $preflight$
BEGIN
  IF pg_catalog.current_database() <> 'stitchtrack_assessment'
      OR CURRENT_USER <> 'stitchtrack_task04_test_app' THEN
    RAISE EXCEPTION 'Unexpected main migration verification target/role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner
    WHERE n.nspname='task04_test' AND r.rolname=CURRENT_USER
  ) THEN RAISE EXCEPTION 'Expected main schema ownership is absent'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='task04_test'
  ) THEN RAISE EXCEPTION 'Main schema is not empty: stop and inspect, never auto-retry'; END IF;
END;
$preflight$;
SELECT pg_catalog.current_database() AS database, CURRENT_USER AS role;
COMMIT;
TASK04_MAIN_PREFLIGHT
  task04_preflight_status=$?
  printf 'preflight_exit_status=%s\n' "$task04_preflight_status"
  if (( task04_preflight_status != 0 )); then exit "$task04_preflight_status"; fi
  printf 'Command: ./node_modules/.bin/prisma migrate deploy --config task-04-server-security/prisma/prisma.config.ts\n'
  ./node_modules/.bin/prisma migrate deploy --config task-04-server-security/prisma/prisma.config.ts
  task04_deploy_status=$?
  printf 'deploy_exit_status=%s\n' "$task04_deploy_status"
  if (( task04_deploy_status != 0 )); then
    printf 'STOP: preserve this actual failure; no retry/reset/resolve.\n' >&2
    exit "$task04_deploy_status"
  fi
  printf 'READ-ONLY post-migration verification (main-role password).\n'
  task04_readonly_psql <<'TASK04_MAIN_VERIFY'
BEGIN READ ONLY;
DO LANGUAGE plpgsql $verify$
BEGIN
  IF pg_catalog.current_database() <> 'stitchtrack_assessment'
      OR CURRENT_USER <> 'stitchtrack_task04_test_app' THEN
    RAISE EXCEPTION 'Unexpected verification target/role';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='task04_test'
      AND tablename IN ('User','Session','PaymentIntent','PaymentAttempt','Payment','RetrievalDocument','RetrievalChunk')) <> 7 THEN
    RAISE EXCEPTION 'Expected seven lab tables are missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='task04_test'
      AND table_name IN ('User','Session','PaymentIntent','PaymentAttempt','Payment','RetrievalDocument','RetrievalChunk')) <> 41 THEN
    RAISE EXCEPTION 'Expected 41 transitional columns';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='task04_test'
      AND table_name='User' AND column_name='name') THEN RAISE EXCEPTION 'User.name must still be absent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "task04_test"."_prisma_migrations"
      WHERE migration_name='20261028_task04_initial'
      AND checksum='1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Expected successfully applied initial migration/checksum is absent';
  END IF;
END;
$verify$;
SELECT tablename FROM pg_catalog.pg_tables
WHERE schemaname='task04_test' ORDER BY tablename;
SELECT table_name, count(*) AS columns FROM information_schema.columns
WHERE table_schema='task04_test' AND table_name <> '_prisma_migrations'
GROUP BY table_name ORDER BY table_name;
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
FROM "task04_test"."_prisma_migrations" ORDER BY started_at;
SELECT indexname, indexdef FROM pg_catalog.pg_indexes
WHERE schemaname='task04_test' AND tablename <> '_prisma_migrations' ORDER BY indexname;
SELECT c.conname, c.contype FROM pg_catalog.pg_constraint c
JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
WHERE n.nspname='task04_test' AND r.relname <> '_prisma_migrations' ORDER BY c.contype,c.conname;
COMMIT;
TASK04_MAIN_VERIFY
  task04_verify_status=$?
  printf 'verification_exit_status=%s\n' "$task04_verify_status"
  if (( task04_verify_status != 0 )); then
    printf 'STOP: deploy may already be committed; preserve output, do not rerun.\n' >&2
    exit "$task04_verify_status"
  fi
) 2>&1 | tee -a "$task04_evidence"
task04_pipeline_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" >> "$task04_evidence"
task04_status_append=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' \
  "${task04_pipeline_status[0]}" "${task04_pipeline_status[1]}" "$task04_status_append" "$task04_evidence"
if (( task04_pipeline_status[0] != 0 || task04_pipeline_status[1] != 0 || task04_status_append != 0 )); then
  printf 'STOP: preserve evidence and inspect actual state; no automatic retry/reset/history edits.\n' >&2
  exit 1
fi
TASK04_INITIAL_DEPLOY
```

A successful post-check lists **seven lab tables plus Prisma's tracking table**, not eight domain tables. Review the printed index/constraint definitions against 20 lab indexes, 7 FKs and 14 CHECKs; missing deferred triggers/immutability are still not claimed. Verification only reads task04_test metadata/history, not Task Two data. Independent Task Two baseline comparison, if needed, remains an owner action through its proper authorized identity.

If any phase fails, preserve 03-initial-migration.txt unchanged and report which recorded status failed. A configuration/preflight failure means deployment was not attempted; zero deploy status followed by failed verification/capture can mean the migration is already committed. Never delete the file, automatically rerun deploy, reset, resolve, edit SQL or mark history applied to make the evidence look successful. A later reviewed investigation may produce a separate supplementary log. No output has been fabricated or captured by the agent.

## Isolated migration history and preserved SQL

The dedicated config uses only task-04-server-security/prisma/migrations and the guarded main URL with schema=task04_test. Prisma must record the initial migration in task04_test._prisma_migrations, not public._prisma_migrations. The SQL itself does not manage history. migrate deploy does not reset or replay the shadow; the owner-reported shadow result is a prior test of this identical SQL, not proof that the main application has happened.

Preserve migration name 20261028_task04_initial and SQL checksum 1b2b7b3a988511ac6b73e7f82092e0a31807cb84ad3b385e896da7b0b0a88501 permanently after application. The deploy gate currently allows only that one reviewed migration and provider metadata; a new migration needs separate approval and a deliberate guard update, not an edited initial file. Do not copy shadow history, use root configuration or weaken role/schema checks. Credentials remain private and no real product records are introduced.

## Later Evidence 04-06 - plan only

| Required record | Genuine sequence to prepare and run later |
| --- | --- |
| **04 - required-column failure, TXT** | After genuine initial migration and separate approval, create a small known set of synthetic User rows. Capture the populated-table query/count and the actual attempt to add name TEXT NOT NULL without a default. Preserve the command, full PostgreSQL error and post-failure state. Label whether this was a direct DDL migration attempt or a Prisma migration failure; do not substitute a warning or invented output. Keep deliberate failed candidate SQL separate from the successful active migration chain until its recovery approach is reviewed. Never edit the initial migration. |
| **05 - nullable/backfill/required, TXT** | Prepare reviewed forward operations to add name nullable, backfill deterministic synthetic names for existing IDs, verify no NULL/blank values remain, then set NOT NULL (and the final nonblank check). Capture all three operations and actual results separately, including schema nullability and row values/counts after each stage. Preserve rows and update the isolated Prisma model only in that later approved slice. A single unexplained final table screenshot is insufficient. |
| **06 - runtime drift and correction, TXT** | After name is real and a separately approved, isolated read-only Prisma client exists, capture a successful synthetic User read selecting name. Owner deliberately renames that lab column to name_drift_demo without altering the model/history, then repeats the exact client query and captures the actual runtime missing-column error and full output. Restore the original column name, repeat the same query successfully and verify final schema/history agreement. No reset, deleted migration or replay prompt substitutes for the runtime failure. Use only task04_test.User; keep Task Two untouched. |

The drift client/command does not exist yet: no generator, client or database query was added here. Expected error classes are planning expectations, not evidence. These future steps require their own reviewed commands, owner execution and authentic logs. If the assessor specifically requires a Prisma-recorded failed migration for Evidence 04, agree the isolated failed-history/recovery procedure before execution rather than relabelling a direct SQL error.

Keep financial and retrieval tables empty until their deferred consistency/immutability and writer controls are approved and installed. The User-only migration exercises need no payment/retrieval writer or real authentication. Evidence 03 is now complete; Evidence 04-06 requires its own actual owner runs and captures. The detailed Evidence 04 preparation is in [required-column failure](required-column-failure.md). Neither optional rehearsal logging nor a source-only test completes them.
