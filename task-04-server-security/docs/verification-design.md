# Verification delivery foundation

Status: existing product registration/verification transaction and encrypted outbox are retained. The owner reports genuine PostgreSQL integration exit status 0. The implementation slice added rendering and an injected SMTP boundary without agent-run database operations or sending. On 29 October 2026 the owner subsequently reported a genuine Gmail STARTTLS send and separate inbox confirmation; see [Evidence 17](../evidence/17-smtp-success.txt) and the preserved [Evidence 23 screenshot](../evidence/23-rendered-email.png). The supplied terminal output is an owner transcription, not an agent-run/raw terminal capture. The owner also reported a deliberate in-memory invalid-password test: Gmail returned EAUTH and StitchTrack exposed only email_delivery_unconfirmed; [Evidence 16](../evidence/16-smtp-failure.txt) preserves the supplied transcription. The owner reports the real App Password remained unchanged; the agent did not read private configuration. This documentation update leaves the [PRD](../../docs/PRD.md), [workflow](../../prisma/product/registration-workflow.md), applied migration and permission SQL unchanged; the owner-applied additive test worker grant is recorded below.

## SMTP boundary and dependency gate

[smtp.server.ts](../../lib/product-auth/smtp.server.ts) requires explicit configuration. Owner-installed Nodemailer **10.2.1** supplies the default SMTP factory and bundled TypeScript definitions; @types/nodemailer is neither needed nor installed by this slice. The binding compiles against its actual SMTPTransportOptions and createTransport/sendMail signatures. Transport injection remains available for offline tests. No dependency/lockfile change or provider selection was made here.

The factory uses the installed [Nodemailer SMTP API](https://nodemailer.com/smtp) and [message API](https://nodemailer.com/message). A reviewed server caller can construct createVerificationMailer(environment) without providing a factory. Module import and construction perform no transport creation, connection test or send; the default factory is called only inside an explicit sendVerification attempt. Tests cover injected transports and the real Nodemailer MIME pipeline with its external SMTP handoff stubbed and network connections blocked. This is not live SMTP evidence.

Required server-side variables (no values/default sender credentials are provided):

| Variable | Contract |
| --- | --- |
| PRODUCT_SMTP_HOST | Explicit DNS hostname, not an IP, localhost or connection URL. |
| PRODUCT_SMTP_PORT | Explicit integer 1-65535. |
| PRODUCT_SMTP_TLS_MODE | implicit or starttls; ports 465/587 must match their respective modes. |
| PRODUCT_SMTP_USERNAME / PRODUCT_SMTP_PASSWORD | Required nonblank, control-free credentials; accepted characters/spaces remain unchanged. |
| PRODUCT_SMTP_FROM_ADDRESS / PRODUCT_SMTP_FROM_NAME | Owner-approved single sender address and display name; no inferred legal/support identity. |

Credentials must be supplied privately through reviewed server configuration, never public NEXT_PUBLIC variables, Git or screenshots. The module reads only the passed configuration; it does not read dotenv files or create a global sender. TLS certificate verification, server-name verification and minimum TLS 1.2 are enforced. STARTTLS is required in starttls mode. No insecure/local plaintext transport is supplied.

Transport logging/debugging, pooling and file/URL content access are disabled. Connection/greeting/inactivity limits are 10/10/20 seconds; these are phase/inactivity limits, **not a guaranteed end-to-end deadline**. A worker still needs a wall-clock bound and a real connection-cancellation strategy, not an uncancelled Promise.race followed by another send.

The single-purpose message has explicit from/to/envelope addresses, branded HTML and plain text. The code is not placed in a subject or header. Native provider errors/replies/IDs/recipient lists never escape. Errors use fixed ProductAuthError codes: email_configuration_unavailable, email_invalid_message, email_delivery_rejected or email_delivery_unconfirmed. There are no automatic retries. An expired or more-than-five-minutes-away deadline is refused before transport construction; actual issue time and lifecycle eligibility remain the worker's responsibility.

## Acceptance and uncertainty

Accepted means this one intended recipient was reported accepted by the injected SMTP interface. It does not mean the recipient read the email, that it reached the inbox rather than spam, or that a later delivery failure cannot occur. Rejected recipients are not success. Missing, conflicting or unexpected result data fails closed.

A connection loss/timeout can happen after a server accepted a message. Such outcomes are unconfirmed, not proof of non-delivery. A crash after SMTP acceptance but before saving sent state can lead to a duplicate on retry. Stable Message-ID values may help diagnostics but do not make SMTP idempotent. No exactly-once promise is made.

## Worker mechanics verified; eligible dispatch not executed

The [worker design/runbook](../../prisma/product/email-worker.md) and [core](../../lib/product-auth/outbox-worker.server.ts) now implement one job per dedicated session with a session advisory lock, durable reservation/three-attempt budget, fresh lifecycle/decryption/handoff checks and conditional sent state. No database transaction spans SMTP. The explicit CLI has a process watchdog and remains disabled by default. Historical synthetic Terms-fixture jobs are excluded and untouched.

No additional schema migration was needed. The owner applied the guarded [additive grant](../../prisma/product/setup/worker-permissions.sql) to product_test and passed the [before/after PostgreSQL mechanics checks](../../prisma/product/worker-postgres-verification.md#confirmed-owner-results): lock contention/release/session loss, privilege denials, fixture exclusion, reservation contention/stale-token refusal and rollback/cleanup. This is distinct from eligible dispatch or SMTP. No committed two-session reservation race, eligible worker send or live crash-during-SMTP result is established. Definite rejection has bounded retries; uncertain outcomes stop automatic retries. Crash-after-acceptance duplicates remain possible.

## Owner-executed OTP results

The owner completed the [staged capture](verification-evidence.md) using existing service calls and real stitchtrack_product_test PostgreSQL, with synthetic Terms/records and no SMTP. The owner reports run_exit_status=0, capture_exit_status=0 and connection cleanup. The current files were visually inspected; this review did not reconnect to PostgreSQL or independently repeat the test.

| Evidence | Observed screenshot content and limit |
| --- | --- |
| [19: persistence](../evidence/19-verification-row.png) | Actual safe User/issuance/Verification/outbox columns: emailVerified=false, zero failed attempts, no consumption, stored challenge, pending unsent job and session_count=0. |
| [20: expiry](../evidence/20-verification-expired.png) | Correct stored code returned invalid after the issuance deadline on the real wall clock. User remains unverified, attempts=0, consumedAt=null, job cancelled and session_count=0. No timestamp rewrite or injected clock is used in this capture. |
| [21: incorrect codes](../evidence/21-verification-wrong-code.png) | Three invalid submissions show committed failedAttempts 1, 2, 3; the third cancels the job. The subsequent correct-code-after-exhaustion result is invalid and the user remains unverified. The frame crops lower tables; it is not a complete raw execution log. |
| [22: replay](../evidence/22-verification-code-reused.png) | First result verified, exact same in-memory code replay invalid; consumedAt is set, emailVerified=true, verificationId=null/library row absent and job cancelled. The banner states persisted state unchanged after replay. No OTP is printed. |

The final **all-four-stages completion banner was not found in the owner's filtered output**. It is not invented, quoted as present or inferred from zero exit status. The named screenshots and owner-reported statuses/cleanup support the specific observations above. Preserve an existing full log if available; no rerun is requested merely to manufacture a missing banner. Cleanup here means closing connections, not deleting committed fixtures.

The service commits wrong-code increments rather than throwing them away with rollback. Malformed or terminal/expired input is rejected before incrementing that budget. Three wrong attempts exhaust the issuance; a correct code afterward is refused. Successful verification locks the user and transactionally consumes the plugin challenge, verifies the user, records stable consumption and cancels pending mail. Verified/consumed state prevents replay. Sessions are forbidden by the service and integration assertions; a complete session-count row is not visible in every screenshot.

Better Auth verification.disableCleanup=true prevents lookup from sweeping unrelated expired Verification rows; targeted consumption remains enabled. Historical fixtures remain separate, and the original empty-database integration harness must not be rerun against the populated store. These captures prove internal service/database behavior, not public UI integration or email delivery. No real legal Terms acceptance is inferred from synthetic fixtures.

## Captured controlled HTTP comparison

[Evidence 18](../evidence/18-registration-timing-sync-vs-job.txt) contains five measured pairs after two warm-up pairs. Mean client HTTP duration was 454.119957 ms synchronously and 199.069349 ms in background mode, a recorded mean difference of 255.050608 ms. The log reports measurement/run/capture statuses zero and scratch/listener cleanup. [Timing details](email-timing.md) describe the actual workload.

Both modes used shared validation, Argon2id, crypto, rendering and a local-file commit; the controlled transport delay was configured to 250 ms. No SMTP, PostgreSQL registration or production worker was used. These are genuine measured local HTTP results, not real provider latency or an eligible end-to-end outbox result. The response completes after controlled transport in sync mode and after file commit before dispatch in background mode. Do not upgrade the scope when judging the assessment requirement.

## Remaining operational integration

Completed SMTP, OTP and worker-mechanics checks should be preserved rather than repeated solely to update documentation. Still required before related public use: reviewed frontend/backend registration, functional sign-in/recovery and verification-gated sessions; approved operational Terms; trusted shared account/IP abuse controls; and a separately authorized eligible-job worker/SMTP/crash-recovery protocol with matching keys and real delivery configuration. Public registration remains disabled. Any stricter assessment requirement for functional-auth timing needs assessor resolution or later explicitly authorized evidence, not relabelling Evidence 18.

The branded-email review and owner-supplied Evidence 23 are recorded in [email-copy.md](email-copy.md). Current offline tests exercise injected acceptance/rejection/error paths and content, not live SMTP, inbox placement or background timing. Real MIME serialization is now tested with an offline SMTP handoff stub.

Assumptions: none. Live SMTP use, provider/sender configuration and worker execution remain owner-controlled.
