# Task Four Prisma foundation

This is the isolated synthetic laboratory, not application authentication or payment processing. The [final schema reference](../docs/schema.md) remains authoritative for the intended lab design; the [PRD](../../docs/PRD.md) is read-only. The root [schema](../../prisma/schema.prisma), [config](../../prisma.config.ts) and Task Two migrations are unchanged.

## Initial stage and isolation

[schema.prisma](schema.prisma) contains seven models, **41 scalar columns and seven FK definitions**, all assigned to task04_test. Initial User.name is deliberately absent: the owner's final design has 42 columns including nonblank name TEXT NOT NULL. Do not silently add it, provide a default or backfill now; that is the later owner-controlled required-column failure and nullable/backfill/required exercise. The final drawing describes the target, not this transitional state.

Types/nullability, PKs, supporting composite UNIQUE keys and both correlated Payment FKs follow the reference. PaymentIntent and PaymentAttempt each have at most one Payment through the unique paymentIntentId/successfulAttemptId fields. No duplicate owner FK or redundant composite unique index is added. Prisma 7.10.1 requires extra composite unique indexes for singular composite back-relations. This schema deliberately uses collection back-relations instead: the existing single-column unique keys still enforce the documented database 0..1 cardinalities. This is an ORM representation limitation, not permission for multiple receipts. All FK delete/update actions are Restrict. IDs and timestamps are supplied explicitly by the controlled writer; no unapproved generator/default is introduced.

There are **19 declared B-tree PK/unique/secondary indexes**. The twentieth index, the partial started-attempt index, is included in the prepared SQL draft linked below. This foundation does not claim all database constraints are implemented. No generator block is needed for this migration-only slice; no application client is produced.

The owner reports PostgreSQL 16, a successful password-authenticated connection to stitchtrack_assessment as stitchtrack_task04_test_app, the isolated task04_test schema, and denial of public creation, new-schema creation and Task Two table access. Evidence 02 was owner-captured. These are owner-reported checks, not agent database tests. Schema isolation shares database resources; restricted privileges remain essential.

## Current owner-controlled phase

Initial migration/Evidence 03 is complete at owner commit 1201216. The new [required-column failure runbook](../docs/required-column-failure.md) is prepared for review only. TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED=true selects the exact checksum-gated failure candidate and synthetic seed; TASK04_INITIAL_DEPLOY_CONFIRMED must be unset. With the new candidate present, the old initial-only gate intentionally rejects deploy. No resolution/reset/generation command is enabled. Approve the recovery plan before owner execution.

## Dedicated configuration

Use only [prisma.config.ts](prisma.config.ts), whose paths are relative to this directory. Its migrations path is [migrations/](migrations/); it does not read Task Two's history. Intended tracking is task04_test._prisma_migrations; the owner must verify actual placement when migrations are eventually authorized.

| Environment variable | Required value / purpose |
| --- | --- |
| TASK04_DATABASE_URL | Owner's private password-authenticated PostgreSQL URL, targeting stitchtrack_assessment, user stitchtrack_task04_test_app and exactly one schema=task04_test parameter. No credential example is committed. |
| TASK04_EXPECTED_HOST | Owner-confirmed local endpoint: localhost, 127.0.0.1 or [::1]. Must match the URL host. |
| TASK04_EXPECTED_PORT | Owner-confirmed explicit port, 1-65535, matching the URL. |
| TASK04_DATABASE_CONFIRMED | Exactly true, after owner target/privilege verification. |
| TASK04_INITIAL_DEPLOY_CONFIRMED | Historical initial-only flag; leave unset for Evidence 04. With the additional candidate present it cannot admit deploy. |
| TASK04_REQUIRED_COLUMN_FAILURE_CONFIRMED | Exactly true only for the prepared owner-reviewed required-column failure phase. Mutually exclusive with the initial flag; artifacts/checksums are pinned. |
| TASK04_SHADOW_DATABASE_URL | Private password-authenticated URL for database stitchtrack_task04_shadow, role stitchtrack_task04_shadow_app, host 127.0.0.1, explicit port 5432 and exactly one schema=task04_test parameter. |

Set those variables privately in the owner's WSL shell. No dotenv file is read automatically and no fallback to DATABASE_URL, EXPERIMENT_DATABASE_URL or generic SHADOW_DATABASE_URL exists. The dedicated main and shadow URLs are independently checked and mapped to Prisma 7 datasource.url and datasource.shadowDatabaseUrl. NODE_ENV=production is rejected for database-targeted use. Only schema and one optional sslmode (disable, require, verify-full) are allowed URL parameters; duplicates, alternate hosts/search paths/services and mismatched identities are rejected without printing input. Passwords with URL-reserved characters must be percent-encoded by the owner.

Offline validation needs no variables or credentials. From the repository root with the existing Node 24 environment:

```sh
./node_modules/.bin/prisma validate --config task-04-server-security/prisma/prisma.config.ts
```

Database-connected commands are **owner-run** status and the separately guarded initial deploy, after setting the five connection/confirmation variables above (excluding the deploy-only flag) (including the shadow URL, even though status itself does not use the shadow):

```sh
./node_modules/.bin/prisma migrate status --config task-04-server-security/prisma/prisma.config.ts
```

Status does not apply migrations. An absent history/table is possible before the first migration; preserve the actual output rather than claiming success. The config rejects generate, db push/execute/pull, migrate dev/reset/resolve/diff and overrides such as --schema. Do not use the root npm Prisma scripts for this lab.

## SQL and writer requirements before any migration approval

Prisma declarations alone do not implement this list. The [hand-prepared initial SQL](migrations/20261028_task04_initial/migration.sql) now includes the row CHECKs and partial index. It has not been executed or PostgreSQL-verified. See the [migration review and owner gates](../docs/migrations.md) for remaining failure-code/lifecycle/immutability constraints. No Prisma migration-generation command ran.

| Table / concern | Required enforcement beyond current declarations |
| --- | --- |
| User | Nonblank synthetic email identifier; later name addition and nonblank constraint. The initial omission is intentional. |
| Session | CHECK expiresAt > createdAt. |
| PaymentIntent / Payment | CHECK amount > 0 and currency exactly three uppercase ASCII letters; document NUMERIC rounding/precision behaviour and validate inputs before writes. Reject changed payloads on an idempotency replay. |
| PaymentIntent | Preserve owner, amount, currency and idempotency key once attempts exist; reviewed locking/trigger/writer design must prevent concurrent changes. |
| PaymentAttempt | CHECK attemptNo > 0; outcome restricted to started/failed/abandoned/succeeded. Started requires finishedAt/failureCode NULL; failed requires both non-NULL; abandoned/succeeded require finishedAt and failureCode NULL. Terminal finishedAt >= startedAt. Define the failureCode allow-list before SQL approval; none is invented here. |
| PaymentAttempt partial index | B-tree on startedAt WHERE outcome = 'started', with the exact predicate. Do not substitute a full index or drop this documented index. |
| PaymentAttempt / Payment | Deferred constraint triggers must couple succeeded outcome and its unique receipt in both directions. An ordinary CHECK cannot inspect another row. Preserve terminal attempts and successful receipts; serialize attempt numbering and receipt finalization. The composite FKs already express matching intent/value/attempt, not success state. |
| RetrievalDocument | Nonblank sourceKey/sourceText; immutable source/owner/revision once chunked. |
| RetrievalChunk | CHECK ordinal >= 0 and nonblank content; immutable document revision. Controlled writer verifies source extraction, overlaps and both content digests; ordinary CHECKs cannot compare cross-table content. |

The FK and UNIQUE definitions must not be weakened to simplify generated SQL. Review partial-index and custom-trigger preservation during subsequent migrations; schema drift tooling does not prove every custom SQL invariant. No real financial transfers, authentication, retention policy or retrieval product feature is introduced.

## Dedicated shadow database and remaining gates

The owner verified the separate disposable database stitchtrack_task04_shadow, role stitchtrack_task04_shadow_app, host 127.0.0.1 and port 5432, with successful password authentication, no application tables and database CREATE privilege. These remain owner-reported observations; this change makes no database connection and does not independently verify privileges or emptiness.

The guard accepts **only that database/role/host/port** and requires schema=task04_test. This matches datasource.schemas and every @@schema mapping in the unchanged model. It selects a namespace inside the separate shadow database; it does not reuse task04_test inside stitchtrack_assessment. Missing/wrong schemas, duplicate parameters, alternate endpoints, product/shared databases and main-role credentials are rejected. No generic shadow variable is read.

Privately supply the complete, correctly percent-encoded shadow URL in the current WSL shell. A silent prompt keeps the entered URL out of terminal display and shell command history; paste it only at the prompt, never as a literal export command:

```sh
read -r -s -p "Task Four shadow URL: " TASK04_SHADOW_DATABASE_URL
printf '\n'
export TASK04_SHADOW_DATABASE_URL
```

Do not echo it, save it in tracked files, paste it into Git/evidence or share it with the agent. No dotenv file is loaded automatically. Exported variables last for that shell session; they are not registration of a secret in the repository. The existing main variables must also be set privately. Offline validate still reads neither URL and requires no environment configuration.

Prisma 7 accepts shadowDatabaseUrl under datasource in prisma.config.ts. When future migrate dev work is separately authorized, Prisma replays migrations and resets its configured shadow. Therefore it must stay disposable and dedicated. See [Prisma v7 shadow configuration](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database) and [multi-schema mapping](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema).

The shadow role's database CREATE privilege permits creating task04_test there; it is different from the cluster-level CREATEDB attribute, which is not needed for an explicitly provisioned shadow database. Before migration authorization, confirm CONNECT, ability to create the namespace, ownership/DDL rights for the resulting objects and ability to drop/recreate its own namespace during reset. Database CREATE alone does not authorize dropping another role's existing objects. Do not grant broader Task Two privileges or run the shared database as a superuser to work around errors.

The main role must retain its restrictions and sufficient ownership/DDL rights within the existing task04_test schema. Review any generated CREATE SCHEMA statements against that pre-provisioned main schema. The database/schema/role allow-list is configuration validation, not proof that a server has not been repurposed; the owner must keep the shadow exclusive and reconfirm its disposable status before future reset/replay.

**Current deployment phase: Evidence 04 preparation only.** The old initial-only gate is intentionally closed by the additional reviewed candidate. Only an explicitly confirmed required-column experiment can now use deploy; see the [owner sequence and recovery decision](../docs/required-column-failure.md). validate/status remain available, while reset, resolve, dev, diff, direct Prisma SQL and generation remain blocked. Main/shadow target guards and applied initial SQL are unchanged.

Next: review the synthetic seed and pending required-column migration and approve the recovery strategy before any owner execution. Do not rerun the historical Evidence 03 capture block. The owner will capture genuine Evidence 04; Evidence 05 and its exact narrowly guarded resolution require a separate approved slice. Financial/retrieval writers remain unimplemented and gated.
