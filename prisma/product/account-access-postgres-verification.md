# Owner-only account-access PostgreSQL proof

Status: **owner-executed PostgreSQL proof and separate cleanup completed** for run
`a02fc98d-905c-4f0b-a0f6-b9b721869d1d`. The results below are owner-reported; the agent
has not rerun the proof or created a transcript, screenshot or evidence artifact.

## Confirmed owner results

| Check | Owner-reported result |
| --- | --- |
| Read-only preflight | Database, migration and permission checks passed. |
| Login first | Locking revoked the newly committed session. |
| Lock first | PostgreSQL-blocked login was rejected after locking committed. |
| Simultaneous login/locking | No valid session survived the committed lock. |
| Deletion locking and fresh lookup | Two sessions revoked; fresh lookup rejected locked accounts. |
| Transaction failure | Status changes and session revocation rolled back together. |
| Pre-commit connection termination | No cookie returned; uncommitted session rolled back. |
| Isolation and shutdown | Ten historical users, historical authentication records and unrelated fixture data preserved; all proof connections closed. |
| Proof status | `account_proof_exit=0`. |
| Separately authorized cleanup | Eight synthetic User, eight Account and three Session records removed; ten baseline users retained; COMMIT succeeded; `account_cleanup_exit=0`. |

This establishes the internal service/PostgreSQL checkpoint, not browser authentication,
a complete deletion workflow or behavior after a lost COMMIT acknowledgement. The
procedures below are retained for review of the completed run; **do not rerun them** to
recreate evidence or repeat the completed cleanup.

## Scope and safeguards

[Harness](../../tests/product-auth/account-access.integration.mjs) is default-inert and
accepts only `--owner-integration`, explicit confirmation and the existing dedicated
product-test URLs. It rejects production/development/assessment targets, debug/preload
settings, PostgreSQL overrides, workers and HTTP activation. The
[manifest](migration-files.ts) verifies all three exact applied SQL files/checksums.
No applied SQL, privileges, authentication service or evidence is changed by this proof.

A runtime control connection checks its actual identity and acquires a proof-specific
(global for this harness) session advisory lock before publishing the nonsecret run UUID.
A **separate migrator connection runs only BEGIN READ ONLY / SELECT / COMMIT or ROLLBACK**:
it verifies all three successful migration records/checksums, product-only owned schema
and history, two nullable precision-3 flags, effective runtime privileges and exactly ten
users, then closes before fixture writes. Runtime history privileges are not broadened.
Two independently constructed Prisma pools (`max:1`) plus the control connection must
have distinct backend PIDs. All use only `stitchtrack_product_test` and exact existing
roles. Development and both assessment databases are excluded.

Eight fresh `al-proof-<run_id>-<case>` User/credential pairs are created atomically, with
exact synthetic names/emails and no upsert/overwrite. IDs/emails are collision-checked;
18 users are expected during proof and ten after separate cleanup. These are explicitly
session-test fixtures with verified/unverified flags, **not registration, OTP delivery or
approved Terms acceptance evidence**. No Terms, Verification, outbox or rate-bucket fixture
is created. Passwords use the existing Argon2id utility; exact characters and 600-second
fixed test sessions are preserved, without changing the approved seven-day tailor policy.

Mutation fences reject historical targets and unexpected raw/model writes before forwarding
unchanged SQL to real Prisma. A fixture-only lifecycle authorizer checks the exact run
identity, display-name/email markers, credential relationship and permitted operation.
Column UPDATE grants are not administrative authorization. No real administrative role,
self-deletion policy or production permission is inferred from the test authorizer.

Historical rows across all nine product tables are fingerprinted **inside PostgreSQL**;
only SHA-256 row digests return to memory. Credentials, tokens, verifiers and payloads are
not returned for snapshots, printed or saved. Fingerprints exclude only the new User,
Account and Session fixture rows; unrelated fixture User/Account/Session fingerprints are
also compared. SHA-256 is used for integrity snapshots, never credential storage. Pause
all other product-test writers until cleanup; a changed baseline fails the proof.

## Real concurrency and failures

| Case | Real PostgreSQL mechanism exercised |
| --- | --- |
| Login first | Pause after the real User FOR UPDATE succeeds; start locking on the other connection; require `pg_blocking_pids` to show that waiter; release login and verify locking revokes its new session. |
| Lock first | Hold its real User lock; start login and observe actual PostgreSQL blocking; release locking to commit and require waiting login refusal. |
| Simultaneous | Release both independent calls together; allow either ordering, but require successful lock, zero surviving sessions and refusal of later login. |
| Deletion request | Two genuine service-created sessions are revoked; new login and old cookie lookups fail. |
| Fresh state | Reinsert only the same run's own retired Session as a legacy fixture; its old cookies still fail while that row exists. This is a deliberate fixture mutation, not normal session issuance after locking. |
| Transaction failure | Confirm status update and session deletion occurred within the actual tx, request failing `SELECT 1 / 0`, then verify both rolled back and the earlier session remains usable. |
| Login commit failure | After the real callback has prepared a cookie and inserted an uncommitted session, terminate only its same-role, exact-run backend; require no cookie returned and no persisted session. |
| Isolation | Compare ten historical users/all historical authentication rows, plus the unrelated fixture user, credential and live session. |

Test facades add barriers, mutation fences and fault scheduling, **not mocked transaction
results**. Actual services use their transaction-bound Better Auth/Prisma implementation.
Barrier observations are bounded to 1.2 seconds, below the service's three-second row-lock
timeout; pending operations are released and drained on failure. No production timeout is
increased to make a test pass. Host/load delays may make the proof inconclusive; stop for
review rather than rerunning automatically.

The commit test uses actual `pg_terminate_backend(pid,1000)` with checks for database,
same runtime role, exact run application_name, backend start time and exclusion of the
control PID. No caller-supplied PID or historical connection may be terminated. This
proves failure to commit after a **pre-commit disconnect**. It does not demonstrate a
lost acknowledgement after a possibly successful COMMIT, nor a deferred-constraint COMMIT
rejection. The existing offline uncertainty test remains separate. No new database
objects, TEMP permission, pg_signal_backend role or elevated privilege is requested.

## Retained owner execution procedure (completed)

The completed procedure used WSL Node 24 in `/home/bmalik/stitchtrack`, with other test
writers paused. The agent has not executed these commands. The harness checks effective permissions before fixtures;
if a required grant or builtin function is unavailable, stop and review the failure.
Do not grant broader rights solely to force a pass.

No log, archive or private cleanup-manifest file is created. Observe the terminal stage
messages, retain the nonsecret `run_id` and actual exit status, and share only that safe
output. Never enable tracing or print environment variables, cookies or row contents.

```bash
cd /home/bmalik/stitchtrack
set +x
set +e
read -r -s -p 'Private product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL </dev/tty
printf '\n'
read -r -s -p 'Private product-test migrator URL (read-only preflight): ' PRODUCT_TEST_MIGRATION_DATABASE_URL </dev/tty
printf '\n'
if [ -n "$PRODUCT_TEST_DATABASE_URL" ] && [ -n "$PRODUCT_TEST_MIGRATION_DATABASE_URL" ]; then
  env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test \
    PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
    PRODUCT_ACCOUNT_ACCESS_PROOF_CONFIRMED=true \
    PRODUCT_TEST_DATABASE_URL="$PRODUCT_TEST_DATABASE_URL" \
    PRODUCT_TEST_MIGRATION_DATABASE_URL="$PRODUCT_TEST_MIGRATION_DATABASE_URL" \
    node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/account-access.integration.mjs --owner-integration
  account_proof_exit=$?
  printf 'account_proof_exit=%s\n' "$account_proof_exit"
else
  printf 'Proof not started: both private URLs are required.\n'
fi
unset PRODUCT_TEST_DATABASE_URL PRODUCT_TEST_MIGRATION_DATABASE_URL
```

Require all actual checks, successful resource shutdown and exit **0**. A PASS banner
alone is insufficient. Migrator/runtime errors are sanitized; no private values appear
in failure output. On interruption or failure, retain the run ID/last stage and stop;
no automatic retry, reset, migration-history edit, historical restore or cleanup runs.
Fixture setup is atomic: zero or eight pairs may remain. Wait for every proof connection
to close before separately reviewing cleanup. Missing run ID or partial/unexpected state
requires owner investigation, not wildcard deletion.

## Retained separately authorized cleanup procedure (completed)

[Cleanup SQL](setup/account-access-test-cleanup.sql) requires the exact restricted test
migrator, all three successful checksums, product ownership, `cleanup_confirmed=yes` and
a valid v4 run UUID. It derives only the eight fixed keys; no SQL/key list/PID is accepted.
A matching advisory transaction lock and `pg_stat_activity` reject a still-running proof.
It locks the derived User rows, checks exact names/emails/credential relationships,
absence of Terms/issuance links, digest-only sessions and the ten-user baseline. Zero or
all eight fixtures are accepted; unexpected partial state or new unrelated users aborts.
Only their Session, Account and User rows are deleted, with counts and zero-remnant checks
before one COMMIT. Nothing in this script grants privileges or touches assessment data.

After reviewing the proof result and confirming all connections closed, run separately:

```bash
cd /home/bmalik/stitchtrack
set +x
set +e
read -r -p 'Reviewed account proof run UUID: ' ACCOUNT_PROOF_RUN </dev/tty
env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --set=run_id="$ACCOUNT_PROOF_RUN" --set=cleanup_confirmed=yes \
  --file=prisma/product/setup/account-access-test-cleanup.sql
account_cleanup_exit=$?
printf 'account_cleanup_exit=%s\n' "$account_cleanup_exit"
unset ACCOUNT_PROOF_RUN
```

Require the actual exact-run removal counts, COMMIT and exit 0. A fresh completed proof
normally leaves eight pairs; zero removed pairs after a reported complete proof is a
discrepancy to investigate. Session counts depend on reached stages; do not invent them. On failed/uncertain cleanup, preserve observed output and inspect before
any next action. Never change guards, delete by prefix, reset databases, alter the ten
historical users, purge historical sessions or rerun a proof to manufacture success.

The account-locking PostgreSQL checkpoint and exact-run cleanup are **complete for the
reported run**. HTTP/HTTPS browser evidence, production administrative authorization,
deletion reauthentication, restoration/audit/retention and pending OTP/email policy remain
separate work. A lost acknowledgement after a possibly successful COMMIT remains untested.
