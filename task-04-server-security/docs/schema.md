# Task Four schema: disposable assessment laboratory

## 1. Scope and database boundaries

**Current design reference; lab implementation and owner migration evidence are captured.** The [isolated Prisma model](../prisma/schema.prisma) now has 42 columns, including recovered required User.name. [Migration evidence/status](migrations.md) distinguishes implemented constraints from planned writer/trigger safeguards; those safeguards are not claimed as installed. This specification was prepared before implementation and retains its rationale. The owner's assessment requires at least five tables covering people, sessions, money, separate money attempts and retrieval chunks. This seven-table design covers those categories using synthetic records only. It does not authorize product financial processing or retrieval.

PaymentIntent means a request to record one full synthetic external receipt; Payment is the recorded result, not evidence that money moved. Zero or one full Payment per intent fits that meaning; partial/multiple-payment workflows would require a different design. The thirteen proposed product tables and authentication constraints are maintained separately in the [product schema proposal](product-schema-proposal.md).

The [PRD](../../docs/PRD.md) is authoritative and read-only. Follow [AGENTS.md](../../AGENTS.md) and the [product](../../.agent/rules/01-product.md), [engineering](../../.agent/rules/02-engineering.md) and [design](../../.agent/rules/03-design.md) rules.

Keep separate product development, product test and disposable Task Four laboratory targets, roles, configuration and migration histories, with no fallback between them. Lab FKs never cross into product or Task Two tables. Lab roles must not have product/Task Two privileges. Any shadow database for deliberate drift/failure work must also be independently verified as disposable.

The owner confirms actual server/database/role identity, privileges, population and migration history before operations and executes all migrations, backfills and drift exercises. Agents never operate on the development database; test-database operations require task-specific authorization. Keep generation/typecheck/build database-free. No database names, credentials or connection strings are prescribed.

Existing source declares only [AssessmentEnquiry](../../prisma/schema.prisma), mapped to task_two_enquiries. Preserve its [migration](../../prisma/migrations/20261023_task_two_enquiry/migration.sql), [Prisma configuration](../../prisma.config.ts) and [Task Two guard](../../lib/assessment/config.ts). It has no FK to these proposals. Its full specification is outside this reference; source declarations do not establish live database state.

## 2. Types, keys and index conventions

- Every column states its PostgreSQL type and NULL/NOT NULL status. Opaque identifiers use TEXT; event instants use TIMESTAMPTZ(3). Server-controlled times require a writer; updatedAt is not assumed to be automatic in PostgreSQL.
- PK and UQ denote primary/unique keys; IX denotes a secondary index. All listed indexes are B-tree. Each table lists every proposed index separately, including PK/UNIQUE-created and partial indexes. No unlisted secondary indexes are implied.
- Insert/delete maintains applicable index entries; key/predicate changes also maintain them. Other updates still cost row/WAL work; actual index writes depend on PostgreSQL update behaviour. Costs here are qualitative, not benchmark results.
- Supporting UNIQUE tuples containing an already unique id deliberately provide exact composite FK targets. Partial uniqueness is not used as an FK target. Existing leading-key indexes cover the stated reverse-FK queries without duplicate indexes.
- FKs enforce matching keys, not current authorization, expiry or cross-table lifecycle. Those rules need reviewed transactions and, where specified, deferred constraint triggers rather than ordinary CHECKs.
- Referenced-row deletion defaults to RESTRICT; no destructive cascades are proposed. Disposal/retention require separate owner review; no retention period is inferred.
- Repeated FK identifiers represent normalized relationships. Each table additionally discloses snapshots, derived facts and deliberate non-key duplication, or states that none is intended.

## 3. Seven table specifications

### L01. User

Synthetic person in the disposable lab, not a real product identity or account.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| name | TEXT | NOT NULL | Nonblank synthetic person's name; not indexed. |
| emailCanonical | TEXT | NOT NULL | Unique nonblank synthetic identifier. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(emailCanonical).

**Constraints:** name must contain at least one non-whitespace character. No name-format restriction or name index is proposed. No product FK or password is required for this relational exercise.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(emailCanonical) | Prevent duplicate synthetic users and support identifier lookup. | Adds a unique B-tree entry/check on creation or email change. |

**Intentional duplication:** No non-key duplicated fact within the lab. A separate lab identity intentionally isolates the exercise; it is not copied from product User.

**Security and lifecycle:** Synthetic input only. Lab sessions confer no application access. Owner-controlled disposal follows evidence preservation.

### L02. Session

Synthetic session lifecycle illustration, not authentication.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| userId | TEXT | NOT NULL | FK to Lab.User.id. |
| tokenDigest | TEXT | NOT NULL | Unique synthetic token verifier; not a live bearer credential. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| expiresAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(tokenDigest).

**Constraints:** expiresAt > createdAt; optional revocation does not erase the historical row during the exercise.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(tokenDigest) | Unambiguous synthetic session lookup and duplicate-verifier prevention. | Adds a uniqueness/index write on creation or rotation. |
| IX(userId) | Retrieve/revoke a user's illustrative sessions and cover reverse FK checks. | Adds insert/delete/owner-key maintenance. |
| IX(expiresAt) | Select expired lab sessions for lifecycle inspection/cleanup. | Adds insert/delete/expiry-update maintenance. |

**Intentional duplication:** No non-key fact is deliberately duplicated in another lab table. This server expiry is not copied from a real product session/cookie.

**Security and lifecycle:** Never load these rows into Better Auth. Owner chooses actual synthetic lifecycle values and cleanup; no production session policy is established.

### L03. PaymentIntent

One immutable synthetic request to record a full externally paid receipt; not a charge request, gateway checkout or product payment feature.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| userId | TEXT | NOT NULL | FK to Lab.User.id; owner/requester of this synthetic recording intent. |
| idempotencyKey | TEXT | NOT NULL | Caller-operation identifier scoped to that User. |
| amount | NUMERIC(18,2) | NOT NULL | Positive intended synthetic receipt amount. |
| currency | CHAR(3) | NOT NULL | Three uppercase ASCII letters; explicit synthetic test choice. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(userId, idempotencyKey); UQ(id, amount, currency).

**Constraints:** amount > 0; currency matches three uppercase ASCII letters. Intent financial fields/owner/idempotency key are immutable once attempts begin. Reusing the scoped key with a different amount/currency is rejected. This proposal allows exactly zero or one full Payment result, not partial/multiple payments per intent. Precision/currency choices are lab examples, not product commercial limits.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(userId, idempotencyKey) | Resolve one user's replayed recording request without creating a second intent; covers user FK lookups. | Adds a uniqueness check/B-tree entry on creation; no redundant userId-only index. |
| UQ(id, amount, currency) | Unconditional referenced key for exact Payment intent/amount/currency matching. | Repeats id in an additional index for composite FK integrity; adds storage and insert maintenance. |

**Intentional duplication:** Payment deliberately repeats the immutable amount/currency as its self-contained receipt snapshot, constrained to match here. Idempotency key belongs only here; attempts reference intentId rather than free-text grouping keys.

**Security and lifecycle:** Create an intent only after a structurally valid synthetic recording request. An intent alone does not mean money was recorded. Attempts can fail/abandon while the intent remains without Payment. No stored running balance or copied user email/name.

### L04. PaymentAttempt

One initiated processing attempt against an existing synthetic intent, including failed/abandoned work that produced no receipt.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| paymentIntentId | TEXT | NOT NULL | FK to Lab.PaymentIntent.id. |
| attemptNo | INTEGER | NOT NULL | Positive sequence within the intent. |
| outcome | TEXT | NOT NULL | Checked started, failed, abandoned or succeeded; success means receipt recording only. |
| failureCode | TEXT | NULL allowed | Allow-listed category required for failed, absent for other states. |
| startedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| finishedAt | TIMESTAMPTZ(3) | NULL allowed | Required for terminal outcomes; NULL for started. |

**Candidate keys:** PK(id); UQ(paymentIntentId, attemptNo); UQ(id, paymentIntentId).

**Constraints:** attemptNo > 0. started requires finishedAt/failureCode NULL; failed requires both; abandoned/succeeded require finishedAt and failureCode NULL. Terminal finishedAt >= startedAt. Terminal attempts are immutable. Receipt creation and successful finalization are atomic; reviewed deferred constraint triggers must enforce that Payment points to a succeeded attempt and every succeeded attempt has its corresponding Payment. Those cross-table conditions cannot be expressed as ordinary CHECKs.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(paymentIntentId, attemptNo) | Prevent duplicate attempt numbers and retrieve ordered attempts; covers the intent FK. | Adds a uniqueness/index write; sequence allocation must serialize per intent. |
| UQ(id, paymentIntentId) | Referenced composite key proving a Payment's successful attempt belongs to that same intent. | Logically redundant with id uniqueness but required for the proposed composite FK; extra B-tree storage/write. |
| Partial IX(startedAt) WHERE outcome = 'started' | Find in-flight attempts eligible for an explicit abandonment/timeout decision. | Adds an entry on start, removes it at finalization; not a full-history status index. |

**Intentional duplication:** No duplicate owner, idempotency key or money columns: derive them from the immutable intent. Attempt outcome and successful Payment existence overlap intentionally as process versus financial-result evidence, with consistency enforced at commit.

**Security and lifecycle:** Persist started before the fallible receipt transaction so rollback cannot erase the attempted work. Finalize failed/abandoned separately when appropriate; an abandoned state requires a real explicit cancellation/timeout rule, not guessed browser departure. Retry uses a new attemptNo. An already-complete idempotent replay may return the existing Payment without another processing attempt; it is not new money.

### L05. Payment

A successful synthetic manually recorded receipt for one intent, not a transfer/charge or independently verified payment.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| paymentIntentId | TEXT | NOT NULL | Unique; part of FKs to both matching intent and successful attempt. |
| successfulAttemptId | TEXT | NOT NULL | Unique; part of FK to PaymentAttempt(id,paymentIntentId). |
| amount | NUMERIC(18,2) | NOT NULL | Positive receipt snapshot matching the immutable intent. |
| currency | CHAR(3) | NOT NULL | Receipt currency snapshot matching the immutable intent. |
| paidAt | TIMESTAMPTZ(3) | NOT NULL | Synthetic external payment date recorded for the example; not independently verified. |
| recordedAt | TIMESTAMPTZ(3) | NOT NULL | Server time the receipt was recorded. |

**Candidate keys:** PK(id); UQ(paymentIntentId); UQ(successfulAttemptId).

**Constraints:** Composite FKs prohibit a different amount/currency or cross-intent successful attempt. amount > 0; currency three uppercase ASCII letters. Deferred trigger/transaction design enforces successful-attempt outcome and one authoritative receipt. Payment has no direct User FK: its owner is derived through PaymentIntent. No blind equality/ordering constraint on paidAt versus recordedAt is imposed.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(paymentIntentId) | Prevent duplicate financial receipts for concurrent retries of one intent; covers intent-led FK checks. | Adds a uniqueness check/index write on receipt creation. |
| UQ(successfulAttemptId) | One attempt cannot create two receipts; supports attempt-led composite FK checks. | Adds another unique B-tree; no redundant successfulAttemptId-only index. |

**Intentional duplication:** amount/currency intentionally repeat the intent so receipt evidence is self-contained; the composite FK prevents drift. paymentIntentId repeats the selected attempt's intent to enforce correlation. paidAt and recordedAt describe different events, not duplicate facts.

**Security and lifecycle:** Preserve successful financial records; do not overwrite one when a retry fails. A production reversing-entry ledger, refunds, tax reporting and payment processing remain outside this lab design. Totals use recorded Payments, never failed attempts or intent amounts alone.

### L06. RetrievalDocument

Immutable synthetic source text and its owner.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| ownerUserId | TEXT | NOT NULL | FK to Lab.User.id. |
| sourceKey | TEXT | NOT NULL | Nonblank source/revision label unique within owner. |
| sourceText | TEXT | NOT NULL | Nonblank synthetic document snapshot. |
| contentDigest | TEXT | NOT NULL | Integrity digest of that snapshot. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(ownerUserId, sourceKey).

**Constraints:** Once chunked, sourceText/digest/sourceKey/owner are immutable. A changed synthetic source uses a new revision label/document rather than silently invalidating old chunks.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(ownerUserId, sourceKey) | Prevent duplicate source/revision labels for one owner and support document ownership/FK lookup. | Adds a scoped uniqueness/index write; no redundant ownerUserId-only index. |

**Intentional duplication:** sourceText is intentionally repeated in chunk excerpts to permit chunk-sized retrieval/storage demonstrations. contentDigest is a derived integrity fact, not encryption or a separate secret.

**Security and lifecycle:** Only synthetic text, no private garment/customer content. No runtime retrieval, embeddings, model calls or vector extension. Owner-reviewed disposal occurs after preserving the exercise evidence.

### L07. RetrievalChunk

Ordered synthetic excerpt of exactly one stored source document.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque synthetic primary key; never a product identity. |
| documentId | TEXT | NOT NULL | FK to Lab.RetrievalDocument.id. |
| ordinal | INTEGER | NOT NULL | Zero-based nonnegative position within this document. |
| content | TEXT | NOT NULL | Nonblank synthetic source excerpt. |
| contentDigest | TEXT | NOT NULL | Integrity digest of the chunk text. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(documentId, ordinal).

**Constraints:** ordinal >= 0 and content nonblank. Chunk extraction/digest/overlap validation belongs to the controlled lab writer; a normal row CHECK cannot compare content against another table. No arbitrary content/embedding maximum is selected here.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(documentId, ordinal) | Prevent duplicate positions and support ordered chunks/source lookup; also covers the document FK. | Adds index/uniqueness work for every inserted chunk. Chunking increases row count/storage/write amplification. |

**Intentional duplication:** Chunk text intentionally repeats an excerpt of sourceText; overlaps, if used, also repeat adjacent text. Digest deliberately repeats a derived integrity fact. owner/source labels are not copied into each chunk, avoiding inconsistent ownership/source metadata.

**Security and lifecycle:** Chunks are immutable for their document revision. No speculative full-text/vector indexes or search endpoint. The lab is not an approved product retrieval feature.

## 4. Complete relationship matrix

All referenced tuples are unconditional PK/UNIQUE keys listed in the table specifications. Parent-side minimum is zero: a parent can exist before any child. Each matrix row is one FK definition; no additional relationships are implied.

| Child FK columns | Referenced parent PK/UQ columns | Relationship and cardinality |
| --- | --- | --- |
| Lab.Session(userId) | PK Lab.User(id) | One-to-many: Lab.User 1 : 0..* Lab.Session; each Session has exactly one User. |
| Lab.PaymentIntent(userId) | PK Lab.User(id) | One-to-many: Lab.User 1 : 0..* Lab.PaymentIntent; each intent has exactly one User. |
| Lab.PaymentAttempt(paymentIntentId) | PK Lab.PaymentIntent(id) | One-to-many: PaymentIntent 1 : 0..* PaymentAttempt; every attempt belongs to exactly one intent. |
| Lab.Payment(paymentIntentId, amount, currency) | UQ Lab.PaymentIntent(id, amount, currency) | One-to-one with optional child: PaymentIntent 1 : 0..1 Payment; every Payment has exactly one matching full-value intent. |
| Lab.Payment(successfulAttemptId, paymentIntentId) | UQ Lab.PaymentAttempt(id, paymentIntentId) | One-to-one with optional child: PaymentAttempt 1 : 0..1 Payment; each Payment identifies exactly one successful attempt of that same intent. |
| Lab.RetrievalDocument(ownerUserId) | PK Lab.User(id) | One-to-many: Lab.User 1 : 0..* RetrievalDocument; each document has exactly one owner. |
| Lab.RetrievalChunk(documentId) | PK Lab.RetrievalDocument(id) | One-to-many: RetrievalDocument 1 : 0..* RetrievalChunk; every chunk belongs to exactly one document. Owner is derived, not another User FK. |

Payment/attempt owners are derived through PaymentIntent; chunks derive owner/source from RetrievalDocument. No duplicate User FK is added to either. The seven rows above cover every lab FK, including the two correlated Payment FKs; there are no many-to-many relationships.

## 5. Attempts and financial history

A failed or abandoned PaymentAttempt is useful independently of a Payment: it records initiated work, intent, sequence, timing and terminal outcome, including an allow-listed failure category. Persist started before the fallible receipt transaction so rollback cannot erase the attempt; preserve terminal failures when a later retry succeeds. Abandonment requires an explicit cancellation/timeout rule, not an inference that a browser closed. Malformed requests rejected before creating a valid intent are not automatically financial attempts.

**Business drop-off analysis:** compare intents with no attempt, started attempts awaiting resolution, terminal failures/abandonments and intents with a final Payment. Count distinct intents for completed operations and attempts for retry/failure rates; multiple retries are not multiple customers or receipts. These records can locate where a synthetic recording workflow stops and whether recovery succeeds, but do not establish why a person left or how many unrecorded visits occurred. They measure recording-workflow drop-off, not a payment checkout or proven lost revenue.

**Reconciliation and disputes:** join Payment to its immutable intent and successful attempt, then inspect the intent's ordered attempt history. Compare amount/currency, paidAt (reported external payment time), recordedAt and outcomes. Totals use Payments, not intent amounts or failed attempts. The composite FKs, uniqueness and deferred lifecycle enforcement prevent mismatched values, cross-intent attempts and duplicate receipts. A successful attempt without its Payment is an integrity failure, not proof of money received. The record trail can explain retries or conflicting accounts; it does not adjudicate garment workmanship.

**A tax authority asks about a particular transaction from 14 months ago:** if the records remain available and disclosure is authorized, retrieve Payment by its PK (or resolve the owner's idempotency key through the existing scoped unique index), follow its intent and successful-attempt FKs, and retrieve all attempts using the intent/attemptNo index. Report the recorded owner, amounts/currency, reported payment date, recording time and process trail. Compare these with independently available bank/POS receipts or other external evidence and explain discrepancies; synthetic/manual records alone do not prove an external transfer. If only a date/amount is supplied, the current design may require a scoped scan because no date/amount index is proposed; this example adds no index. If records were lawfully deleted or never existed, disclose that limitation rather than reconstructing evidence.

The 14-month example is not a retention promise. The disposable lab does not establish real transaction history, a complete ledger, tax compliance or a legal disclosure procedure. Actual record-category retention, correction, legal-hold and disclosure obligations require qualified review before product financial workflows.

## 6. Handwritten drawing blueprint

The owner must draw and photograph the schema on paper **before implementation**. This text is a drawing reference, not substitute evidence. Use one clearly labelled disposable-lab panel, separate from any product proposal. Prefix Lab is a diagram qualifier, not a selected database/schema name.

~~~text
DISPOSABLE LAB (7 synthetic tables; no product FKs)
User 1 -- 0..* Session
User 1 -- 0..* PaymentIntent
PaymentIntent 1 -- 0..* PaymentAttempt
PaymentIntent 1 -- 0..1 Payment       [Payment.paymentIntentId UNIQUE]
PaymentAttempt 1 -- 0..1 Payment      [successfulAttemptId UNIQUE]
User 1 -- 0..* RetrievalDocument
RetrievalDocument 1 -- 0..* RetrievalChunk

CORRELATED PAYMENT FKs:
Payment(paymentIntentId, amount, currency)
  -> PaymentIntent(id, amount, currency) UNIQUE
Payment(successfulAttemptId, paymentIntentId)
  -> PaymentAttempt(id, paymentIntentId) UNIQUE
~~~

Copy the seven complete column lists above with types/nullability, PK/UQ keys and all index predicates; include User.name TEXT NOT NULL (nonblank, no name index). Mark both ends of each FK arrow using the matrix. Add a note that commit-time lifecycle enforcement couples succeeded attempts to their unique Payment; a CHECK alone cannot enforce another row's outcome. User ownership of Payments/attempts is derived through PaymentIntent, and chunk ownership through RetrievalDocument. There is no lab many-to-many join.

Photograph the actual legible paper drawing as genuine Evidence 01, without generating a replacement. The owner's existing drawing must be checked against this reference; no photograph is inspected, renamed or modified by this edit. Capture the actual initial database state separately for Evidence 02 before any migration. Deliberate required-column/drift failures use only approved disposable targets, never product development.

## 7. Completeness and implementation gates

This reference specifies **7 tables, 42 columns, 20 indexes and 7 FK definitions**. Each table retains types/nullability, candidate keys, constraints, individual index reasons/write costs, duplication and lifecycle; the matrix is the single full relationship inventory.

The seven structural tables are now owner-migrated. Before adding any lab writer, retain the disclosed lab/product interpretation and review transaction locking, attempt sequence allocation, explicit abandonment rules and deferred lifecycle triggers. Keep immutable terminal attempts and the single full-value result semantics. The owner must verify the drawing, actual initial database state and disposable targets; no evidence or database execution is supplied by this specification.

See the [Task Four overview](../README.md) for the remaining assessment work. No product schema, production feature or retention policy is approved by this reference.
