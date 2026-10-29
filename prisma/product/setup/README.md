# Owner-only product PostgreSQL setup

**Local setup verified — October 29, 2026.** The status below records the completed local setup. The numbered sections that follow remain reusable instructions for provisioning and verifying fresh environments; do not replay them against the completed local databases.

## Completed local setup

- Both `stitchtrack_product_dev` and `stitchtrack_product_test` were provisioned successfully.
- The approved initial product migration was applied to both databases.
- Schema ownership, authentication rules, and runtime permissions were verified for both databases.
- The product-test registration and OTP integration harness passed with exit status 0.
- Synthetic integration-test data remains in the test database.
- The development database has no approved public Terms version; public registration remains disabled.

No public signup, SMTP or real customer data is authorized. The [initial SQL](../migrations/20261029_product_auth_initial/migration.sql) and [PRD](../../../docs/PRD.md) are unchanged. Use WSL Node 24 and the existing PostgreSQL 16 cluster on port 5432 for a fresh environment. Commands assume its reviewed local administrator is accessible as OS user postgres; if that is not your setup, stop rather than guess another identity/cluster.

## Fresh-environment setup instructions

### 1. Inspect before any change

From /home/bmalik/stitchtrack, the **first command is read-only**:

```bash
sudo -u postgres /usr/bin/env -i PATH=/usr/bin:/bin /usr/lib/postgresql/16/bin/psql \
  --no-psqlrc --port=5432 --dbname=postgres --set=ON_ERROR_STOP=on --pset=pager=off \
  --file=prisma/product/setup/preflight.sql
```

[preflight.sql](preflight.sql) reads only role/database catalogs, authentication-rule metadata and (when present) product migration history. It prints no passwords, connection URLs or application rows. Confirm the local cluster/version. If any of the two databases/four roles already exists, **stop provisioning**. Inspect that product database with the same command, changing only --dbname to stitchtrack_product_test or stitchtrack_product_dev, and review its ownership/history before any tailored continuation. No automatic adoption, repair, drop or reset exists.

### 2. Fresh provisioning and private passwords

Only after approving the stage-1 output and [provision.sql](provision.sql):

```bash
sudo -u postgres /usr/bin/env -i PATH=/usr/bin:/bin /usr/lib/postgresql/16/bin/psql \
  --no-psqlrc --port=5432 --dbname=postgres --set=ON_ERROR_STOP=on --pset=pager=off \
  --file=prisma/product/setup/provision.sql
```

The administrator owns both new UTF8/C-collation databases. Each migrator owns only its product schema and subsequent objects. All four LOGIN roles have NOINHERIT/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS and no memberships. PUBLIC loses database CONNECT/CREATE/TEMP and schema privileges **only in the two new product databases**. Each pair receives CONNECT to its own database; runtime gets schema USAGE, never CREATE/ownership. No default grants expose future tables/history. Database creation is not transactional: on any failure preserve output and stop; earlier roles/databases may already exist. Never rerun blindly.

Before enabling passwords, confirm ordered pg_hba.conf rules restrict these new roles to their own loopback database. SQL grants cannot deny CONNECT inherited through PUBLIC on an unrelated database. The owner should review these narrowly scoped rules **before existing general allow rules**, then reload the reviewed server configuration separately:

```text
local all stitchtrack_product_dev_migrator,stitchtrack_product_dev_app,stitchtrack_product_test_migrator,stitchtrack_product_test_app reject
host stitchtrack_product_dev stitchtrack_product_dev_migrator,stitchtrack_product_dev_app 127.0.0.1/32 scram-sha-256
host stitchtrack_product_test stitchtrack_product_test_migrator,stitchtrack_product_test_app 127.0.0.1/32 scram-sha-256
host all stitchtrack_product_dev_migrator,stitchtrack_product_dev_app,stitchtrack_product_test_migrator,stitchtrack_product_test_app 0.0.0.0/0 reject
host all stitchtrack_product_dev_migrator,stitchtrack_product_dev_app,stitchtrack_product_test_migrator,stitchtrack_product_test_app ::/0 reject
```

These match only the four new roles; do not change assessment databases, existing roles or their rules. Stage 1 reports the actual authentication_file path; review that file rather than guessing its location. After the owner saves the reviewed rules, reload only this inspected cluster:

```bash
sudo -u postgres /usr/bin/env -i PATH=/usr/bin:/bin /usr/lib/postgresql/16/bin/psql \
  --no-psqlrc --port=5432 --dbname=postgres --set=ON_ERROR_STOP=on --command='SELECT pg_reload_conf();'
```

Require a true result and rerun the read-only preflight to check invalid_rule=false and rule order. If earlier rules bypass these restrictions, stop. The shared PostgreSQL administrator remains privileged across databases; separation does not constrain that administrator.

Open a private administrative terminal without recording/echoing password commands:

```bash
sudo -u postgres /usr/bin/env -i PATH=/usr/bin:/bin /usr/lib/postgresql/16/bin/psql --no-psqlrc --port=5432 --dbname=postgres
```

Enter the following interactively; psql prompts privately for each password. Use distinct generated passwords. No plaintext belongs in SQL files, shell history, screenshots or Git.

```text
SET password_encryption = 'scram-sha-256';
\password stitchtrack_product_dev_migrator
\password stitchtrack_product_dev_app
\password stitchtrack_product_test_migrator
\password stitchtrack_product_test_app
\q
```

Rerun stage 1 against each new database before deploying: product must exist with its matching migrator owner and contain no tables/history. Inspect authentication rules and role flags/memberships.

### 3. Test migration first

Privately construct the test migrator URL using its exact role/database, 127.0.0.1:5432 and schema=product; percent-encode the password. No example with a real URL is printed here. In a fresh WSL Bash terminal:

```bash
cd /home/bmalik/stitchtrack
set +x
umask 077
export NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true
IFS= read -r -s -p 'Private test migrator URL: ' PRODUCT_TEST_MIGRATION_DATABASE_URL
printf '\n'
export PRODUCT_TEST_MIGRATION_DATABASE_URL
CHECKPOINT_DISABLE=1 ./node_modules/.bin/prisma migrate deploy --config prisma/product/prisma.config.ts
product_deploy_status=$?
printf 'deploy_exit_status=%s\n' "$product_deploy_status"
```

If status is nonzero, **stop and preserve output**; migration/history may be partially recorded. No retry/reset/resolve/edit of the reviewed SQL. Do not continue to grants/integration. The config admits only exact migrate deploy/status plus offline validate/generate; deployment requires both confirmations, exact mode/migrator URL and the reviewed migration checksum/history inventory. It never loads dotenv, root or assessment configuration. No shadow database is used by deploy.

### 4. Verify history, then grant runtime access

After zero deploy status, rerun the stage-1 read-only command with --dbname=stitchtrack_product_test. Require eight domain tables plus **product._prisma_migrations**, all owned by stitchtrack_product_test_migrator. The initial history row must be finished, not rolled back, with checksum 7c2fac4b746d8300184bb6ec656dda4f1cfb9f342829210f8cd1996a5d8e10ff. Stop if history appears in public/another namespace or any unexpected state exists. @@schema alone is not proof of history placement; the URL selects product and the live catalog check confirms it.

```bash
CHECKPOINT_DISABLE=1 ./node_modules/.bin/prisma migrate status --config prisma/product/prisma.config.ts
```

Stop on any status failure. Then apply [permissions.sql](permissions.sql) as the test migrator, with an interactive password prompt:

```bash
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_migrator \
  --set=ON_ERROR_STOP=on --pset=pager=off --file=prisma/product/setup/permissions.sql
```

It verifies target/owner/successful history first. Runtime gets SELECT on all eight domain tables, INSERT on the six registration tables, DELETE only on transient Verification, and column updates only for User verification, issuance attempts/terminal markers and outbox cancellation. Session and migration-history writes are denied; history SELECT is denied too. TermsAcceptance has no UPDATE/DELETE. Development TermsVersion is SELECT-only. Test alone additionally receives INSERT on the five synthetic artifact fields, never approvedAt/effectiveAt, UPDATE or DELETE. This is an isolated test-fixture exception, not operational policy approval.

Rerun the read-only preflight on test to inspect actual ACLs/ownership. Do not infer success from the SQL file. Current grants intentionally do not support future login sessions, reset or workers; review those capabilities when implemented.

### 5. Owner-authorized integration

Only after stages 1-4 pass, reserve the empty product-test tables for this one run. Regenerate the ignored client offline if missing, using CHECKPOINT_DISABLE=1 ./node_modules/.bin/prisma generate --config prisma/product/prisma.config.ts. Privately supply the **runtime** URL, not the migrator URL:

```bash
unset PRODUCT_TEST_MIGRATION_DATABASE_URL PRODUCT_MIGRATION_CONFIRMED
IFS= read -r -s -p 'Private test runtime URL: ' PRODUCT_TEST_DATABASE_URL
printf '\n'
export PRODUCT_TEST_DATABASE_URL
NODE_ENV=test PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true PRODUCT_AUTH_INTEGRATION_CONFIRMED=true \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/product-auth/registration.integration.mjs --owner-integration
product_integration_status=$?
printf 'integration_exit_status=%s\n' "$product_integration_status"
unset PRODUCT_TEST_DATABASE_URL
```

The existing harness verifies runtime privilege denials and test-fixture permission, empty tables, real rollback at each required write/lifecycle stage, duplicates/concurrency and OTP lifecycle. It sends no SMTP/HIBP requests. Keys are ephemeral and rows are synthetic. Preserve actual output/status; stop on failure with no automatic cleanup/rerun. For a fresh environment, consider the integration verified only after the owner captures a zero exit status.

### 6. Configure development in a fresh environment

After reviewing successful test results, repeat migration/history/grants stages **one at a time** for development, using NODE_ENV=development, PRODUCT_DATABASE_MODE=development, PRODUCT_DEV_MIGRATION_DATABASE_URL, database stitchtrack_product_dev and role stitchtrack_product_dev_migrator. Use the same exact Prisma config. permissions.sql selects stitchtrack_product_dev_app and omits fixture INSERT automatically. Never run the integration harness on development. Do not enable public registration unless an approved public Terms version is available and configured.

Assumptions requiring owner confirmation before a fresh setup: local PostgreSQL 16 administrative identity/cluster, target-name availability, matching authentication rules and private credentials. This documentation update did not perform database operations.
