# Task Four initial migration review

**Current state:** initial deployment/Evidence 03 is owner-verified at 1201216, genuine required-column failure/Evidence 04 at b3af65d, and three-step recovery/Evidence 05 at 528e166. The isolated model is aligned to 42 columns, including required TEXT name without a default; both executed SQL files/checksums are unchanged. The original failure is still unresolved. [Owner-only reconciliation](required-name-resolution.md) is prepared with exact-command/target/artifact guards, read-only pre/post checks and separate supplementary evidence. No agent database operation occurred.

The initial-DDL review below is historical: its 41 columns and 14 CHECKs describe the original migration, not the recovered 42-column/15-CHECK database. Its application instructions are retained for context and must not be repeated. Current execution instructions are only in the reconciliation runbook; Task Four Step 3 remains incomplete until genuine reconciliation/status and drift Evidence 06 are reviewed.

## Scope and prepared constraints

The draft creates seven synthetic tables and 41 columns, deliberately omitting User.name. The owner has since captured the required-column failure and completed nullable/backfill/required recovery; the current model includes nonblank name TEXT NOT NULL.

| Prepared SQL | Inventory / purpose |
| --- | --- |
| Columns | Exact model types/nullability; no invented ID generators, defaults, extra fields or authentication records. |
| Keys/indexes | 7 primary keys, 10 unique B-tree indexes, 2 ordinary B-tree indexes and the documented started-attempt partial index: 20 total. Supporting unique tuples and both correlated Payment FKs are preserved. |
| Relationships | 7 schema-qualified FKs with RESTRICT on delete/update. No cross-domain relationship. A unique paymentIntentId and successfulAttemptId enforce at most one receipt per intent/attempt. |
| Row CHECKs | 14 named checks: nonblank email/source labels/source content/chunk content; session expiry; finite positive money amounts and uppercase three-ASCII-letter currencies; positive attempt number, allowed outcomes, outcome-dependent NULL fields and finish ordering; nonnegative chunk ordinal. |
| Isolation | Every table/FK/index parent is explicitly task04_test-qualified. No schema creation, Task Two SQL, data inserts, grants, schema teardown or migration-history edits. |
| Preflight/transaction | BEGIN/COMMIT encloses DDL; a DO block checks the exact main or shadow database/role pair, existing schema ownership and UTF8 server encoding. Unexpected existing tables fail rather than being adopted. No URL/secret is logged. |

PostgreSQL requires unqualified index names in CREATE INDEX; the qualified ON table places each index in task04_test. See [PostgreSQL 16 indexes](https://www.postgresql.org/docs/16/sql-createindex.html). The provider lock file applies only to this isolated migration history. The SQL does not create _prisma_migrations; that is Prisma's tracking responsibility when an approved migration command eventually runs.

Nonblank checks use btrim with an explicit Unicode White_Space plus FEFF character set, including tabs/newlines and ordinary spaces. This only tests values; it does not trim or rewrite stored text. UTF8 encoding is a prerequisite to confirm, not an owner-verified fact recorded here. No general email-format or ownership assertion is added to synthetic lab identities.

NUMERIC(18,2) checks reject nonpositive values and NaN; constrained precision rejects infinities/out-of-range values, but PostgreSQL may round extra fractional digits before CHECKs. CHAR(3) and explicit casts may truncate or discard padding before validation. A future controlled writer must validate original numeric/currency inputs before conversion. No money-processing feature, currency pricing policy or tax-compliance promise follows.

## Unresolved application gates

The previous review grouped structural rehearsal and data-write readiness too broadly. **The initial migration can be reviewed for an empty-schema DDL rehearsal without first implementing a writer or every future trigger.** It is not yet permission to apply SQL, populate financial/retrieval workflows or claim the complete schema security model is enforced.

| Gate | Needed when / present status |
| --- | --- |
| Correct database/role/schema and Task Two isolation | Essential before any rehearsal or initial application: exact target pairs, restricted owners/privileges, explicit qualification, preserved Task Two baseline and separate disposable shadow. Present in configuration/SQL; live target facts are owner-reported. |
| Structural constraints and transaction | Essential in the initial migration: all 41 columns, 7 PKs, 20 indexes, 7 FKs, 14 row CHECKs, BEGIN/COMMIT and confirmed UTF8. Prepared; the owner reports successful shadow DDL/COMMIT. Main application and negative/rollback cases remain untested. |
| Failure-code membership | May be a later controlled CHECK migration, but approve/enforce its actual domain before recording failed attempts. Current CHECKs enforce outcome-dependent presence only. Proposal below is not enforced. |
| Success/receipt equivalence | May follow the empty structural baseline, but reviewed deferred triggers must precede authoritative succeeded attempts/Payments. No trigger currently guarantees that a Payment refers to a succeeded attempt or that every succeeded attempt has its receipt at commit. |
| Concurrency and recovery | Before enabling an attempt writer: lock the intent before allocating attemptNo or transitioning/finalizing work; recheck under lock, finalize success plus receipt atomically and test two-session races. A deferred SELECT alone does not serialize competing writes. Persist started separately before fallible work; uncertain commit outcomes require reconciliation. No writer/locking protocol is implemented. |
| Immutability and retention of history | Controlled follow-up guards must precede terminal financial history and chunked document revisions: protect terminal attempts, receipts, attempted intent facts and document/chunk history, including deletion. RESTRICT FKs alone do not make rows immutable. |
| Extraction/digest integrity | Required before the chunk writer: validate source extraction, digest correctness, revision and any overlap policy. No algorithm or writer is selected by this migration. |

Do not use missing financial controls to block an independently approved User-only synthetic required-column exercise. Such an exercise still needs its own owner-controlled plan and evidence; it is not authorized here. Keep the affected financial/retrieval tables empty until their respective safeguards exist. If the owner wants fully constrained financial data from the first write, complete/review those safeguards in this never-applied draft instead. Once successfully applied, additions use new forward migrations.

### Proposed synthetic failureCode domain - owner review required

| Proposed code | Meaning limited to receipt-recording work |
| --- | --- |
| RECORDING_REJECTED | A known validation/integrity condition rejected the receipt write after the attempt started; non-commit/rollback is confirmed. |
| RECORDING_TIMEOUT | A controlled recording deadline cancelled the work and rollback/non-commit is confirmed. A lost response or unknown commit result is not enough. |
| RECORDING_ERROR | Another recording-system exception prevented completion and non-commit/rollback is confirmed. Store the constant category, not raw SQL/driver messages. |

These three codes are a **lab-only proposal**, not an approved product policy, observed incident list or payment-provider response taxonomy. They concern recording a synthetic external receipt, never bank authorization, card decline or a charge. An idempotent replay returning an existing Payment is not a failed attempt or new money. Malformed requests rejected before an intent/attempt exists do not need invented attempt records.

If commit outcome is uncertain, reconcile using intent/receipt identifiers before assigning a terminal failure; do not automatically label it failed or create another receipt. Abandoned work uses the existing abandoned outcome and NULL failureCode under a separately defined cancellation/timeout policy. Owner approval would be followed by a reviewed membership CHECK (or modification of the existing state CHECK) before failed rows are written; the current inventory remains 14 CHECKs and no allow-list was silently applied.

See [PostgreSQL 16 CHECK limitations](https://www.postgresql.org/docs/16/ddl-constraints.html) and [constraint triggers](https://www.postgresql.org/docs/16/sql-createtrigger.html). No owner migration, backfill, failure, drift or race test is claimed.

## Shadow replay preflight review

The original SQL already admits exactly stitchtrack_assessment/stitchtrack_task04_test_app and stitchtrack_task04_shadow/stitchtrack_task04_shadow_app. **No database/role allow-list correction was necessary**, and it remains unchanged. It rejects cross-paired roles, product/shared databases and autogenerated shadow names. config.ts additionally checks URLs, host/port and schema; those stronger configuration guards remain untouched. SQL database/role checks cannot independently establish a server's identity.

I inspected the source at the installed Prisma 7.10.1 engine revision d1b3f377ca835d73fd50954a5e22128b9ebdd6b8: the normal PostgreSQL reset path drops/recreates the selected namespace through its connection, and connection setup can create a missing default namespace. With the dedicated shadow role and schema=task04_test, the recreated schema is expected to belong to that role. This supports retaining the exact ownership check instead of removing it or adding schema-creation privileges to the main role. [Pinned PostgreSQL connector source](https://raw.githubusercontent.com/prisma/prisma-engines/d1b3f377ca835d73fd50954a5e22128b9ebdd6b8/schema-engine/connectors/sql-schema-connector/src/flavour/postgres.rs) (reset/setup_connection); [Prisma v7 shadow behaviour](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database).

This is source-backed reasoning, **not a reproduced replay pass or failure**. An absent schema, different owner or insufficient reset privileges must stop the owner run for investigation. No arbitrary target names, superuser fallback, ownership bypass or CREATE SCHEMA statement has been added to the migration. The dedicated shadow role still needs its verified database CREATE privilege and the ability to reset its own schema. The main role's schema-creation restriction remains intentional.

### Scope and inventory review

The review found no mismatch in the transitional model: 7 tables / 41 columns / 20 indexes / 7 FKs / 14 CHECKs. User.name remains absent. Both full-value intent and same-intent successful-attempt FKs remain; the two single-column Payment unique keys enforce the maximum-one results. Positive money checks also reject NaN; currency is constrained to three uppercase ASCII letters. Outcome checks cover required/forbidden NULL combinations and finish ordering. Nonblank tests do not alter stored input.

Every CREATE TABLE, ALTER TABLE, REFERENCES and index ON target is qualified task04_test. Index names inherit their parent schema by PostgreSQL syntax. The DO block only reads pg_catalog; no user object outside task04_test is targeted, and the script does not create/change either _prisma_migrations table. Restricted roles and owner verification remain part of isolation; this is not a claim that any SQL script is harmless when run by an administrator on the wrong server.

## Owner-only shadow rehearsal runbook

The [dedicated rehearsal helper and capture instructions](migration-rehearsal.md) provide a narrow, owner-only direct SQL rehearsal on the fixed disposable shadow. It requires a reviewed digest and shadow-only empty-schema checks, creates no Prisma history and keeps its transcript separate from Evidence 03. The owner reports that shadow-only path succeeded and its external log is preserved. The subsequent initial main deploy is now separately enabled through the guarded Evidence 03 runbook; reset and other migration commands remain blocked. Evidence 03-06 remains explicitly planned in that runbook.

## Owner review and eventual application

1. Review the SQL and the distinction between initial-DDL gates and later affected-domain data-write gates first. Confirm User.name is absent, all seven FK definitions/candidate keys match, and the partial index has exactly the started predicate. Check every statement and both permitted database/role pairs. No target credentials belong in Git or evidence.
2. Keep the currently verified main and shadow databases distinct. Owner confirms task04_test exists and is owned by its respective restricted role, UTF8 encoding and DDL privileges; preserve Task Two's public tables/history and record its baseline through a separately authorized identity. Do not grant the Task Four role access to Task Two for comparison.
3. Satisfy the initial-DDL gates and explicitly approve an empty structural rehearsal against the separate disposable shadow; decide which later data-write controls will be separate migrations. It must contain no shared application data. That shadow rehearsal is now owner-reported successful; do not repeat it or reset the shadow. Preflight permits the verified shadow pair without weakening the main configuration guard.
4. The owner has approved the narrow configuration change allowing only the rehearsed initial owner-run deploy. Use the dedicated Evidence 03 capture block. Do not bypass the main-target guard by changing environment variable names, using root configuration, manually applying SQL to the assessment target or marking it applied. The separately documented shadow-only helper is a rehearsal exception, not main application. A direct SQL run alone does not record a Prisma migration.
5. The intended eventual application is Prisma migrate deploy with --config task-04-server-security/prisma/prisma.config.ts, using the dedicated main URL with schema=task04_test. That command is now enabled only through the [owner Evidence 03 capture runbook](migration-rehearsal.md#evidence-03---genuine-initial-prisma-deployment), after its explicit confirmations and preflight; the agent must not run it. Deploy does not use the shadow; rehearsal/replay remains a separate owner-controlled step. Keep reset/resolve/drift commands separately controlled.
6. Owner captures the actual migration command and full sanitized output as Evidence 03. Then independently verifies all table definitions, 14 CHECKs, 20 indexes, 7 FKs, and any subsequently approved triggers. Check DDL rollback and structural constraints in the approved synthetic target. Financial transition/race checks belong after the corresponding safeguards are added and approved; this initial migration does not establish them. Compare Task Two with its recorded baseline.

Prisma's tracking table must be task04_test._prisma_migrations, separate from the existing public._prisma_migrations. Before and after eventual execution, the owner can inspect catalog names with this read-only query (not run by the agent):

```sql
SELECT schemaname, tablename
FROM pg_catalog.pg_tables
WHERE tablename = '_prisma_migrations'
ORDER BY schemaname;
```

After successful application, the owner verifies the expected migration record in the qualified task04_test._prisma_migrations table (migration_name = '20261028_task04_initial', finished_at set, no rolled_back_at) and confirms Task Two history is unchanged through the appropriate authorized identity. Schema names alone do not prove rows/checksums are unchanged. Stop on unexpected history, partial state or any request to reset. The migration transaction may roll back table DDL while Prisma still retains a failed tracking record; never guess recovery or delete history.

Keep finalized migration SQL/provider lock in version control only when the owner authorizes Git operations. After a successful application, corrections use new forward migrations; do not edit applied SQL. Manual migrations cost review, locking, failure recovery, replay and evidence work, so all custom CHECKs, partial indexes and future triggers must stay recorded. Required-column failure/backfill and drift evidence 04-06 remain pending.

## Verification limits and current reconciliation

Offline checks cover configuration, model contracts, unchanged SQL hashes and prepared read-only history comparisons. They do not prove PostgreSQL execution, deparser output, resolution record shape, replay or concurrency safety. Owner evidence 03/04/05 supplies the actual earlier results. The [reconciliation runbook](required-name-resolution.md) prepares only the exact completed required-name migration for resolution; it records no successful result in advance.

Prisma may retain the original failed row with a resolution timestamp and insert a separate applied record. Capture actual before/after history and preserve the original ID/logs rather than assuming in-place success. No tracking-table SQL edits, reset, retry, or modified migration checksum are authorized. Guarded migrate status checks history after resolution; drift Evidence 06 and all financial/retrieval writer gates remain separate.
