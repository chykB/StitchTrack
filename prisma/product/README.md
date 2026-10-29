# Product authentication foundation

Status: registration and verification service plus an owner-gated PostgreSQL proof harness are **prepared, not database-proven**. No migration has been applied by the agent. Public registration, Login/Reset backend integration, SMTP and worker dispatch remain disabled/unimplemented. The [PRD](../../docs/PRD.md) is authoritative and read-only.

## Approved design and current implementation

- Installed Better Auth/prisma-adapter/core 1.7.7 with Prisma/Client 7.10.1; existing Argon2id utilities are reused. No package installation or version change was made here.
- [Shared schemas](../../lib/auth/schemas.ts) now implement the owner's V1 ASCII email decision: trim, validate ASCII with installed Zod/Better Auth syntax, then lowercase parsed output. Unicode names and exact accepted passwords are preserved. The current minimum remains 12 Unicode code points; library maxPasswordLength is explicitly Infinity so its default 128 UTF-16 units does not silently change policy. Public HTTP processing bounds still require review.
- [Registration service](../../lib/product-auth/registration.server.ts) creates identity/credential through Better Auth, records an explicit required Terms version, issues the plugin OTP, and writes stable product issuance plus encrypted outbox records inside one externally controlled Prisma transaction. Breach screening occurs beforehand. No HTTP handler exposes this service.
- [Secret utilities](../../lib/product-auth/secrets.server.ts) use domain-separated HMAC-SHA-256 for OTP verification and AES-256-GCM for outbox content, with distinct caller-supplied key rings. No secrets are read from files or logged. Production provisioning/rotation remains owner-controlled.
- The proposed schema has **eight models**. The added EmailVerificationIssuance owns lifecycle/attempt state; EmailOutbox now references its stable ID rather than the plugin's transient Verification row. See the [workflow and model reference](registration-workflow.md).
- Incorrect OTPs commit a durable failed-attempt increment without invoking the plugin's delete/recreate path. A correct OTP is also validated/consumed by Better Auth, with user verification and product consumption committed together. No session is created. Reissue enforces the PRD's 60-second cooldown and cancels/supersedes old pending jobs.

## Verified library boundaries

[Offline installed-library tests](../../tests/product-auth/compatibility.test.mjs) establish available APIs and delegate behavior, not PostgreSQL guarantees. A tx-bound adapter with transaction:false is supported by the exercised interfaces. User/Account/Session/Verification fields match the installed core metadata, and Prisma email correctly maps to PostgreSQL emailCanonical.

Library database after-hooks and the automatic Signup OTP hook can run after the library-owned transaction. runInBackgroundOrAwait can swallow email-callback errors. The prepared service therefore uses explicit writes/server-only OTP issuance, insertion receipts, and a fail-closed outer transaction. It does not use SMTP callbacks or post-transaction hooks to guarantee required writes.

The default password implementation uses scrypt with NFKC normalization; both callbacks must remain overridden. Generic OTP sign-in can create sessions and generic OTP reset can attach credentials to passwordless identities. The service's Better Auth instance never escapes, and no generic catch-all handler is mounted. Client invitations/business authorization remain separate future work.

## Proposed targets and strict separation

Names remain proposals pending owner approval/provisioning:

| Mode | Database | Runtime / migrator | Schema | Address |
| --- | --- | --- | --- | --- |
| development | stitchtrack_product_dev | stitchtrack_product_dev_app / stitchtrack_product_dev_migrator | product | 127.0.0.1:5432 |
| test | stitchtrack_product_test | stitchtrack_product_test_app / stitchtrack_product_test_migrator | product | 127.0.0.1:5432 |

[targets.ts](targets.ts) requires PRODUCT_DATABASE_MODE, PRODUCT_DATABASE_CONFIRMED=true and exactly the corresponding PRODUCT_DEV_DATABASE_URL or PRODUCT_TEST_DATABASE_URL. It rejects assessment databases/roles, wrong hosts/ports/schemas, missing credentials, connection overrides, production mode and fallback URLs. It reads no dotenv file. The service independently checks current database/role/product namespace inside every transaction before writing.

The [owner setup stages](setup/README.md) prepare the named migrators, restricted runtime roles and minimal grants, without executing provisioning. Neither kind has superuser, database/role creation or bypass-RLS privileges. Task Two public objects and Task Four task04_test are untouched. No test may use product development, assessment or production data. No shadow target is configured.

The isolated config keeps validate/generate offline and admits only exact, separately confirmed migrate deploy/status commands with dedicated migrator URLs. Reset, push, resolve and migration generation remain blocked. The config pins the single reviewed SQL checksum and history inventory; the owner must inspect actual product._prisma_migrations placement. No root/assessment fallback is permitted.

## Lean initial migration draft

One complete [initial SQL draft](migrations/20261029_product_auth_initial/migration.sql) now contains eight tables/70 columns, eight PKs, seven FKs, 17 explicit indexes (including one partial unique index) and 15 CHECKs. It is prepared offline and unexecuted. The [short review](review/README.md) separates database guarantees from transactional service rules and owner prerequisites. The redundant outbox user column/composite-FK proposal and trigger/function layer are removed. Ownership comes through issuance; the two time-based harness cases use an injected clock rather than changing stored timestamps.

Owner-only deployment preparation is documented in [setup/README.md](setup/README.md). No database result, PostgreSQL compatibility or atomicity is inferred from offline checks.

## Checks and remaining proof

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/product-auth/*.test.mjs tests/auth-validation/*.test.mjs task-04-server-security/tests/request-validation.test.mjs task-04-server-security/tests/breach-check.test.mjs task-04-server-security/tests/rate-limiting.test.mjs
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib esnext,dom --module esnext --moduleResolution bundler --allowImportingTsExtensions tests/product-auth/compatibility.types.ts prisma/product/targets.ts prisma/product/prisma.config.ts
CHECKPOINT_DISABLE=1 ./node_modules/.bin/prisma validate --config prisma/product/prisma.config.ts
```

The isolated ignored product client was regenerated offline after the model change. No database connection or migration was needed. A CLI update notice prompted disabling its notifier with CHECKPOINT_DISABLE=1; the earlier invocation is not certified network-silent. [Unit tests](../../tests/product-auth/registration.test.mjs) exercise real Better Auth/Argon2id with an explicitly labelled in-memory delegate double; its snapshot restoration is not PostgreSQL rollback evidence. The [integration harness](../../tests/product-auth/registration.integration.mjs) is imported only for offline authorization checks and is never executed by the commands above.

Remaining: owner review of the prepared provisioning/permissions stages, actual isolated provisioning and migration, then explicit authorization for the reserved product-test integration run. Its rollback, concurrency and FK outcomes remain **unproven**. Public legal Terms are unapproved; synthetic acceptance is test-only. Actual SMTP/worker behavior, shared abuse controls, operational key management and business/client authorization are not supplied by this slice.

Next owner-controlled step: run only the read-only catalog inspection in [setup/README.md](setup/README.md), then review its genuine output before provisioning. Do not execute integration or activate public enrollment yet.

Assumptions: none. No public legal approval, database state or passing PostgreSQL result is inferred.
