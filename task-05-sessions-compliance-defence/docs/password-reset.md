# Tailor password reset

Status: implementation and offline tests prepared; **the fourth migration, additive
credential grant and real PostgreSQL reset proof have not been executed by the agent**.
Default-off local Next.js Node API routes reuse the existing socket/raw-header transport,
Origin/CSRF checks, bounded JSON parser and shared PostgreSQL account/IP limiter. No generic
Better Auth handler is exposed; production and product-development activation are refused.
Existing Task Five evidence and historical fixtures are unchanged.

## Service and transaction

[The service](../../lib/product-auth/password-reset.server.ts) reuses installed Better Auth
1.7.7 `createVerificationOTP`, `checkVerificationOTP` and `resetPasswordEmailOTP` against the
actual outer Prisma transaction. It accepts only verified, enabled, non-deletion-locked
Users with an existing non-null credential password and matching credential accountId.
Unknown/passwordless/unverified/locked identities receive the same request acknowledgement.
No User/Account/Session creation or User mutation is allowed through the reset adapter.
The library's passwordless credential-creation fallback is explicitly blocked.

Codes are six-digit strings, expire within five minutes, allow three wrong well-formed
attempts and have a 60-second reissue cooldown. Incorrect attempts commit even when the
code is refused. Request, check and final completion take the same User-row lock as login
and account locking. Reissue supersedes the old reset issuance and cancels its mail without
touching signup challenges. Purpose-scoped HMAC and template-bound AES-GCM reuse existing
separate keys; plaintext codes live only in the encrypted outbox/email and active UI.

The intermediate code check does not consume the code, extend its expiry or create an
authenticated/reset session. The active form carries it into final completion. Final
completion again verifies the code and current account state. It validates the shared
12-Unicode-code-point password policy, preserves every accepted character, performs
fail-closed HIBP and Argon2id hashing **outside** the transaction, then calls Better Auth's
credential reset inside the real transaction. Credential replacement, library OTP deletion,
durable consumption, mail cancellation and all-session deletion commit or roll back together.
No callback/post-commit email hook is used for atomicity. No session/cookie is issued.

A login that commits first is revoked by reset. A waiting old-password login after reset
must fail against the new hash. A legitimate new-password login after reset may create a
fresh seven-day session. Lock-first requests cannot reset or unlock an account. Replay
cannot consume a challenge twice. No auto-retry follows a failed/uncertain transaction;
a lost commit acknowledgement can leave a successful reset despite a generic failure.
The UI advises trying a fresh login before requesting another code. Stored old cookies
may remain in other browsers, but server lookup rejects their revoked session rows.

## Delivery and boundaries

The existing worker uses its dedicated session advisory lock and bounded reservation,
eligibility, retry and uncertainty handling, without a database transaction across SMTP.
The reset template requires a fresh verified/active password account, unexpired reset
issuance and live library challenge. It does not require a new Terms acceptance for an
existing account's security email. Normal signup-Terms eligibility and the development
consent-deferral policy are unchanged. Historical signup/synthetic Terms jobs cannot become
reset jobs. Accepted SMTP is not guaranteed inbox delivery or exactly-once sending.

| POST URL | Result |
| --- | --- |
| `/api/product-auth/password-reset/request` | Generic 202 `{accepted:true}` for unknown/ineligible/cooldown/eligible requests. |
| `/api/product-auth/password-reset/check` | 200 only for a currently valid code, otherwise generic 400. No consumption yet. |
| `/api/product-auth/password-reset/complete` | 200 only after atomic reset; generic invalid-code/validation/unavailable responses otherwise. |

IP spending precedes parsing, account spending follows canonical validation, and both must
allow before the service. All reset operations share one budget so changing endpoints
cannot bypass it. Store failures fail closed; 429 includes Retry-After. Generic responses
do not promise timing indistinguishability: eligible request writes and SMTP activity can
differ. There is no claim of equal request timing or inbox-based anonymity.

## Offline verification

446 offline tests passed, including the real installed Better Auth/Argon2id interfaces
with test-double persistence, reset-specific mail and transient email state. TypeScript,
Prisma validation, local documentation links, Bash/JavaScript syntax and whitespace
checks passed. No PostgreSQL proof, SMTP send or browser acceptance test was run.

## Owner review: database prerequisites (not run)

Stop the local application/worker before rollout. Review the
[test-only fourth migration](../../prisma/product/migrations/20261102_password_reset/migration.sql)
and [narrow credential grant](../../prisma/product/setup/password-reset-test-permissions.sql).
The migration adds one purpose column (existing rows become email-verification) and scopes
the existing one-open partial index to user/purpose. Existing verification, expiry and
terminal constraints remain. No applied migration is edited. The grant adds only
Account UPDATE(password,updatedAt); no identity/email/provider/ownership/history privilege.

The isolated [manifest](../../prisma/product/migration-files.ts) pins the new SQL. Deployment
requires the existing exact migrator guards **and** the new explicit confirmation; it is
refused for development. Only the owner may authorize/run these commands in a private WSL
terminal. No URL/key/password belongs in evidence, Git or shell command text:

```bash
cd /home/bmalik/stitchtrack
set +x
read -r -s -p 'Private product-test migrator URL: ' task05_migrator
printf '\n'
env -i PATH="$PATH" CHECKPOINT_DISABLE=1 NODE_ENV=test PRODUCT_DATABASE_MODE=test \
  PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
  PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED=true \
  PRODUCT_TEST_MIGRATION_DATABASE_URL="$task05_migrator" \
  ./node_modules/.bin/prisma migrate deploy --config prisma/product/prisma.config.ts
task05_migration_status=$?
unset task05_migrator
printf 'reset_migration_exit=%s\n' "$task05_migration_status"
```

Stop on any failure; do not retry, reset, resolve or edit applied SQL. After successful
migration/history review, separately authorize the test-only grant:

```bash
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --file=prisma/product/setup/password-reset-test-permissions.sql
```

Generate the ignored product client offline after checkout/schema changes and fully
restart Next.js/worker after approval. Do not migrate or change product development.
No public Terms or policy approval is implied.

## Owner-only PostgreSQL proof and separate cleanup (not run)

The [inert integration harness](../../tests/product-auth/password-reset.integration.mjs)
requires all four exact migration checksums, the reviewed grant and no other product-test
runtime processes. It acquires the existing worker advisory lock before creating eight
fresh UUID-namespaced @example.invalid Users and seven credential Accounts. Keys/passwords
are ephemeral, never printed; no SMTP or HIBP request is made. Existing rows are fingerprinted
privately and compared after proof. It uses independent writer/reader connections and a
same-role observer to confirm actual PostgreSQL lock waiting, not a mocked race.

The proof covers committed two-session reset/replay/fresh login, reached-write rollback,
concurrent reset consumption, blocked old-password login, injected-clock expiry, three
wrong codes, passwordless/unverified refusal and unknown-account behavior. Injected-clock
expiry is not a five-minute wall-clock measurement. Remaining fixture mail is cancelled
before the worker lock is released. Runtime processes must stay stopped until cleanup,
including after a crash where cancellation is unconfirmed. Preserve the printed run UUID;
there is no private secret cleanup manifest or automatic deletion.

```bash
cd /home/bmalik/stitchtrack
set +x
read -r -s -p 'Private product-test runtime URL: ' task05_runtime
printf '\n'
read -r -s -p 'Private product-test migrator URL for read-only preflight: ' task05_control
printf '\n'
env -i PATH="$PATH" NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
  PRODUCT_MIGRATION_CONFIRMED=true PRODUCT_PASSWORD_RESET_PROOF_CONFIRMED=true \
  PRODUCT_TEST_DATABASE_URL="$task05_runtime" PRODUCT_TEST_MIGRATION_DATABASE_URL="$task05_control" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/password-reset.integration.mjs --owner-integration
task05_proof_status=$?
unset task05_runtime task05_control
printf 'reset_proof_exit=%s\n' "$task05_proof_status"
```

Review real output before separately authorizing cleanup. The
[exact-run cleanup SQL](../../prisma/product/setup/password-reset-test-cleanup.sql) refuses
missing/incomplete fixture sets, unexpected relationships, accepted/dispatched mail or
Terms acceptances. It deletes only those eight run-derived users and their validated
credential/session/reset records, leaving historical records and rate buckets alone.
A failed partial run needs private inspection, not a blanket retry/cleanup.

```bash
read -r -p 'Reviewed nonsecret reset proof run UUID: ' task05_run
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --set=run_id="$task05_run" --file=prisma/product/setup/password-reset-test-cleanup.sql
unset task05_run
```

## Local browser acceptance and two-session test (not run)

After owner review/proof/cleanup, retain existing private keys and URLs. Add only the
nonsecret reset opt-ins to the ignored local configuration: ENABLE_PRODUCT_PASSWORD_RESET_HTTP,
PRODUCT_RESET_RATE_POLICY_CONFIRMED and PRODUCT_RESET_RATE_POLICY. The first two must be
true. **Proposed development-only policy requiring owner confirmation**, not a production
default:

```json
{"version":"local-reset-v1","account":{"capacity":6,"refillIntervalMs":60000},"ip":{"capacity":20,"refillIntervalMs":15000}}
```

Use a fresh version if settings change. The common budget includes request/check/complete;
wrong-code attempts also have the separate durable limit. Respect Retry-After; never reset
counters or bypass email eligibility to finish a demonstration. The same existing worker
and matching retained keys are needed for real email: start it explicitly with the existing
`PRODUCT_EMAIL_WORKER_ENABLED=true npm run dev:email` only after separately authorizing
live sending. Normal `npm run dev` does not send email or start a worker.

1. Use the same owner-controlled verified product-test account in two independent browser
   profiles. Optionally demonstrate one failed login first, then Forgot Password: its email
   is prefilled and editable. Go back and log in normally in both profiles. Respect the
   existing login budgets; a test failure is not permission to change their limits.
2. In profile A choose Forgot Password. The remembered email is a convenience; edit it if
   needed. Request the code, then check it and enter the new password without entering
   the email again. Complete within the server's five-minute deadline. No automatic login.
3. Refresh/check session in profile B: the previous cookie must receive 401 and lose
   authenticated presentation. Profile A's old session is revoked too. Privately verify
   the selected account has zero remaining sessions before making a fresh login.
4. Old-password login must fail generically; new-password login creates a fresh seven-day
   session. Request replay with the consumed code must fail. Never capture the code,
   password, headers, cookie values, verifier/digests, URLs or personal identity in evidence.

This implementation is not captured Task Five reset evidence or production readiness.
SMTP timeout/rejection, lost COMMIT acknowledgement, browser cookie behavior and operational
monitoring retain their existing uncertainty/limitations. Public activation, account deletion,
retention and roles remain separate tasks. No database proof or browser result is fabricated.

Assumptions: none. The proposed local rate numbers need explicit owner approval; all
PostgreSQL and live email/browser execution remains owner-controlled.
