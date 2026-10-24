# Task Two persistence experiment

Status: code implementation only. Prisma validation/generation, 21 database-free
unit tests, typechecking, and the production build passed. No database identity,
migration, submission, or integration result is claimed by this document.

During initial implementation, dependency installation attempts failed because
of registry availability and download errors. The initial npm audit reported
five high-severity findings, and Prisma 7.10.1 was unavailable from the checked
registry at that time. Those installation/version blockers were later resolved:
installation succeeded, and the Prisma CLI, client, and PostgreSQL adapter are
now installed at 7.10.1. The CLI remains a development dependency.

An earlier audit on 2026-10-24 reported one high-severity finding in
`zod@4.1.12`: memory exhaustion while validating oversized constrained
collections. The approved, targeted upgrade to exactly `zod@4.6.7` resolved
that finding; the subsequent `npm audit` reported zero vulnerabilities.
All 21 database-free assessment tests, TypeScript checking, and the production
build passed with the updated dependency. Dependency changes were limited to
Zod and its necessary lockfile entries; no general upgrade, automatic audit fix,
additional dependency, or override was used.
CLI dependencies do not implement MySQL product support.

## Boundaries and temporary lifecycle

This local-development assessment stores synthetic enquiries in one isolated
`task_two_enquiries` table. It creates no clients, orders, agreements, payments,
authentication, or notifications. Never enter real personal/customer data.
The existing landing page, PRD, rules, historical scaffold prompt, and Task One
design system are unchanged.

The page and POST endpoint require `NODE_ENV=development`,
`ENABLE_PERSISTENCE_EXPERIMENT=true`, and a loopback request host.
Otherwise they return 404. Bind Next.js to 127.0.0.1; do not expose or tunnel this
unauthenticated assessment. Production cannot enable it with the flag.

After assessment, disable the flag. Removing the temporary model, routes, data,
or table needs a separately reviewed cleanup/retention strategy. Never delete
an applied migration or rewrite migration history. No cleanup runs automatically.

## Dependencies and offline verification

Only six new direct dependencies are used:
`@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`, `pg@8.16.3`,
`zod@4.6.7`, `prisma@7.10.1` (development), and
`@types/pg@8.16.0` (development).

Use WSL Node 24.22.1/npm 11.19.1. The Prisma packages share one version.
The Prisma 7 generator uses provider `prisma-client`, explicit output
`app/generated/prisma`, ESM, and the Node.js runtime. Server-only code imports
that generated client and uses the pg adapter. Generated files are ignored.

Generation must precede typechecking/building after every install/schema change:

```bash
cd ~/stitchtrack
source ~/.nvm/nvm.sh
npm ci
npm run prisma:validate
npm run prisma:generate
npm run test:assessment
npm run typecheck
npm run build
npm audit
```

The pretypecheck/prebuild scripts also generate automatically. No install hook
connects to a database. Offline Prisma generate/validate and the specifically
documented schema-to-SQL diff omit the datasource entirely: no fake URL is used.
Other CLI commands fail configuration validation when confirmed test settings
are absent. Tests import pure logic and inject mocked persistence; no PostgreSQL
integration tests are included or run.

## USER ONLY: confirm the actual test database

Do not assume a database name or a pre-existing PostgreSQL service. Obtain the
intended TEST connection from your local setup and independently confirm its
server/port/database/user differ from development and production as intended.
Database identity checks, migrations, submissions, and all SQL below are yours
to execute; code approval is not database-operation authorization for an agent.

Use a private WSL shell. Do not paste credentials into source files, command
arguments, screenshots, logs, or shell history. The private URL is still a secret
in the process environment. An ignored local env file is optional; the shell
exports below avoid implicit dotenv loading and additional packages.

```bash
cd ~/stitchtrack
source ~/.nvm/nvm.sh
read -rsp 'Intended TEST PostgreSQL URL: ' EXPERIMENT_DATABASE_URL
printf '\n'
export EXPERIMENT_DATABASE_URL

assessment_psql() {
  env -i PATH="$PATH" HOME="$HOME" \
    PGDATABASE="$EXPERIMENT_DATABASE_URL" PGCONNECT_TIMEOUT=5 \
    psql -X -v ON_ERROR_STOP=1 "$@"
}
```

The URL must explicitly contain one host, port, database, and username.
Supported protocols: postgres/postgresql; optional query parameter:
sslmode=disable, require, or verify-full. No service, alternate-host, schema,
search_path, or other URL overrides are accepted. Confirm your TLS configuration
if applicable; do not weaken it to make the experiment pass.
Both CLI and application use this same explicit URL; independent psql uses it
as its connection string. There is no fallback to DATABASE_URL or a default DB.

Run the read-only preflight:

```bash
assessment_psql <<'SQL'
BEGIN READ ONLY;
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(), version();

SELECT nspname AS schema_name
FROM pg_catalog.pg_namespace
WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
ORDER BY 1;

SELECT n.nspname AS schema_name, c.relname, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
ORDER BY 1, 2;

SELECT n.nspname AS schema_name, p.proname,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
ORDER BY 1, 2;

SELECT n.nspname AS schema_name, t.typname, t.typtype
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
ORDER BY 1, 2;

SELECT to_regclass('public.task_two_enquiries') AS enquiry_table,
       to_regclass('public._prisma_migrations') AS migration_history;
COMMIT;
SQL
```

Stop on a wrong identity, conflicting objects, existing migration history,
unexpected application objects, or uncertainty. Review all non-system schemas.
Do not reset, baseline, overwrite, or treat an inspection error as proof of an
empty database. Have the database owner confirm that this is the intended test
database. Database names alone do not establish environment identity.

Only after confirming, enter the identity (no example defaults):

```bash
read -rp 'Confirmed test database name: ' EXPERIMENT_EXPECTED_DATABASE
read -rp 'Confirmed URL host: ' EXPERIMENT_EXPECTED_HOST
read -rp 'Confirmed URL port: ' EXPERIMENT_EXPECTED_PORT
read -rp 'Confirmed database user: ' EXPERIMENT_EXPECTED_USER
export EXPERIMENT_EXPECTED_DATABASE EXPERIMENT_EXPECTED_HOST
export EXPERIMENT_EXPECTED_PORT EXPERIMENT_EXPECTED_USER
```

Host must match the URL's host spelling (for example localhost versus its IP).
The returned server address/port must also match your intended instance,
allowing only an understood local forwarding arrangement. CLI configuration and
application share the same validator. The application additionally checks the
server-reported database and user before each insert.

## USER ONLY: generate, review, and apply a migration

No migrations are created by code implementation. This procedure is allowed
ONLY after the preflight confirms no conflicting objects or migration history.
The database role needs reviewed permissions for the assessment schema/table,
sequence, and Prisma migration bookkeeping.

Generate SQL in a NEW migration directory, refusing any existing migration path:

```bash
(
  set -eu
  test ! -e prisma/migrations
  migration_dir=prisma/migrations/20261023000100_task_two_enquiry
  mkdir -p "$migration_dir"
  printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
  ./node_modules/.bin/prisma migrate diff \
    --from-empty \
    --to-schema prisma/schema.prisma \
    --script \
    --output "$migration_dir/migration.sql"
  cat "$migration_dir/migration.sql"
)
```

Review the SQL before applying it. Expect only the assessment table, its
auto-increment sequence/default, primary key, and requestId unique index.
Prisma creates its migration ledger when applying migrations. Stop for DROP,
ALTER of existing objects, unexpected SQL, or any conflict.

Repeat the identity preflight immediately before deployment. Then YOU run:

```bash
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate status
```

No migrate dev, shadow database, reset, seed, baseline, or automatic cleanup.
Do not run migration commands with a failure override or a changed URL.

## USER ONLY: two successful submissions

```bash
export ENABLE_PERSISTENCE_EXPERIMENT=true
unset EXPERIMENT_FAILURE_PORT
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000/assessment/enquiry. In browser DevTools, capture each
POST's status and JSON. Submit once each:

- A: Assessment Customer A / Synthetic enquiry: Ankara blouse fitting.
- B: Assessment Customer B / Synthetic enquiry: Senator suit adjustment.

Expected: HTTP 201 only after awaited Prisma create succeeds; UI shows actual
ID, requestId, and createdAt in UTC. Inputs are retained. Do not click again for
the same evidence submission. Two intentional submissions are distinct records.

Use a second private shell with the SAME confirmed settings/helper for SQL:

```bash
read -rp 'Submission A requestId: ' request_a
read -rp 'Submission B requestId: ' request_b
assessment_psql -v a="$request_a" -v b="$request_b" <<'SQL'
SELECT id, "requestId", name, enquiry,
       to_char("createdAt" AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAtUtc"
FROM public.task_two_enquiries
WHERE "requestId" IN (:'a'::uuid, :'b'::uuid)
ORDER BY id;
SQL
```

Expect exactly two matching rows with distinct IDs/UUIDs. IDs need not be
consecutive. Compare each response ID/createdAt with the SQL and JSON log.
Log event times surround the operation; they need not equal database time.
Check machine/database clock offsets if chronology looks inconsistent.

## USER ONLY: isolated failure and recovery

Do NOT stop PostgreSQL or change either database. Keep EXPERIMENT_DATABASE_URL
unchanged. The optional failure port is consumed ONLY by the assessment
application adapter, which targets 127.0.0.1 at that port. CLI/psql remain on
the confirmed healthy connection.

Stop Next.js with Ctrl+C. Check an example candidate port:

```bash
ss -ltn '( sport = :65432 )'
```

Proceed only with no listener. Otherwise choose/check another port; never use
a known PostgreSQL listener. Then in the application shell:

```bash
export EXPERIMENT_FAILURE_PORT=65432
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Submit another synthetic enquiry. Expected: recognized connection refusal,
HTTP 503, safe error and request UUID, retained inputs, no success receipt.
Log outcome database_unavailable, with no created record ID/time.
The application uses a two-second connection timeout and no automatic retry.

In the HEALTHY independent verification shell:

```bash
read -rp 'Failed requestId: ' request_failed
assessment_psql -v failed="$request_failed" <<'SQL'
SELECT count(*) AS failed_request_rows
FROM public.task_two_enquiries
WHERE "requestId" = :'failed'::uuid;
SQL
```

Expect zero. Do not infer this solely from HTTP status or UI.
For recovery, stop Next.js, then:

```bash
unset EXPERIMENT_FAILURE_PORT
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Submit a different recovery enquiry; verify 201 and its new row using the
same independent SQL pattern. Restarting avoids cached pools or changed targets.

## Evidence and error contract

Capture A, B, failed F, and recovered C:
browser Network status/JSON, visible UI state, sanitized structured server log,
and independent SQL rows/zero count. Correlate requestId everywhere and compare
returned ID/createdAt exactly. Redact credentials and review captures before
saving; do not export an unreviewed HAR.

HTTP: 201 persisted; 400 malformed JSON; 403 origin rejected; 413 oversized;
415 content type; 422 field validation; 503 recognized transport-unavailability;
500 unknown/configuration/authentication/schema/integrity errors; 404 disabled.
The UI requires status 201 AND a valid receipt. No optimistic success or retry.

Do not enable verbose Prisma/driver DEBUG logging during evidence capture.
Application logs allow only event, at, requestId, method, fixed path, status, durationMs,
outcome, and successful ID/createdAt. No request bodies, passwords, URL,
raw exception, stack, or query logging. A JSON log status records the server's
chosen response; browser Network evidence confirms what was received.

A connection loss after commit can be ambiguous. The UI says success could not
be confirmed, rather than claiming no row exists. Verify by requestId before
retrying. The unused-port experiment fails before connection/write.
Tests use mocks and prove control flow, not real database persistence.
