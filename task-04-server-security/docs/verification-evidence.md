# Evidence 19-22: owner-only OTP persistence and lifecycle capture

**Owner executed; screenshots 19-22 present.** Owner reports run_exit_status=0, capture_exit_status=0 and connection cleanup. The final all-four-stages banner was not found in filtered output and is not claimed. See [current results and provenance](verification-design.md#owner-executed-otp-results). The agent did not execute this procedure. The [capture script](../experiments/verification-evidence/capture.mjs) calls the existing [registration/verification service](../../lib/product-auth/registration.server.ts) against real PostgreSQL. It adds no verification mechanism, HTTP endpoint, UI, migration or SMTP. Capture the genuine terminal/database projections as PNGs yourself; no image or result is generated in advance.

## Already established versus new evidence

The owner reported exit status 0 from the original [integration harness](../../tests/product-auth/registration.integration.mjs), covering atomic registration/verification, wrong-attempt budget, consumption/replay and zero sessions. Its expiry/cooldown cases advanced an injected test clock. That is not an actual five-minute wait or a substitute for the required screenshots. **Do not rerun that harness:** it requires empty product tables and historical fixtures now exist.

This fresh capture uses the same services and restricted product-test runtime, three new unique synthetic users, and an existing unapproved isTestFixture Terms version. It does not approve Terms or modify historical acceptances. The existing test-only HIBP stub is used; external fetch is blocked. In-memory keys decrypt only jobs created in this process; no private configuration or historical encrypted payload is read.

A necessary preservation correction sets Better Auth verification.disableCleanup=true in the existing service. Installed 1.7.7's findVerificationValue otherwise sweeps **all expired Verification rows**, even on a different user's OTP lookup. Targeted consumption still deletes its own challenge; retention is left to a future explicit process. The offline regression proves the service/library configuration against the transaction double, not PostgreSQL. Fresh owner execution is still required.

## Captured stages and retained procedure

| Stage / owner PNG | Real operation and expected observation |
| --- | --- |
| 19: evidence/19-verification-row.png | Register one fresh synthetic unverified account through the real service. Display selected columns of its actual User, EmailVerificationIssuance, Verification and EmailOutbox rows: unverified, attempts=0, unconsumed, challenge present, pending job, no send/session. IDs and timestamps are safe; identifier/value/verifier/credential/encrypted-payload columns are omitted entirely. |
| 20: evidence/20-verification-expired.png | After owner confirmation, wait until the **stored issuance expiry has passed on the real wall clock** (about five minutes from registration). Submit the original correct in-memory code. Expect invalid, emailVerified=false, consumedAt=null, attempts=0 and cancelled pending mail. No injected clock, timestamp rewrite or SMTP is used. |
| 21: evidence/21-verification-wrong-code.png | Create a fresh account now, so the previous wait cannot expire this test. Submit a well-formed six-digit string guaranteed to differ from its code three times. Expect invalid and committed failedAttempts 1, 2, 3; the third cancels the job. Then submit the correct code: still invalid, attempts remains 3, no verification/session. Codes are withheld from all output. |
| 22: evidence/22-verification-code-reused.png | Create another fresh account, verify with its real in-memory code, then submit that exact same code again. Expect verified then invalid, persisted emailVerified=true and consumedAt set, verificationId=null/removed library challenge, cancelled job and zero sessions. Safe database state must be identical before/after replay. |

Each screenshot must show the stage label, actual result where applicable and safe database state. Resize the terminal or reduce its font enough to include relevant rows; avoid cropping away the result/counter/expiry context. If one frame cannot fit, preserve an additional genuine frame, without compositing or fabricated output. Never run SELECT * or open raw credential/challenge/outbox records in a database GUI for the capture. A screenshot of this table is not evidence.

The evidence is an **internal application-service/PostgreSQL test**, not public verification UI, SMTP delivery or complete client authentication. No automatic sign-in/session is expected even on success. The stored product issuance counter is authoritative for wrong-code attempts; Better Auth's own serialized counter need not mirror it. Malformed input, expired/consumed/superseded/exhausted challenges and already-verified users are refused before that wrong-code counter increment. Successful verification is locked and transactional: the library consumes its challenge, User becomes verified, the stable issuance records consumption and queued mail is cancelled together. Replay is refused by the verified-user/terminal-state gates without a new session.

## Preconditions and exact owner command

Review the new code and authorize its fresh writes first. Use only stitchtrack_product_test, stitchtrack_product_test_app, product, 127.0.0.1:5432. The current restricted runtime permissions already cover the necessary operations; **no new grant, migrator URL or migration is needed**. DDL, Terms approval/rewriting and Session INSERT must remain unavailable. Existing synthetic Terms must exist; otherwise stop for separate fixture review, not seeding. Quiesce other product-test tests/workers; never run a worker during this procedure.

Use an **interactive WSL Bash terminal**, Node 24, from the repository root. Run these lines interactively, not with a Bash heredoc or piped stdin: the Node process needs terminal input for each stage's authorization. Do not source .env.local, pass a URL argument or turn shell tracing on.

```bash
cd /home/bmalik/stitchtrack
set +e
set +x
set -o pipefail
umask 077
unset PRODUCT_EMAIL_WORKER_ENABLED PRODUCT_MIGRATION_CONFIRMED PRODUCT_AUTH_INTEGRATION_CONFIRMED PGOPTIONS PGSERVICE PGSERVICEFILE
export NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true PRODUCT_OTP_EVIDENCE_CONFIRMED=true
IFS= read -r -s -p 'Private product-test runtime URL: ' PRODUCT_TEST_DATABASE_URL || exit 1
printf '\n'
export PRODUCT_TEST_DATABASE_URL
otp_log=$(mktemp /tmp/stitchtrack-otp-capture.XXXXXX.log) || exit 1
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/verification-evidence/capture.mjs --owner-capture 2>&1 | tee "$otp_log"
otp_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${otp_status[0]}" "${otp_status[1]}" >> "$otp_log"
printf 'run=%s capture=%s log=%s\n' "${otp_status[0]}" "${otp_status[1]}" "$otp_log"
unset PRODUCT_TEST_DATABASE_URL PRODUCT_OTP_EVIDENCE_CONFIRMED
```

**Historical capture instructions, already executed:** after review/authorization, the command above was used; it creates only the first fresh subject, displays Evidence 19's safe rows and pauses. Personally save 19-verification-row.png. Type continue-20 only after reviewing that capture. Likewise continue-21 and continue-22 authorize the subsequent new cases. Type stop to end early. Stage 20 deliberately waits for the real stored deadline; later cases are registered only after their respective confirmation.

The script refuses these four screenshot filenames if they already exist before execution. It does not create, overwrite or rename images. Keep passwords/URL prompts, other windows and private account addresses out of screenshots. Inspect each PNG before staging. The supplementary /tmp log contains only safe projected rows and fixed messages; it is not a replacement for the required PNGs. Actual zero statuses plus the final all-four-stages and connection-cleanup messages establish complete execution; zero after an intentional early stop establishes only the stages actually reached.

## Persistence, stopping and cleanup rules

These are genuine committed operations, not a rollback-only demonstration. On complete execution, three new synthetic Users, credentials, acceptances, stable issuances and jobs remain; two library challenge rows remain (expired and attempt-exhausted), and the consumed challenge is deleted. All three new jobs are cancelled and no sessions are created. Historical jobs remain excluded by the unchanged worker Terms predicate. No existing user, approved Terms or historical payload is repurposed.

No records are automatically deleted and no extra privileges are requested. Keep the new run's printed issuance IDs and actual log for provenance; any later removal requires a separately reviewed owner-only, exact-ID cleanup plan, respecting FK/history constraints. Do not reset the database, delete a schema, rerun the old empty-database harness or guess replacement values. Expiry is not a deletion policy.

On failure, interruption or the 20-minute deadline, preserve partial output/screenshots and new fixtures. A completed registration/attempt may already be committed. Keys are lost on process exit; **do not attempt to decrypt historical records or resume with replacement keys**. Pending synthetic jobs remain production-ineligible; they cannot be legitimately sent. Do not automatically retry/reseed. Obtain review before any new run or cleanup. No public onboarding, SMTP, worker delivery or legal approval is inferred.

Assumptions: none. Named results are supported by current screenshots and supplied owner statuses; missing completion text is not fabricated. Do not rerun or overwrite existing evidence.
