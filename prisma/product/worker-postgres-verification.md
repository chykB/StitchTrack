# Owner-only PostgreSQL worker verification

**Owner-executed PostgreSQL checks passed; results reported by the owner.** The agent did not execute or independently reproduce them. [Harness](../../tests/product-auth/worker-postgres.integration.mjs) uses real pg.Client sessions only when the owner explicitly invokes it. No worker, mailer, decryption, SMTP or authentication service is called. It loads no dotenv/private file and accepts only stitchtrack_product_test / stitchtrack_product_test_app / 127.0.0.1:5432 / product. No migrations, grants or data are committed by the harness.

## Confirmed owner results

All stages used only stitchtrack_product_test; no worker or SMTP dispatch was performed.

| Stage | Actual owner-reported result | Scope |
| --- | --- | --- |
| 1: before grant | test=0, capture=0; advisory-lock contention, explicit unlock, owning-session shutdown and targeted connection loss passed. Unauthorized operations returned SQLSTATE 42501. | Historical synthetic Terms-fixture jobs were excluded; application state was unchanged and connection cleanup completed. |
| 2: additive permissions | Owner executed worker-permissions.sql; PostgreSQL reported BEGIN, DO, GRANT, COMMIT. | Test runtime received the reviewed additive grants; this does not establish development permissions. |
| 3: after grant | test=0, capture=0; lock and permission checks passed. Competing reservation returned SQLSTATE 55P03; a stale reservation updated zero rows. | Probe changes were rolled back; application state was unchanged and connection cleanup completed. |

These are supplied result summaries, not invented raw log transcripts. Preserve the owner's original logs; their paths were not supplied here. No committed two-session reservation race, eligible worker dispatch or actual worker SMTP delivery has been demonstrated. Transport Evidence 16/17 is separate from worker delivery.

The commands below are the retained reproducibility procedure, **not instructions to repeat completed stages**. Stage 1 now correctly refuses the already-granted state; do not revoke grants to recreate it. Any new test needs separate authorization and review of current state.

## Scope and prerequisites

Quiesce all other product-test runtime sessions and workers first. Do not use the development/migrator/assessment URL. Existing integration fixtures remain historical records; no approved Terms, new accounts, new tables or secret keys are created. At least one historical synthetic Terms-fixture job must exist; the after-grant reservation probe additionally needs a pending one with attemptCount<3. If missing, stop for separate fresh-fixture authorization, not automatic seeding or altering eligibility.

The connection-loss test deliberately terminates **only its own marked, same-role test connection** with pg_terminate_backend(pid,5000). It verifies database/user/application marker/backend type and excludes the calling backend. Normally PostgreSQL permits termination of another session owned by the same role. If execution is denied, report that limitation and stop; do not add administrator/pg_signal_backend privileges as a workaround. Owner approval of this test includes terminating that one harness-created session, never an existing worker or another user's backend.

| Check | Before additive grant | After additive grant |
| --- | --- | --- |
| Two distinct backend sessions contend for the exact worker advisory key | Required | Repeated |
| Explicit unlock, intentional session end and loss of our marked owning session release the lock | Required | Repeated |
| Actual denied SQL for email/identity/credential/Terms/session/history operations | Required, SQLSTATE 42501 | Must remain denied |
| Outbox attemptCount/availableAt/sentAt UPDATE privileges | Must all be absent; real reservation denied | Must all be present; other outbox columns remain protected |
| Historical synthetic-fixture exclusion | Shared production Terms predicate must reject all matching fixture jobs | Repeated; no dispatch attempted |
| Reservation row contention and stale-token refusal | Deferred: updates not permitted | Real SQL, explicit transactions, always rolled back |
| Post-test counts/outbox metadata and session cleanup | Required | Required |

## What the rollback test proves

The after-grant probe temporarily updates one synthetic pending job's reservation metadata inside connection A's open transaction. Connection B attempts the **exact same production reservation SQL**, receives real PostgreSQL lock_timeout SQLSTATE 55P03, and rolls back. A repeats the stale token and must update zero rows. A also checks sentAt UPDATE permission with sentAt=NULL; it never marks a message sent. A then rolls back. All probes, including unexpected permission successes, are protected by rollback/savepoints. There is no COMMIT, automatic repair, deletion or reseed.

This demonstrates native row contention and compare-and-set predicate behavior, **not** a committed two-session winner/loser result after the first commit. That stronger test needs a separately authorized disposable committed fixture and cleanup protocol; committing edits to historical jobs merely to get such a result is deliberately avoided. These are database-mechanics probes, not permission to dispatch an ineligible job or bypass production eligibility. Positive eligibility, payload handoff, sent-state recording and end-to-end worker SMTP require approved operational Terms or a separately reviewed fresh test protocol; none is fabricated here.

The harness compares all eight table counts and all outbox status/count/availability/update/sent metadata before/after probes. It prints no rows, email addresses, password hashes, OTPs, keys, credentials or URLs. PostgreSQL may still produce ordinary server logs, WAL/dead tuples/statistics for rolled-back work: application-state restoration is not a promise of zero physical trace. Owners must keep the test database quiescent for meaningful comparisons.

## Stage 1: completed before-grant owner procedure

Review source and the existing [worker runbook](email-worker.md). Use WSL Node 24 from the repository root. Enter the **runtime** URL privately with percent-encoded password; never paste it into a command, evidence or chat. Do not source .env.local.

```bash
cd /home/bmalik/stitchtrack
set +e
set +x
set -o pipefail
umask 077
unset PRODUCT_EMAIL_WORKER_ENABLED PRODUCT_MIGRATION_CONFIRMED PRODUCT_AUTH_INTEGRATION_CONFIRMED
export NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true PRODUCT_WORKER_PG_TEST_CONFIRMED=true
IFS= read -r -s -p 'Private isolated product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL || exit 1
printf '\n'
export PRODUCT_TEST_DATABASE_URL
worker_log=$(mktemp /tmp/stitchtrack-worker-before.XXXXXX.log) || exit 1
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/worker-postgres.integration.mjs --owner-test --before-grant 2>&1 | tee "$worker_log"
worker_status=("${PIPESTATUS[@]}")
printf 'test_exit_status=%s\ncapture_exit_status=%s\n' "${worker_status[0]}" "${worker_status[1]}" >> "$worker_log"
printf 'test=%s capture=%s log=%s\n' "${worker_status[0]}" "${worker_status[1]}" "$worker_log"
```

**Stop and review the genuine log.** Both statuses must be zero, each named assertion must have reached its PASS line, and the final cleanup completion must be present. Existing/partial additive grants cause the before mode to stop rather than revoke or repair them. Do not run after mode, apply SQL or invent missing output to make the baseline pass. Scratch logs are supplementary owner diagnostics, not automatically numbered assessment evidence.

On failure/interruption, preserve output. Open test transactions roll back and session locks disappear when connections close; the 60-second harness watchdog terminates a hung test process. Confirm no marked test backends remain before continuing. Never retry, reset, alter migration history or restore guessed row values automatically.

## Stage 2: completed test-only additive grant

The owner applied the reviewed [worker-permissions.sql](setup/worker-permissions.sql) after stage 1. Retained command; do not reapply as part of this documentation update:

```bash
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --file=prisma/product/setup/worker-permissions.sql
```

This separate command changes grants and is **not executed by the harness or agent**. It adds only UPDATE(attemptCount,availableAt,sentAt) on product.EmailOutbox to the test runtime. Preserve output/status and inspect actual ACLs; stop on failure. No development/assessment grant command is part of this test plan.

## Stage 3: completed after-grant owner procedure

Keep the privately supplied runtime environment from stage 1; never substitute the migrator URL. Use a new log:

```bash
worker_log=$(mktemp /tmp/stitchtrack-worker-after.XXXXXX.log) || exit 1
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/worker-postgres.integration.mjs --owner-test --after-grant 2>&1 | tee "$worker_log"
worker_status=("${PIPESTATUS[@]}")
printf 'test_exit_status=%s\ncapture_exit_status=%s\n' "${worker_status[0]}" "${worker_status[1]}" >> "$worker_log"
printf 'test=%s capture=%s log=%s\n' "${worker_status[0]}" "${worker_status[1]}" "$worker_log"
unset PRODUCT_TEST_DATABASE_URL PRODUCT_WORKER_PG_TEST_CONFIRMED
```

Stop for output review even on success. A passing run establishes only its named PostgreSQL mechanics/permission/exclusion/rollback assertions. It does not establish approved Terms, actual worker delivery, inbox arrival, exactly-once sending or Evidence 18 HTTP timings. Real worker execution remains a separate authorization.

Assumptions: none. The owner confirmed the target, ACL, same-role termination and fixture prerequisites for these runs; future state is not assumed. Evidence 18 prerequisites and the proposed timing procedure are recorded in the [worker runbook](email-worker.md#evidence-18-proposed-measurement-procedure).
