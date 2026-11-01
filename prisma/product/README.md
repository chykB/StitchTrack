# Product authentication foundation

Current status: **owner-run registration -> SMTP email delivery -> OTP verification -> login -> authenticated session recognition completed** through normal Next.js loopback HTTP against `stitchtrack_product_test`. Earlier PostgreSQL/session/rate-limit/account-lock and curl HTTPS proofs, with their separate cleanups, remain historical checkpoints below. Public/production authentication remains disabled; Task Five browser/logout evidence is incomplete. This update records owner results without rerunning database operations or creating evidence. Earlier preparation sections retain their original implementation scope; the [PRD](../../docs/PRD.md) is authoritative and read-only.

## Approved design and current implementation

- Installed Better Auth/prisma-adapter/core 1.7.7 with Prisma/Client 7.10.1; existing Argon2id utilities are reused. No package installation or version change was made here.
- [Shared schemas](../../lib/auth/schemas.ts) now implement the owner's V1 ASCII email decision: trim, validate ASCII with installed Zod/Better Auth syntax, then lowercase parsed output. Unicode names and exact accepted passwords are preserved. The current minimum remains 12 Unicode code points; library maxPasswordLength is explicitly Infinity so its default 128 UTF-16 units does not silently change policy. The local Node API transport enforces bounded parsing; production activation remains unapproved.
- [Registration service](../../lib/product-auth/registration.server.ts) creates identity/credential through Better Auth, normally records an explicit required Terms version, issues the plugin OTP, and writes stable product issuance plus encrypted outbox records inside one externally controlled Prisma transaction. Breach screening occurs beforehand. Local Next.js handlers reuse it with the approved development-only consent deferral, which writes no Terms version or acceptance. No generic Better Auth handler is exposed.
- [Secret utilities](../../lib/product-auth/secrets.server.ts) use domain-separated HMAC-SHA-256 for OTP verification and AES-256-GCM for outbox content, with distinct caller-supplied key rings. No secrets are read from files or logged. Production provisioning/rotation remains owner-controlled.
- The current schema has **nine models**: the initial eight-model identity/verification baseline plus the separately added AuthRateBucket. The added EmailVerificationIssuance owns lifecycle/attempt state; EmailOutbox now references its stable ID rather than the plugin's transient Verification row. See the [workflow and model reference](registration-workflow.md).
- Incorrect OTPs commit a durable failed-attempt increment without invoking the plugin's delete/recreate path. A correct OTP is also validated/consumed by Better Auth, with user verification and product consumption committed together. No session is created. Reissue enforces the PRD's 60-second cooldown and cancels/supersedes old pending jobs.

## Verified library boundaries

[Offline installed-library tests](../../tests/product-auth/compatibility.test.mjs) establish available APIs and delegate behavior, not PostgreSQL guarantees. A tx-bound adapter with transaction:false is supported by the exercised interfaces. User/Account/Session/Verification fields match the installed core metadata, and Prisma email correctly maps to PostgreSQL emailCanonical.

Library database after-hooks and the automatic Signup OTP hook can run after the library-owned transaction. runInBackgroundOrAwait can swallow email-callback errors. The prepared service therefore uses explicit writes/server-only OTP issuance, insertion receipts, and a fail-closed outer transaction. It does not use SMTP callbacks or post-transaction hooks to guarantee required writes.

The default password implementation uses scrypt with NFKC normalization; both callbacks must remain overridden. Generic OTP sign-in can create sessions and generic OTP reset can attach credentials to passwordless identities. The service's Better Auth instance never escapes, and no generic catch-all handler is mounted. Client invitations/business authorization remain separate future work.

## Product targets and strict separation

The owner confirmed initial provisioning/migration for both targets. Later three-migration, permission and live-flow checkpoints are product-test results; matching later development grants or operation are not inferred:

| Mode | Database | Runtime / migrator | Schema | Address |
| --- | --- | --- | --- | --- |
| development | stitchtrack_product_dev | stitchtrack_product_dev_app / stitchtrack_product_dev_migrator | product | 127.0.0.1:5432 |
| test | stitchtrack_product_test | stitchtrack_product_test_app / stitchtrack_product_test_migrator | product | 127.0.0.1:5432 |

[targets.ts](targets.ts) requires PRODUCT_DATABASE_MODE, PRODUCT_DATABASE_CONFIRMED=true and exactly the corresponding PRODUCT_DEV_DATABASE_URL or PRODUCT_TEST_DATABASE_URL. It rejects assessment databases/roles, wrong hosts/ports/schemas, missing credentials, connection overrides, production mode and fallback URLs. It reads no dotenv file. The service independently checks current database/role/product namespace inside every transaction before writing.

The [owner setup stages](setup/README.md) retain the original named migrator/runtime provisioning and grant sequence. They are historical instructions, not authority to repeat completed setup or a current fresh-install recipe. Neither kind has superuser, database/role creation or bypass-RLS privileges. Task Two public objects and Task Four task04_test are untouched. No test may use product development, assessment or production data. No shadow target is configured.

The isolated config keeps validate/generate offline and admits only exact, separately confirmed migrate deploy/status commands with dedicated migrator URLs. Reset, push, resolve and migration generation remain blocked. The config pins all three exact reviewed SQL checksums and migration history inventory; the owner must inspect actual product._prisma_migrations placement. No root/assessment fallback is permitted.

## Initial migration and current test status

The applied [initial SQL](migrations/20261029_product_auth_initial/migration.sql) now contains eight tables/70 columns, eight PKs, seven FKs, 17 explicit indexes (including one partial unique index) and 15 CHECKs. It was prepared offline; the owner has now applied all three reviewed product-test migrations, including this initial migration. The [short review](review/README.md) separates database guarantees from transactional service rules and owner prerequisites. The redundant outbox user column/composite-FK proposal and trigger/function layer are removed. Ownership comes through issuance; the two time-based harness cases use an injected clock rather than changing stored timestamps.

The retained owner-only setup procedure is in [setup/README.md](setup/README.md); do not repeat completed provisioning or migrations. PostgreSQL results are owner-reported checkpoints, separate from offline checks.

## Checks and remaining proof

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/product-auth/*.test.mjs tests/auth-validation/*.test.mjs task-04-server-security/tests/request-validation.test.mjs task-04-server-security/tests/breach-check.test.mjs task-04-server-security/tests/rate-limiting.test.mjs
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib esnext,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions tests/product-auth/compatibility.types.ts prisma/product/targets.ts prisma/product/prisma.config.ts
CHECKPOINT_DISABLE=1 ./node_modules/.bin/prisma validate --config prisma/product/prisma.config.ts
```

The isolated ignored product client was regenerated offline after the model change. No database connection or migration was needed. A CLI update notice prompted disabling its notifier with CHECKPOINT_DISABLE=1; the earlier invocation is not certified network-silent. [Unit tests](../../tests/product-auth/registration.test.mjs) exercise real Better Auth/Argon2id with an explicitly labelled in-memory delegate double; its snapshot restoration is not PostgreSQL rollback evidence. The [integration harness](../../tests/product-auth/registration.integration.mjs) is imported only for offline authorization checks and is never executed by the commands above.

The setup and initial service-proof instructions above originated during foundation preparation. The current account-locking PostgreSQL result is recorded below and supersedes earlier pending status. Public legal Terms remain unapproved; synthetic acceptance is test-only. Operational key management, business/client authorization, production deployment and remaining Task Five captures remain separate requirements; the local browser journey is now owner-confirmed.

Do not rerun completed setup, proof or cleanup commands. Review the remaining activation and lifecycle decisions before authorizing another implementation slice; public enrollment remains disabled.

Assumptions: none. Reported database results do not establish public legal approval or launch readiness.

## Shared authentication abuse counters

The [shared PostgreSQL limiter](auth-rate-limiting.md) adds the ninth model after the
eight-table baseline. Its [owner-executed PostgreSQL proof and cleanup](rate-limit-postgres-verification.md#owner-executed-checkpoint)
are recorded separately. All three product-test migrations are now owner-applied;
development grants are not implied. The inventory guard admits only the three exact
reviewed SQL files/checksums through confirmed deploy/status. PostgreSQL limits are wired
into the explicitly enabled local routes; production numerical policies remain unapproved.

## Account-access locking foundation

The [lifecycle record](../../task-05-sessions-compliance-defence/docs/account-lifecycle.md)
documents the internal lock service, transaction-scoped login and fresh session guards.
The owner completed the [PostgreSQL proof and separate cleanup](account-access-postgres-verification.md)
for run `a02fc98d-905c-4f0b-a0f6-b9b721869d1d`: login/lock orderings, simultaneous locking,
deletion revocation, fresh lookup, rollback and pre-commit disconnection passed;
`account_proof_exit=0` and all proof connections closed. Cleanup removed eight User,
eight Account and three Session fixtures, retained ten baseline users and committed;
`account_cleanup_exit=0`. Historical authentication records and unrelated fixture data
were preserved. These are owner-reported results; lost-COMMIT-acknowledgement behavior
remains untested. Public HTTP/admin/deletion/reset endpoints remain inactive; operational
authorization, deletion reauthentication and lifecycle policies remain separate work.


## Completed curl HTTPS transport checkpoint

The owner completed the [HTTPS transport proof](https-transport-verification.md) for run
`70bde756-4193-4dba-bc45-cb8ba55e34fd`: certificate/IP verification, generic credential
errors, Secure signed cookies, lookup/logout/revocation, PostgreSQL 429 responses,
forwarding-header rejection and fail-closed storage handling passed. Historical users
and authentication/rate records were preserved; the listener and connections closed;
`https_transport_exit=0`. Separate cleanup removed one User, one Account, zero remaining
Sessions and five buckets, retained ten original users and returned `https_cleanup_exit=0`.
The owner also removed the private manifest, receipt, certificate, key and their two
temporary directories. These are owner-reported results, not new logs/screenshots.
That historical curl proof does not establish browser evidence. Normal Next.js now mounts
local-only Signup/OTP and Login/session/logout handlers at one loopback HTTP origin, and
the owner completed the live journey stated above. Logout/network-failure browser evidence,
two-session comparison, HTTPS browser cookie evidence, reset and production policy remain
pending. See the [Task Five session status](../../task-05-sessions-compliance-defence/docs/sessions.md).
