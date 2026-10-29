# Evidence 18: isolated synchronous/background HTTP timings

Status: **owner measurements captured** in [Evidence 18](../evidence/18-registration-timing-sync-vs-job.txt): five pairs after two warm-up pairs, run/capture/measurement statuses zero and cleanup recorded. Mean client HTTP durations are 454.119957 ms sync and 199.069349 ms background; recorded delta 255.050608 ms. The controlled scope below remains unchanged. This experiment needs no public Terms approval because it creates no platform account, Terms acceptance or production-eligible job. It does not change the [production worker](../../prisma/product/email-worker.md) or its Terms predicate.

## What is compared

[Owner harness](../experiments/email-timing/measure.mjs) starts its own ephemeral 127.0.0.1 HTTP listener only with exact owner CLI/development opt-in. A per-run bearer token, actual loopback peer/local address, exact Host, path/method and fixed synthetic body gate requests. No Next.js route is added; public registration stays disabled. No database URL, SMTP setting, private file, HIBP API or existing record is read.

Both modes do the same work: shared Signup Zod parsing, exact-character Argon2id hashing, secure six-digit string generation, HMAC, AES-GCM payload encryption, a private synthetic file commit, decryption/verifier checking, real branded HTML/plain-text rendering and the same controlled transport call. Passwords retain their spaces and are never printed. Synthetic hashes/encrypted payloads exist only in a new run-owned temporary directory, removed on normal completion. Random keys live in process memory only.

The file commit writes/fsyncs a complete private file, atomically renames it and fsyncs its directory before proceeding. This is an actual **local-file publication boundary, not a PostgreSQL transaction**, Better Auth registration or production EmailOutbox persistence. It contains no Terms record or legal approval. A small in-process background task is the controlled queue; it has no crash recovery/retries and is not a new production queue.

| Mode | HTTP 202 response boundary | Subsequent work |
| --- | --- | --- |
| sync | After local-file commit and controlled transport completion. | No transport work remains. |
| background | After the identical local-file commit, before dispatch. | Dispatch begins on the next event-loop turn after the server response finish event. |

Both responses explicitly say accountCreated=false and emailSent=false. Controlled transport is an awaited **250 ms configured delay**, not SMTP and not a measured result. Measured elapsed time may differ. No Nodemailer connection, acceptance, delivery or inbox result is claimed. Every sample waits for background completion before the next request, so neither mode leaves a competing queue backlog.

## Measurements and interpretation

The owner command performs two excluded warm-up pairs, then five measured pairs with alternating order. Each row records actual HTTP status, client request-through-response-body duration, server receive-to-response-finish duration, precommit work, file-commit duration, controlled dispatch duration, commit-to-completion and signed response-to-completion duration. All elapsed times use the monotonic performance clock. A negative sync response-to-completion value means transport finished before the response, not a negative runtime. Background server finish is a handoff boundary; it does not prove the client had received all bytes when dispatch began.

Output includes actual timestamp, Git HEAD, Node/OS, every measured sample, mean/median/min/max for each mode and the measured difference of HTTP means. HEAD identifies the base revision; include the reviewed pending code in the eventual evidence commit. Warm-ups are excluded from summaries. Do not infer provider/network latency from a controlled delay or treat a fast response as evidence of email delivery. Preserve failures and noisy/reversed results honestly.

This supports the assessment comparison of waiting versus queued response completion under a controlled workload. It **does not establish real PostgreSQL registration timings, a production durable-queue speedup or eligible worker SMTP delivery**. Existing Evidence 16/17 is the separate live SMTP evidence. Acceptance of this disclosed controlled scope against any stricter assessment wording remains an assessor decision; do not mark the entire operational email step complete on this result alone.

## Owner-only capture

Review the code and this scope first. Use WSL Node 24 from the repository root. No database/service setup, Terms fixtures, credentials or running Next.js server is required. This command starts the isolated listener and makes actual local HTTP requests; the owner has run it; the agent has not. The retained command is for reproducibility, not a request to overwrite or repeat completed evidence. Do not source .env.local. The sanitized environment prevents inherited database/SMTP credentials from entering the child process.

```bash
bash <<'TASK04_OWNER_EMAIL_TIMING'
set +e
set +x
set -u
set -o pipefail
umask 077
cd /home/bmalik/stitchtrack || exit 1
timing_evidence='task-04-server-security/evidence/18-registration-timing-sync-vs-job.txt'
if [[ -e "$timing_evidence" || -L "$timing_evidence" ]]; then
  printf 'STOP: Evidence 18 already exists; preserve it unchanged.\n' >&2
  exit 1
fi
(set -o noclobber; : > "$timing_evidence") || exit 1
(
  printf 'Owner command: env -i PATH="$PATH" NODE_ENV=development TASK04_EMAIL_TIMING_CONFIRMED=true node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON task-04-server-security/experiments/email-timing/measure.mjs --owner-measure\n'
  /usr/bin/env -i PATH="$PATH" NODE_ENV=development TASK04_EMAIL_TIMING_CONFIRMED=true \
    node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    task-04-server-security/experiments/email-timing/measure.mjs --owner-measure
  timing_run=$?
  printf 'measurement_exit_status=%s\n' "$timing_run"
  exit "$timing_run"
) 2>&1 | tee -a "$timing_evidence"
timing_status=("${PIPESTATUS[@]}")
printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${timing_status[0]}" "${timing_status[1]}" >> "$timing_evidence"
timing_append=$?
printf 'run=%s capture=%s status_append=%s evidence=%s\n' "${timing_status[0]}" "${timing_status[1]}" "$timing_append" "$timing_evidence"
if (( timing_status[0] != 0 || timing_status[1] != 0 || timing_append != 0 )); then
  printf 'STOP: preserve partial capture. Inspect privately; do not overwrite or automatically retry.\n' >&2
  exit 1
fi
TASK04_OWNER_EMAIL_TIMING
```

Evidence 18's actual generated format is: scope/environment lines; ten JSON sample rows (five per mode); two SUMMARY records; DELTA_MEAN_HTTP_MS; cleanup confirmation; real run/capture exit statuses. There are no prefilled timing numbers. Confirm both statuses are zero and cleanup confirmation is present. On termination/failure, inspect only the new /tmp/stitchtrack-email-timing-* directory created by this run; never delete guessed/unrelated paths. Scratch data contains synthetic information only and is not reused after a crash.

## Still requiring an eligible end-to-end worker test

The production predicate remains unchanged: historical synthetic Terms-fixture jobs cannot dispatch. Real worker testing still needs a separately authorized eligible fresh-job protocol, appropriate Terms/acceptance for the operational path, matching keys, current SMTP configuration and authorized side effects. A committed two-session reservation race, live crash/uncertain-SMTP behavior, sent-state persistence and genuine end-to-end latency remain separate from this benchmark. Do not reclassify controlled completion as SMTP acceptance.

The current Evidence 23 image visibly obscures the sender/recipient addresses and code. It was inspected without modification; this is a visual check, not a forensic metadata certification.

Assumptions: none. No Terms approval or real-customer processing is inferred from this isolated experiment.
