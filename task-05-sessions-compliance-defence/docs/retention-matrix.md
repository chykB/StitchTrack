# Account erasure and retention

Status: **owner-approved direction, implementation/proof prepared; operational promise inactive**.
Stage 1 immediately locks access and revokes sessions. Eligible data should be erased as
soon as practicable, with a maximum of **30 days from the original deletionRequestedAt**,
not a 30-day waiting/grace period. The deadline does not restart on retries. No scheduler,
backup-erasure process or lawful-exception workflow is deployed or claimed here.

The executable assessment job only accepts a successful private receipt for a fresh
UUID-namespaced disposable fixture. It cannot select User B, the primary account or any
other existing non-fixture account. It is not an operational sweep of real deletion requests.
Real TermsAcceptance retention, external assets, backups and exception handling must be
resolved before extending that scope or activating the public commitment.

## Nine-model matrix

Bases below are **proposals for owner/qualified privacy review**, not findings of compliance
or invented legal obligations. The controller must determine an applicable basis and keep
only necessary data for its purpose; see the [NDPC Act publication](https://ndpc.gov.ng/download/nigeria-data-protection-act-2023)
and [NDPC 2025 implementation directive, Article 16](https://ndpc.gov.ng/wp-content/uploads/2025/03/NDP-ACT-GAID-2025-MARCH-20TH.pdf).
The 30-day limit is StitchTrack's approved direction, not a claimed universal statutory period.

| Model | Significant personal data | Action and trigger/duration | Reason / proposed basis | Dependencies and unresolved questions |
| --- | --- | --- | --- | --- |
| User | Name, canonical email, image reference, identifiers, administrator flag, verification/lock/request timestamps | Lock immediately; erase eligible row promptly, no later than request + 30 days. Assessment job only targets its new disposable fixture. | Account operation: contractual necessity where applicable; security and erasure-request handling require reviewed basis. | Account, Session, TermsAcceptance and Issuance RESTRICT deletion. Non-null image blocks job pending external-object review. No promise that deleting a URL deletes a hosted image. |
| Account | Argon2id credential hash, user/account identifiers; token/scope fields exist but current SQL requires them NULL | Delete with eligible User in the same transaction; never preserve the hash as an anonymized record. | Authentication purpose ends when eligible account data is erased. Security basis during active service needs review. | User FK RESTRICT. No credential replacement or passwordless-client password creation. |
| Session | HMAC token digest, user identifier, IP/user-agent if populated, timestamps | Revoke all at Stage 1; erase any stale residual rows with User. Ordinary expired-session maintenance is separate. | Necessary access control/security; no need to retain usable sessions after lock. | User FK RESTRICT. Digest is protected/pseudonymous, not anonymous. No new session lifetime. |
| Verification | Identifier may embed email; keyed OTP value/attempt encoding, expiry/timestamps | Stop authentication through account lock; erase linked and exact current signup/reset orphan identifiers with User. Expiry alone does not erase the row. | Time-limited authentication/security processing, then no ongoing challenge purpose. | No User FK. Issuance reference uses SET NULL. Job removes own issuances first, rejects cross-user references and unsupported attributable formats. Future plugins need ownership review. |
| TermsVersion | Shared version/digest/document reference and approval metadata; normally no individual user link | Retain shared versions for necessary document/version provenance; no invented indefinite personal-data retention period. | Preserve the document users saw; nonpersonal version metadata can remain independently of a deleted user. | TermsAcceptance FK RESTRICT. Job never deletes a TermsVersion. If documents/reference metadata contain personal data, owner must separately inventory/minimize them. |
| TermsAcceptance | User-to-version link, acceptance timestamp and context | Synthetic test acceptance erased with fixture. Real acceptance blocks this job until a specific retention decision is approved; do not retain personal links forever by default. | Evidence of agreement may be relevant to contract/claims, but this is not an automatic legal obligation or blanket exception. | User and TermsVersion FKs RESTRICT; cannot keep linked acceptance while deleting User. No approved anonymization/exception mechanism exists. Decide deletion versus a justified minimum record and duration before real use. Privacy notices are not Terms consent. |
| EmailOutbox | Encrypted recipient/code payload, job/issuance linkage, nonce/tag/key reference, delivery metadata | Erase all own pending/sent/cancelled rows with User. Do not retain ciphertext as anonymous data. | Delivery purpose ends for erased eligible identity. | Outbox -> Issuance RESTRICT; delete first. Shared worker lock excludes live SMTP handoff during job. Cannot recall already handed-off mail or erase provider/recipient copies. |
| EmailVerificationIssuance | Canonical email, user/challenge links, verifier/key reference, attempts, purpose, timestamps | Erase all own rows after Outbox, before User/Verification. Verification expiry alone is not erasure. | Authentication/security lifecycle; no new purpose is inferred after erasure. | User RESTRICT, Verification SET NULL. Stable issuance history is useful until erasure, not a legal reason to retain it indefinitely. |
| AuthRateBucket | HMAC account/IP key digest and activity/debt timestamps; no User FK or plaintext identity | Do not refund active budgets on deletion. Remove expired/full-refill buckets through bounded maintenance. Assessment job removes only its exact expired synthetic key; unrelated and active buckets remain. | Abuse prevention is a proposed legitimate-interest purpose requiring necessity/balancing review. Active unknown-identity traffic may create security counters independently of an account. | Pseudonymous, not anonymous; cannot map all historical keys to a User without policy/key inventory. Validated capacity * refill bounds debt below 25 days after last activity; current local limits are much shorter. Daily maintenance, continued-activity treatment and backup expiry remain unverified. |

No automatic legal hold is implemented. A blocked record is an **unresolved review item**,
not proof of a lawful retention exception. A real exception needs identified records,
specific basis/purpose, minimum duration, restricted access and a review/end condition.
If those decisions are missing, do not claim the 30-day promise is being fulfilled.

## Controlled job

[Engine](../../lib/product-auth/account-erasure.server.ts), [inert runner](../../scripts/account-erasure.mjs)
and [owner-only PostgreSQL proof](../../tests/product-auth/account-erasure.integration.mjs).
No migration, cascade change or new dependency is needed. The current owner-controlled test
migrator already owns the tables; it is used in a separate explicitly authorized process.
No DELETE privilege is added to the public application role. This broad migrator identity
is **not approved for an unattended production scheduler**; a future least-privilege cleanup
identity needs separate approval/provisioning before operational deployment.

Guards validate URL database/role/host/port/schema before connection, then actual database,
current/session role, non-superuser flags, product ownership, UTC, the manifest's exact applied
migration checksums, all nine tables/history and every FK/RESTRICT/SET NULL relationship.
New business tables/FKs or unexpected schema/history stop the job. The private format-1
receipt requires successful setup; it contains only run UUID and historical counts/digests,
not credentials, OTPs, credential/session hashes or encryption keys. Source-file checksum changes do not strand it.

Each pass is bounded to **one exact fixture User** and at most 1,000 related rows per table.
The existing worker advisory lock serializes job/worker attempts. User FOR UPDATE preserves
the authentication lifecycle protocol. Before any deletion, the same transaction compares
all nine historical non-fixture counts/digests and the retained keep/shared digest against
the validated setup receipt. Write-blocking table locks hold that compared data stable
through commit/rollback. These coarse locks are for this quiescent assessment proof, not
a production scheduling design. Any mismatch blocks the pass with zero deletes; stop for
review without editing the receipt or automatically recovering fixtures. No SMTP occurs.
Outbox, acceptance, session and
credential rows are deleted before issuance/User, with exact related Verification IDs
validated first. Shared Terms remain. Only exact expired fixture rate keys may be removed;
there is no global account/rate-table DELETE or fallback to development.

Dry-run takes locks/selects and rolls back without data writes. Each execute pass commits
all deletes together. Known pre-commit failures roll back and report zero committed counts;
failed COMMIT acknowledgement reports **unconfirmed with null counts**. No retry is automatic.
A missing User plus remaining attributable challenge is blocked, not called success. A
clean repeated pass returns noop/zero counts; dry-run and repeat execution still require
the original receipt checks. No erased-account tombstone/model is added.

## Daily operation and deadline detection (design, not deployed)

- Eligible data is processed on the next available pass; never wait until day 30. A daily
  run (for example 00:15 UTC) gives an ordinary maximum one-day queue delay, subject to
  failures. A manual reviewed pass can run sooner. Current fixture-only runner is not
  permission to schedule erasure of real accounts.
- The engine reports aggregate pending, within-72-hours and overdue counts from original
  database timestamps. These metrics are a **pre-pass snapshot of all locked accounts**,
  not a claim that every one is eligible or was erased by this scoped pass.
- Before deployment, assign an operator and alert channel. Alert on nonzero exit, busy,
  blocked, unconfirmed outcome, an approaching/overdue count, or no heartbeat within
  26 hours. Missing-run detection needs an independent monitor; a stopped job cannot
  alert about itself. No cron/systemd timer, credentials store or monitor has been installed.
- Review uncertain commits using dry-run/read-only state before deciding on a new run.
  Idempotency supports safe approved re-execution; it does not turn lost acknowledgements
  into verified success. High row counts require a separately reviewed bounded plan.
- Backups/WAL/replicas, restored deletion locks, provider copies and external files are
  not erased by SQL. Inventory locations, access and expiry; approve/test a restore-time
  erasure reconciliation process. User-row deletion removes its request timestamp, so
  this schema alone cannot stop an old backup resurrecting an account. No backup purge or
  erasure ledger is invented. This blocks activation of the public 30-day guarantee.

Future orders, client links, measurements, agreements, manual payment records and pictures
are PRD concepts, not implemented product tables. Erasing a login must not silently destroy
client-approved evidence or another business/client's rights. Review ownership transfer,
record minimization, claims/retention bases and image providers before extending this job.
The PRD's proposed picture schedule is not an approved exception to account erasure.

## Proposed confirmation ? NOT ACTIVE

> Your account is locked and all sessions have been revoked. We will erase eligible personal
> data as soon as practicable and no later than 30 days after your request, except for specific
> records we have a documented lawful basis to retain. We will explain any applicable exception
> and retention period.

Do not publish this wording until non-fixture eligibility/Terms decisions, least-privilege
execution, scheduling/monitoring, backups/restore and real PostgreSQL behavior are reviewed
and verified. The current Stage 1 confirmation remains unchanged and does not promise erasure.

## Exact owner PostgreSQL/evidence procedure ? not executed

Use a private WSL shell with Node 24. Stop the owner-run Next process, worker and other
product-test clients first. This proof creates two **new disposable** Users: one already
request-locked target and one unrelated keep fixture, plus synthetic/unapproved Terms and
related auth rows. A deliberately stale, unusable session tests FK cleanup; this is not a
repeat of Stage 1 login/deletion proof. No real email, account credential or approval is used.
Historical rows and the retained keep account/shared records are fingerprinted privately
and checked inside every erasure transaction before destructive statements, then checked
again before separate exact teardown. The setup, job and teardown reuse the same snapshot
helpers; unexpected keep-session/issuance rows also invalidate the retained digest.
Never select User B or supply an existing User ID. No app/development URL is accepted.

1. Privately supply the existing test migrator URL and create a fresh protected receipt directory:

   ```bash
   cd /home/bmalik/stitchtrack
   set +e
   set +x
   set -u
   set -o pipefail
   umask 077
   read -r -s -p 'Private product-test migrator URL: ' task05_erasure_url
   printf '\n'
   task05_erasure_dir=$(mktemp -d /tmp/stitchtrack-erasure-XXXXXX)
   task05_erasure_node() {
     env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
       PRODUCT_MIGRATION_CONFIRMED=true PRODUCT_ACCOUNT_ERASURE_ENABLED=true PRODUCT_ACCOUNT_ERASURE_CONFIRMED=true \
       PRODUCT_TEST_MIGRATION_DATABASE_URL="$task05_erasure_url" PRODUCT_ERASURE_PROOF_DIRECTORY="$task05_erasure_dir" \
       node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$@"
   }
   task05_erasure_node tests/product-auth/account-erasure.integration.mjs --owner-setup
   printf 'setup_exit=%s\n' "$?"
   ```

   Stop on nonzero status. Preserve the directory/receipt for investigation; setup commit
   acknowledgement may be uncertain. Do not rerun setup, overwrite the receipt or assume
   missing/incomplete receipt means no DB changes. No new database grants are expected.
2. Review the actual setup result, then prove independent lock contention/release and dry-run:

   ```bash
   task05_erasure_node tests/product-auth/account-erasure.integration.mjs --owner-lock-proof
   printf 'lock_proof_exit=%s\n' "$?"
   ```

   After reviewing a zero lock-proof status, separately run:

   ```bash
   task05_erasure_node scripts/account-erasure.mjs --owner-run --dry-run
   printf 'dry_run_exit=%s\n' "$?"
   ```

   Run one command at a time; stop on any failure. Dry-run should report one fixture User,
   related auth/acceptance/mail rows and the expired fixture counter; shared Terms/active
   counter/unrelated users must not be erased. No output here is fabricated.
3. Define a no-overwrite capture helper, then separately authorize each real execution:

   ```bash
   task05_erasure_capture() {
     local log="$1"
     case "$log" in
       task-05-sessions-compliance-defence/evidence/13-scheduled-job-run-one.txt|task-05-sessions-compliance-defence/evidence/14-scheduled-job-run-two.txt) ;;
       *) printf 'STOP: unexpected evidence path.\n' >&2; return 1 ;;
     esac
     if [[ -e "$log" || -L "$log" ]]; then printf 'STOP: preserve existing evidence.\n' >&2; return 1; fi
     (set -o noclobber; : > "$log") || return 1
     (
       printf 'Owner-triggered real PostgreSQL job; scheduler NOT deployed.\n'
       date -u '+Started: %Y-%m-%dT%H:%M:%SZ'
       printf 'Command: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/account-erasure.mjs --owner-run --execute\n'
       task05_erasure_node scripts/account-erasure.mjs --owner-run --execute
       status=$?
       printf 'job_exit_status=%s\n' "$status"
       exit "$status"
     ) 2>&1 | tee -a "$log"
     local -a statuses=("${PIPESTATUS[@]}")
     printf 'run_exit_status=%s\ncapture_exit_status=%s\n' "${statuses[0]}" "${statuses[1]}" >> "$log"
     local append=$?
     printf 'run=%s capture=%s status_append=%s\n' "${statuses[0]}" "${statuses[1]}" "$append"
     (( statuses[0] == 0 && statuses[1] == 0 && append == 0 ))
   }
   task05_erasure_capture task-05-sessions-compliance-defence/evidence/13-scheduled-job-run-one.txt
   ```

   Review run-one output and exit/capture statuses. It must be actual committed job output,
   not a dry-run. Then verify historical/keep/shared data before run two:

   ```bash
   task05_erasure_node tests/product-auth/account-erasure.integration.mjs --owner-verify
   printf 'verify_exit=%s\n' "$?"
   ```

   Only after a zero verification status and review, run:

   ```bash
   task05_erasure_capture task-05-sessions-compliance-defence/evidence/14-scheduled-job-run-two.txt
   ```

   Run two should be noop with all zero deletion counts if repeated before the remaining
   seven-day synthetic counter expires. A later expired-counter removal is legitimate
   maintenance, not repeated User processing. Complete this proof within seven days; after
   expiry the retained-fixture fingerprint may require manual review rather than receipt edits.
   These are manually triggered job runs, not
   proof that a scheduler is deployed. Any requirement for actual automated execution still
   needs separately authorized scheduler verification. Nonzero/uncertain output or failed
   capture: preserve both DB state and partial evidence; no automatic retry or history editing.
4. Only after separately reviewing both runs, verify again and authorize exact fixture teardown:

   ```bash
   task05_erasure_node tests/product-auth/account-erasure.integration.mjs --owner-verify
   printf 'verify_exit=%s\n' "$?"
   ```

   After reviewing that verification, separately authorize:

   ```bash
   task05_erasure_node tests/product-auth/account-erasure.integration.mjs --owner-cleanup
   printf 'cleanup_exit=%s\n' "$?"
   ```

   Teardown requires erased target, exact keep-fixture relationships and unchanged historical
   fingerprints. It removes only the remaining newly created keep account, its own synthetic
   acceptance/credential, the now-unreferenced fixture TermsVersion and exact fixture counters.
   Scheduled erasure itself never deletes TermsVersion. Stop if anything mismatches.
5. After confirmed teardown only, retire this shell's private proof file/directory explicitly:

   ```bash
   rm -- "$task05_erasure_dir/proof.json" && rmdir -- "$task05_erasure_dir"
   unset task05_erasure_url task05_erasure_dir
   unset -f task05_erasure_node task05_erasure_capture
   ```

No private receipt, raw SQL failure, URL, password, OTP, key, hash or private email belongs
in evidence or Git. Do not reopen completed Stage 1 evidence. Agent verification is offline
only; all PostgreSQL setup, job runs, contention proof, capture and teardown remain unexecuted.

Assumptions: none. Non-fixture retention decisions and operational deployment remain blocked.

Offline verification: **480 tests passed**, including 16 erasure tests. TypeScript,
three new JavaScript syntax checks, 34 local documentation links, 11 Bash blocks and
`git diff --check` passed. These checks do not execute or prove the prepared PostgreSQL
SQL, migration history, live permissions, SMTP or scheduler behavior.
