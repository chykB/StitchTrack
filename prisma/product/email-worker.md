# Email outbox worker

Status: implemented and offline-tested; the owner subsequently passed the real PostgreSQL mechanics/permission verification before and after applying the test-only additive grant. No eligible worker dispatch or worker SMTP delivery has run. No worker, SQL grant, database operation or SMTP send was executed by the agent. The [PRD](../../docs/PRD.md), eight-model schema, applied migration and original permissions script are unchanged. Existing owner Evidence 16/17/23 is transport evidence, not worker evidence.

## Scope and activation

[Worker core](../../lib/product-auth/outbox-worker.server.ts) processes only tailor-verification-v1 using the existing encrypted outbox, keyed verifier, plugin Verification record and deliveryEligible. [CLI](../../scripts/email-outbox-worker.mjs) is inert on import. It requires exact --owner-run, PRODUCT_EMAIL_WORKER_ENABLED=true, PRODUCT_DATABASE_CONFIRMED=true and the existing reviewed development/test runtime URL/mode. Assessment/migrator/wrong targets, production mode and PostgreSQL option/service overrides are rejected. Actual connected database/role/namespace and role privilege flags are checked before locking or writing. No dotenv or .env.local file is read.

The query requires an approved/effective **nonfixture** Terms version and a tailor-registration acceptance recorded no later than job creation. Completed integration rows use synthetic-test/fixture Terms and are neither selected, dispatched nor cleaned up. Public policies remain unapproved; do not label fixtures approved or repurpose old rows to exercise the worker. Owner-authorized PostgreSQL worker testing needs a separately reviewed fresh-fixture procedure. Offline fixtures do not approve actual Terms.

## Claiming, safety and recovery

- One pass processes at most one job over a new dedicated pg.Client, never a pool or reconnecting session. A database-scoped session advisory lock (1398031176,1) excludes another verification dispatcher until the connection ends. This deliberately serializes the initial low-volume worker; separate dev/test databases have separate locks.
- Each query is autocommitted. There is **no BEGIN transaction during SMTP**. Before handoff, reserve an attempt and set availableAt 60 seconds forward using an atomic status/counter/availability comparison. Crashes spend that attempt; a replacement process waits until due and cannot reset the budget.
- Load fresh joined User, issuance, live Verification and outbox state before claim, after claim and again after decryption immediately before handoff. Apply deliveryEligible plus current vendor expiry, template, Terms, reservation ownership and recipient/HMAC checks. Only eligible jobs are decrypted. The owning session may substitute its recorded original eligibility time for its own reservation's future availableAt; other work cannot bypass the due-time gate.
- Confirmed SMTP acceptance alone permits a conditional sent update. sentAt/availableAt are aligned to the acknowledgement time, satisfying the existing SQL check even though reservation availability was future. Cancellation is never reopened; an accepted-but-cancelled race returns accepted_unrecorded without fabricating sentAt.
- Up to three dispatch attempts are permitted, separately from the OTP's three incorrect-verification attempts. Definite email_delivery_rejected outcomes retry after 15 and 30 seconds only while both challenge deadlines permit; no third retry. Unconfirmed/provider-thrown outcomes stop automatic retry with cancelled state, because mail may already have been accepted. Requesting a fresh code after operational review is separate from retrying an uncertain send.
- Expired, consumed, superseded, exhausted, verified-user or missing-challenge jobs are cancelled without sending. Unsupported templates and synthetic fixtures are untouched. Key/ciphertext/database errors stop the worker with a fixed error; they are not logged with payloads or native diagnostics. Current keys must match registration; CLI supports one active HMAC key and one active encryption key. Rotation/multiple historical keys require review before use.

Both unexpected PostgreSQL error **and end** events mark the dedicated session unusable and invoke the same fatal process exit once. Intentional client.end() marks the session closed first, so its end event and late errors do not trigger fatal handling. The session/lock is retained until the whole pass settles; the watchdog never returns an early timeout result that releases it while local SMTP continues.

Nodemailer 10.2.1 non-pooled close() is not an in-flight cancellation guarantee. The CLI therefore kills the **whole worker process** after a 30-second pass watchdog or unexpected PostgreSQL connection loss; it never releases a lock and continues a detached Promise.race send locally. Database statement/query/connect limits are five seconds, with two-second lock wait. SIGINT/SIGTERM request shutdown after the active pass, bounded by that watchdog. Successful passes poll after two seconds; a competing-worker busy result exits. No automatic process restart is installed.

The 30 seconds bound the **entire pass**, including database setup, claiming, SMTP and state persistence. SMTP configuration remains connectionTimeout=10s, greetingTimeout=10s and socketTimeout=20s. In installed Nodemailer 10.2.1 the greeting/setup allowance is bounded by the remaining connection deadline, while the socket limit is inactivity-based and can reset with traffic; these are not a total delivery deadline. A slow but otherwise healthy attempt can therefore be terminated by the stricter pass watchdog. Its timer is cleared on both pass completion and failure. Event-loop/OS suspension can delay a JavaScript watchdog; it is not external fencing or a hard real-time guarantee. The 60-second durable reservation remains unchanged.

Termination may happen **after Gmail accepted the message but before the application received/persisted acknowledgement**. Treat that state as uncertain; never infer that timeout means unsent. No sentAt is invented, and recovery may duplicate an accepted message.

There remains an unavoidable uncertainty window if the server accepted SMTP before a crash or before sent persistence. Recovery can send a duplicate; a database connection can also disappear before the application detects it. There is no exactly-once or inbox-delivery guarantee, nor a claim that cancellation recalls in-flight mail. Codes still cannot verify after their lifecycle ends. A worker outcome is only a fixed operational category; no OTP, recipient, credential, payload, key, raw provider reply or full connection URL is logged. Per-attempt history/failure reasons are not added to the schema; durable state is limited to its existing counter/status/times.

## Additive owner-only privileges

The existing runtime can already SELECT the relevant tables and update outbox status/updatedAt. [worker-permissions.sql](setup/worker-permissions.sql) adds **only UPDATE(attemptCount,availableAt,sentAt)** on product.EmailOutbox to the matching existing product runtime role. It verifies the exact restricted migrator, non-owning runtime, product ownership and successful reviewed initial migration. No identity/Terms/history privileges, role, table, trigger or migration is added. The existing runtime identity is reused for this small slice; a separately restricted worker principal remains a later operational option.

The owner has applied this script to stitchtrack_product_test and reported BEGIN, DO, GRANT, COMMIT. After-grant verification passed. Development grants are not confirmed. The retained command below documents the completed test stage; **do not reapply it merely to follow this runbook**:

```bash
cd /home/bmalik/stitchtrack
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --file=prisma/product/setup/worker-permissions.sql
```

Inspect actual grants and preserve failures; no automatic retry/reset. Development uses only its matching database/migrator after separate review. No existing assessment target is involved.

## Owner execution prerequisites, not current authorization

1. The owner completed the [staged PostgreSQL verification](worker-postgres-verification.md#confirmed-owner-results): before/after test=0 and capture=0; lock exclusion/release/session loss, SQLSTATE 42501 denials, fixture exclusion, 55P03 reservation contention and stale-token zero-row checks passed. Probe changes rolled back; state and connection cleanup checks passed. This is owner-reported real PostgreSQL evidence, distinct from injected tests. A committed two-session race, process crashes during SMTP and end-to-end cancellation/delivery remain untested; do not repeat completed checks to fill those gaps.
2. Privately supply existing runtime database/SMTP configuration plus PRODUCT_EMAIL_VERIFIER_KEY_ID/KEY and PRODUCT_EMAIL_OUTBOX_KEY_ID/KEY. Keys must be distinct 32-byte canonical base64 values matching registration; no values are supplied or read by this work. Never dispatch historical test jobs with guessed/replacement keys.
3. Review a fresh test-job procedure that preserves the synthetic-fixture exclusion. Then separately authorize any SMTP/worker execution and later deployment supervision. Approved operational Terms are still required for real registration; public onboarding stays disabled.

Only after those steps, the owner CLI invocation is:

```bash
PRODUCT_EMAIL_WORKER_ENABLED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/email-outbox-worker.mjs --owner-run
```

The command **connects, writes and may send mail** when all prerequisites are met. It was not run. No npm/startup hook, route or background scheduler enables it automatically. Evidence 18 remains pending; the completed PostgreSQL mechanics checks do not supply its HTTP timings.

## Evidence 18: proposed measurement procedure

The owner approved a separate [controlled loopback HTTP benchmark](../../task-04-server-security/docs/email-timing.md). It is owner-captured in [Evidence 18](../../task-04-server-security/evidence/18-registration-timing-sync-vs-job.txt), with five measured pairs and zero recorded run/capture statuses. Its controlled scope is unchanged. **Public Terms approval is not a prerequisite for this isolated experiment.** It creates no account, Terms acceptance or production outbox job and never calls the real worker or modifies its eligibility predicate.

Both modes reuse shared validation, Argon2id, HMAC/AES-GCM and branded rendering. They publish the same private synthetic record with a real local-file commit. Sync waits for controlled transport completion before HTTP 202; background finishes HTTP 202 after file commit, then dispatches on a later event-loop turn. The 250 ms injected delay is explicitly not SMTP. Repeated actual HTTP/phase timings, background completion and summary arithmetic are captured in the owner log; no results were generated by this documentation update.

This measures scheduling/response boundaries, not PostgreSQL registration performance, durable production recovery, SMTP acceptance or eligible worker delivery. The [capture runbook](../../task-04-server-security/docs/email-timing.md#owner-only-capture) explains evidence scope, cleanup and remaining end-to-end requirements. Approved Terms remain an operational registration/production eligibility requirement, not a condition for running this separate synthetic benchmark.

## Evidence 23 publication check

The current [rendered-email screenshot](../../task-04-server-security/evidence/23-rendered-email.png) was visually inspected during documentation completion. The sender/recipient addresses and synthetic code are now obscured. The earlier unredacted warning described the previous file state, not the current image. No image was changed by the agent. Preserve owner provenance and review all evidence privately before commit; visual inspection is not a guarantee about metadata or earlier Git copies.

Assumptions: none. The isolated controlled benchmark is approved for preparation; its owner measurements are now captured in the controlled scope above. Live worker activation, operational Terms/fresh-record setup and SMTP side effects remain subject to separate owner approval.
