# Proposed StitchTrack schema and authentication architecture

## 1. Authority and design status

**Proposal only: no new Prisma models, migrations or database operations.** Baseline: 1aab84c on feat/task-03-auth-foundation. This design follows the owner's Task Four requirements, [AGENTS.md](../../AGENTS.md), the [product](../../.agent/rules/01-product.md), [engineering](../../.agent/rules/02-engineering.md) and [design](../../.agent/rules/03-design.md) rules, and the authoritative, read-only [PRD](../../docs/PRD.md), especially sections 2, 4, 6 and 7.

The owner must draw the schema on paper and photograph it before implementation. This document is a drawing blueprint, not Evidence 01. Actual database state has not been inspected; source declarations are not a table inventory from PostgreSQL.

| Domain | Existing, needed or deferred |
| --- | --- |
| Task Two AssessmentEnquiry | Existing source model/migration; preserved, separate from authentication. |
| User, CredentialAccount, Session, VerificationChallenge | Proposed authentication core for Task Four. No implementation today. |
| RateLimitBucket, EmailOutbox | Proposed shared abuse protection and durable background handoff before real endpoints/email. |
| TermsVersion, TermsAcceptance | Future controlled integration, dependent on approval of actual legal text and release. |
| Business, BusinessMember | Proposed ownership boundary before protected business features; no additional staff roles. |
| Client, ClientInvitation, ClientAccountLink | Proposed relationship contracts for the later client workflow, not authorization to implement the whole portal now. |
| Orders, garment agreements, manual payments | Deferred product milestones; only integrity/relationship boundaries below. |
| Five Lab tables | Disposable synthetic assessment domain, not production product models. |

All names/columns are logical contracts. The selected Better Auth version and plugins may require different physical names, supported extra fields or an associated lifecycle record. Verify that mapping before Prisma implementation; do not assume adding columns changes plugin behaviour. Use one authentication authority, not a parallel custom password/session/OTP engine.

## 2. Existing source schema — unchanged

[prisma/schema.prisma](../../prisma/schema.prisma) declares AssessmentEnquiry, mapped to task_two_enquiries:

| Column | PostgreSQL type / nullability | Constraint and purpose |
| --- | --- | --- |
| id | SERIAL, NOT NULL | Primary key; generated receipt identifier. |
| requestId | UUID, NOT NULL | Unique request receipt identifier. |
| name | VARCHAR(80), NOT NULL | Synthetic assessment name. |
| enquiry | VARCHAR(500), NOT NULL | Synthetic enquiry. |
| createdAt | TIMESTAMPTZ(3), NOT NULL | Defaults to current time. |

There are no foreign keys or product relationships. PK/requestId B-tree indexes add insert costs; requestId uniqueness supports receipt lookup and prevents repeated identifiers. No product-data duplication is intentional. Applied migrations and historical records require reviewed cleanup, not automatic deletion.

The [migration file](../../prisma/migrations/20261023_task_two_enquiry/migration.sql) is source evidence, not proof of current database history. [prisma.config.ts](../../prisma.config.ts) uses [Task Two's explicit configuration guard](../../lib/assessment/config.ts). Preserve these files and their offline generation behaviour. Do not repurpose that connection for product authentication or assume the live database contains only this table.

## 3. Database boundaries and table notation

| Boundary | Purpose and ownership |
| --- | --- |
| Product development database | Owner-managed development; agents must not connect to or operate on it. No deliberate failure/drift exercise. |
| Product test database | Separately verified synthetic authentication/integration target; no development fallback. Agent database operations require explicit task-specific permission. |
| Disposable Task Four laboratory | Separate database, restricted role and independent migration/configuration history. Financial/chunk tables and deliberate migration failures stay here. Any shadow database must also be disposable and independently verified. |

These are boundary descriptions, not invented database names. The owner verifies actual server/database/role identity, schemas, tables, existing rows, privileges and migration history before operations. Separate migration/application privileges where appropriate. The lab role must have no rights over product or Task Two data; no product customer records are copied into it.

Future product and lab Prisma schemas/configurations need separate migration histories and client outputs from Task Two. Missing/mismatched explicit configuration must fail closed for database operations. No cross-database foreign keys or fallback connection is proposed. Generation, typechecking and builds must remain offline and not require real credentials. Final paths/configuration are future reviewed implementation work.

Notation for all proposed tables:

- A question mark after a type means nullable. Every other listed column is NOT NULL.
- id TEXT PK means an opaque primary key compatible with the approved adapter; the generator remains to be verified. No guessed UUID-only restriction on library IDs.
- time means TIMESTAMPTZ(3). Server-generated createdAt/updatedAt and event times are not trusted client assertions.
- TEXT/request byte bounds and encoding must be reviewed before real processing; no arbitrary password truncation is implied. Checked state values may map to CHECK constraints or database enums after review.
- PK/UNIQUE constraints create indexes and write costs. PostgreSQL does not automatically index all referencing FK columns. Avoid redundant indexes covered by a unique key's leading columns.
- Default referential deletion is RESTRICT/NO ACTION. Do not cascade-delete approved agreements or actor history. Ephemeral cleanup and privacy/retention rules need separate approval; no final periods are invented here.
- Each table below gives purpose, columns, keys/cardinality, indexes/write costs, duplication and lifecycle. All constraints are proposals until implemented and tested.

## 4. Proposed product tables

### User — global identity; Task Four core

**Columns:** id TEXT PK; emailCanonical TEXT UNIQUE; emailVerified BOOLEAN default false; disabledAt time?; createdAt time; updatedAt time.

**Keys and relationships:** one User to zero/one CredentialAccount, many Sessions, BusinessMembers and ClientAccountLinks. An identity may participate in separately authorized business relationships. Global identity/email alone grants no business access and adds no third V1 user type.

**Constraints:** emailCanonical is nonblank and unique under one consistent approved canonicalization policy. A case-sensitive index with inconsistent application lowercasing is insufficient. disabledAt blocks authentication/access independently of emailVerified. No mandatory signup name is proposed.

**Indexes/write cost:** PK and canonical-email uniqueness support identity lookup; registration/email changes maintain both. No extra state index initially; verification/suspension updates write the row.

**Duplication/security/lifecycle:** challenge/invitation destination snapshots deliberately repeat email. They do not become alternative authorization sources. Correcting email requires fresh verification and invalidation of relevant challenges, never reassignment of client links through matching. Closure/deletion and revocation need reviewed transactions/policy, not cascading deletion.

### CredentialAccount — tailor password; Task Four core

**Columns:** id TEXT PK; userId TEXT FK → User UNIQUE; providerId TEXT fixed to credential; accountId TEXT; passwordHash TEXT; createdAt time; updatedAt time.

**Keys and relationships:** User 1 → 0..1 credential for this V1 design; UNIQUE(providerId, accountId). accountId is a stable library identity rather than mutable email. Only controlled tailor registration/password replacement may write credentials; clients do not register passwords.

**Indexes/write cost:** userId uniqueness supports credential lookup/FK checks; provider/account uniqueness supports adapter lookup. Both increase insert/update cost; retain only keys required by the verified mapping.

**Duplication/security/lifecycle:** accountId may intentionally repeat userId for the provider-account contract. Store only the encoded Argon2id hash containing salt/work parameters, never plaintext passwords. Explicit callbacks must cover hashing and verification across enrollment/replacement. Review session revocation on password changes; generic OTP endpoints must not replace an unverified tailor credential.

### Session — authenticated continuity; before real sign-in

**Columns:** id TEXT PK; userId TEXT FK → User; token TEXT UNIQUE; expiresAt time; revokedAt time?; createdAt time; updatedAt time.

**Keys and relationships:** User 1 → many Sessions; expiresAt > createdAt. token represents the confidential library-managed session token. Verify supported storage/protection and revocation mapping before implementation; do not invent incompatible token transformations around the adapter.

**Indexes/write cost:** token uniqueness for lookup, userId index for revocation and expiresAt index for cleanup, in addition to PK. Renewal/revocation writes must be measured; avoid unnecessary per-request updates.

**Duplication/security/lifecycle:** cookie/server expiry intentionally overlap; the server is authoritative. Session membership snapshots must not grant permanent business authority. Require active business/client links on protected operations. No tailor session before verification. Client seven-day sessions are a PRD proposed default; tailor lifetime, cookies and recovery/revocation remain review items. Never log or expose tokens in evidence.

### Business — ownership boundary; before business features

**Columns:** id TEXT PK; disabledAt time?; createdAt time; updatedAt time.

**Keys and relationships:** Business 1 → many BusinessMembers and Clients; future business-owned Orders/records reference this boundary. Existence alone grants no access. No extra business-profile field is added to Signup.

**Indexes/write cost:** PK only initially; no speculative profile/search indexes. Creation/state changes write a minimal row; child FK indexes carry relationship lookup costs.

**Duplication/security/lifecycle:** membership is authoritative instead of a duplicate owner column. Restricting access must preserve legitimate history and linked clients under reviewed privacy/retention rules. Do not delete a business as an access-revocation shortcut.

### BusinessMember — authorized tailor membership; before business access

**Columns:** id TEXT PK; businessId TEXT FK → Business; userId TEXT FK → User; revokedAt time?; createdAt time.

**Keys and relationships:** UNIQUE(businessId, userId); a many-to-many identity/business relationship. This does not authorize advanced staff permissions. Active membership, enabled business/user and verified tailor identity are required.

**Indexes/write cost:** business/user uniqueness supports scoped checks; userId index finds authorized businesses. Both add creation costs; explicit revocation writes state.

**Duplication/security/lifecycle:** businessId intentionally appears in future owned records to constrain scope. Retain historical membership/actor references; creation/reinstatement needs a controlled authorized workflow, not a submitted business identifier.

### Client — business-owned customer; later client workflow

**Columns:** id TEXT PK; businessId TEXT FK → Business; fullName TEXT; phone TEXT; emailCanonical TEXT?; createdAt time; updatedAt time.

**Keys and relationships:** Business 1 → many Clients; UNIQUE(businessId, id) supports composite child FKs. Name/phone are nonblank; phone is text. Optional email follows the PRD and is not globally unique across businesses.

**Indexes/write cost:** PK plus business/id uniqueness support scoped lookup and referential integrity. No automatic identity-matching index is required.

**Duplication/security/lifecycle:** separate businesses may intentionally hold customer details for the same person. These are not tailor-signup fields. No email means no portal/digital agreement approval until secure access exists. Incorrect email requires a new invitation/verification process; do not silently reassign links.

### ClientInvitation — authority for one relationship; later client workflow

**Columns:** id TEXT PK; businessId TEXT; clientId TEXT; issuedByUserId TEXT; emailCanonical TEXT; tokenDigest TEXT UNIQUE; expiresAt time; consumedAt time?; revokedAt time?; createdAt time.

**Keys and relationships:** FK(businessId, clientId) → Client(businessId, id); FK(businessId, issuedByUserId) → BusinessMember(businessId, userId). One Client → many historical invitations; one invitation → at most one completed link. Active issuer authority must also be checked; an FK alone does not prove it.

**Constraints/indexes/write cost:** expiresAt > createdAt; consumed/revoked invitations cannot be reused. Index(businessId, clientId) for history and expiresAt for cleanup, plus PK/token uniqueness. Superseding/revoking invites adds writes and must handle concurrency. The PRD's proposed 72-hour expiry needs confirmation.

**Duplication/security/lifecycle:** emailCanonical is the intended recipient snapshot; businessId repeats ownership to enforce composite keys. Store only a protected token verifier. Delivery uses a channel confirmed with the actual client. Email control alone does not authorize that relationship; address/scope changes need a new invitation rather than editing consumed evidence.

### ClientAccountLink — verified relationship; later client workflow

**Columns:** id TEXT PK; businessId TEXT; clientId TEXT; userId TEXT FK → User; invitationId TEXT UNIQUE FK → ClientInvitation; verifiedAt time; revokedAt time?.

**Keys and relationships:** FK(businessId, clientId) → Client(businessId, id). User 1 → many links across businesses; Client 1 → historical links. Recommend partial UNIQUE(clientId) WHERE revokedAt IS NULL, allowing one active identity per customer record; confirm this cardinality before client-flow implementation.

**Constraints:** invitation, business/client, verified destination and identity must agree. Use matching composite keys where supported and transactionally validate invitation/challenge state. Consuming the invitation and creating the link must be atomic. Neither an existing session nor a contact match creates authorization.

**Indexes/write cost:** index(userId, businessId) supports the client's authorized dashboard; invitation uniqueness prevents reuse; active-client uniqueness adds a concurrency check. Link creation/revocation writes must not duplicate authorization.

**Duplication/security/lifecycle:** businessId makes scope explicit; verifiedAt records relationship authorization separately from global emailVerified. Revoking one link must not erase the identity or another business's records. No restoration by email matching.

### VerificationChallenge — ownership/recovery proof; Task Four verification

**Columns:** id TEXT PK; userId TEXT? FK → User; invitationId TEXT? FK → ClientInvitation; emailCanonical TEXT; purpose TEXT (tailor_email, client_signin, password_reset); codeVerifier TEXT; attemptCount INTEGER default 0; createdAt time; expiresAt time; consumedAt time?; revokedAt time?.

**Keys and relationships:** User/Invitation 1 → many historical challenges. Tailor verification/reset require the intended existing user. Client issuance requires an authorized invitation or an existing active client link checked on the server. Bind verification to account/destination/purpose/challenge, not merely a matching code.

**Constraints/indexes/write cost:** six ASCII-digit string; five-minute lifetime; three invalid attempts; 60-second resend cooldown. CHECK(attemptCount BETWEEN 0 AND 3); expiresAt = createdAt + five minutes. Proposed partial UNIQUE(emailCanonical, purpose) for unconsumed/unrevoked challenges; transactionally revoke an expired predecessor rather than put a moving clock in an index predicate. Index userId, invitationId and expiresAt where final keys do not cover them. Failed attempts are intentional atomic writes; consumption/reuse checks must be race-safe.

**Duplication/security:** destination/purpose are intentional immutable snapshots. codeVerifier is protected, never a plaintext integer or logged code. Prefer a keyed construction supported by the selected Better Auth storage hook, with the key outside the database: an unkeyed digest of a six-digit space alone offers limited offline protection. Verify the typed lifecycle mapping to actual plugin storage/attempt handling before implementation.

**Lifecycle:** resending cannot reset account/IP abuse counters or create parallel challenges that bypass attempts. Generic reset/client-sign-in OTP paths cannot verify/sign in an unverified tailor as an alternative to the required flow. Account-safe recovery responses, resend rotation, expiry, counters and concurrent reuse need integration tests. Five-minute validity does not set a final retention period.

### RateLimitBucket — shared abuse counters; before real endpoints

**Columns:** keyDigest TEXT PK; scope TEXT; policyVersion TEXT; windowStart time; count INTEGER; expiresAt time.

**Purpose/constraints:** keyed digest of normalized account/IP/purpose/window as applicable, not password/code/email logs. No User FK: unknown accounts need protection too. count >= 0; expiresAt > windowStart. Fixed-window storage is a proposal; algorithm, thresholds/windows and legitimate-user costs need approval.

**Indexes/write cost:** PK supports atomic consume/update; expiresAt index supports cleanup. A request may update multiple buckets, adding shared-store latency/contention. Do not use separate non-atomic read/increment operations.

**Duplication/security/lifecycle:** counters deliberately duplicate aggregate event counts, not full bodies. Expiry bounds ephemeral counters and is not permanent suspension. Trusted proxy/client-IP extraction, account keys, distributed consistency and store-outage behaviour remain review items. Demonstrate IP-only limitations only in an isolated environment.

### EmailOutbox — durable delivery handoff; before real SMTP

**Columns:** id TEXT PK; challengeId TEXT UNIQUE FK → VerificationChallenge; templateVersion TEXT; payloadCiphertext BYTEA?; payloadKeyId TEXT?; status TEXT (pending, leased, sent, failed, cancelled); attemptCount INTEGER default 0; availableAt time; leaseUntil time?; sentAt time?; lastErrorCode TEXT?; createdAt time; updatedAt time.

**Keys and relationships:** Challenge 1 → at most one logical outbox job under proposed rotate-on-resend behaviour. CHECK(attemptCount >= 0); pending/leased jobs require an authenticated encrypted payload/key reference; sentAt applies only to sent jobs. Persist challenge/account changes and durable handoff transactionally; prove selected adapter/hook support.

**Indexes/write cost:** index(status, availableAt) supports due-job claiming; unique challengeId prevents duplicate logical enqueue. Leasing/retry/completion update rows/indexes. Atomic claims and lease expiry need worker tests; an untracked in-request promise is not a durable queue.

**Duplication/security:** encrypted payload necessarily carries recipient/code/template information separately from the verifier. Encryption keys stay outside the database; no plaintext codes in generic JSON, logs or evidence. Clear recoverable payloads when no longer needed, with exact retention reviewed. lastErrorCode is an allow-listed category, not raw SMTP exceptions/credentials.

**Lifecycle:** recheck validity before sending; do not deliberately send expired/revoked codes or silently extend expiry after queue delays. Registration returns after durable enqueue, not proof of receipt. SMTP acceptance is not inbox delivery; uncertain failures can cause duplicate delivery, so do not promise exactly-once email. Detailed delivery-attempt history, retries, provider/worker operation and cleanup require subsequent review, not a payment-attempt model.

### TermsVersion — actual approved platform wording; controlled future integration

**Columns:** id TEXT PK; version TEXT UNIQUE; contentDigest TEXT; immutableDocumentRef TEXT; approvedAt time; effectiveAt time.

**Keys and relationships:** TermsVersion 1 → many TermsAcceptances. Only actually approved text enters this operational table. These are proposed timestamp fields, not assigned dates. Preserve accepted wording/reference immutably.

**Indexes/write cost:** PK/version uniqueness supports required-version lookup; publication is low-frequency. No unnecessary unique digest index: identical wording could be republished under a separately approved version.

**Duplication/security/lifecycle:** digest plus immutable reference deliberately bind evidence to exact content. This table neither publishes a policy nor approves current candidates. Accepted historical versions require reviewed retention.

### TermsAcceptance — actor/version/time; controlled future integration

**Columns:** id TEXT PK; userId TEXT FK → User; termsVersionId TEXT FK → TermsVersion; acceptedAt time; context TEXT (tailor_registration, material_update).

**Keys and relationships:** UNIQUE(userId, termsVersionId); User/TermsVersion each 1 → many acceptance records. Validate affirmative acceptance of the required approved version at the server boundary; record with successful registration transactionally. Server supplies time/context; replaying an old version does not accept a newly required one.

**Indexes/write cost:** unique user/version supports status checks; termsVersionId index supports version-specific review. Adds a registration/event write; do not add IP/device fingerprints without justification/privacy review.

**Duplication/security/lifecycle:** durable event evidence deliberately replaces neither text retention nor verification. Never convert draft-review booleans into acceptance records. Privacy notice receipt, purpose-specific consent and garment approvals are distinct. Client platform-use arrangements and retention need qualified review.

## 5. Authentication constraints and compatibility gates

1. Use Better Auth with Prisma/PostgreSQL, explicit Argon2id hash/verify callbacks and Zod boundaries before business logic/persistence. Verify exact versions, Node 24/native support, plugin schema, transactions and field mapping before installation. No dependency is installed or pinned by this document. See [Prisma integration](https://better-auth.com/docs/adapters/prisma) and [password configuration](https://better-auth.com/docs/authentication/email-password).
2. Do not add/fabricate a mandatory signup name to satisfy library defaults. Prove a supported email/password-only mapping; stop for an owner decision if unsupported. Verify session protection/revocation and all generic/server-to-server endpoint paths; wrappers must not bypass validation/limits.
3. Valid details plus acceptance of approved Terms create an unverified tailor. No sign-in/business access until verification; no cross-business access merely because email is verified. Clients remain invitation-authorized/passwordless. Disable unauthorized OTP signup/credential replacement; existing identity does not automatically establish a business link.
4. Canonicalize email consistently across registration, Login, Reset, invitation and verification. Proposed baseline is surrounding-email-whitespace removal and domain-case normalization. Resolve local-part case, Unicode/IDN, uniqueness and provider/Better Auth behaviour before implementation. Do not strip plus tags or provider-specific dots. The existing client validator trims a syntax-check copy only; canonical storage is not implemented.
5. Preserve password case, Unicode and meaningful whitespace exactly: no silent trimming, normalization or truncation in hashing/Login/reset. Preserve rejection of blank/whitespace-only new passwords and disallowed controls. **Proposed production minimum: 15 Unicode code points**, subject to PRD review and coordinated frontend/backend/recovery changes. Today's UI remains 12. Review safe request-byte/hash-processing bounds without silent truncation; do not apply new enrollment length rules retroactively to Login. [NIST](https://pages.nist.gov/800-63-4/sp800-63b.html) motivates review, not a claim of compliance.
6. Secure randomness must cover all six-digit strings including leading zeros. Use the reviewed [Better Auth Email OTP integration](https://better-auth.com/docs/plugins/email-otp), enforce five minutes/three invalid attempts/60-second cooldown and account/IP limits, and bind purpose/identity. No second ad-hoc verifier.
7. Preserve the existing strict /auth, ?login, ?signup, ?reset and ?verify contract until separately approved integration. Current verification is a local-only, UI-only preview; removing its guard must not prematurely enable unfinished public verification.
8. Keep public onboarding disabled until launch readiness. Secure sessions, approved Terms/version recording, shared limits, breach-screening failure policy and authorized SMTP/worker configuration are gates. Synthetic pre-approval testing needs an explicit test-only arrangement, not a legal-acceptance claim.

**Conflicts requiring explicit treatment:** assessment password-edge trimming conflicts with exact preservation. Demonstrate only on synthetic data and disclose the divergence. Adding payment processing or retrieval to the product merely for the rubric would conflict with PRD sections 3/4; use the separate lab. The proposed 15-code-point minimum is not an existing PRD requirement or permission to change today's 12-character UI. No other direct PRD conflict is identified. Unresolved mappings, bounds, cardinalities and session policies are review decisions, not PRD amendments.

## 6. Future garment and manual-payment relationships — deferred

Business → Client → Order → ClothingItem is the future ownership chain. Composite keys/server authorization must keep every child in the same business. MeasurementVersion, fabric/style references and submitted AgreementVersion must preserve the exact evidence shown to the client. Submitted versions are immutable; only the authenticated linked client resolves them. Approved changes create versions, not overwritten references.

Future PaymentRecord/PaymentCorrection designs require exact decimals, approved-price totals, actor/reason evidence, reversing entries and idempotency. Clients pay tailors outside StitchTrack; entries are explicitly unverified. No collection, automatic refund, gateway processing or tax-compliance claim follows from this design. Detailed product order/agreement/payment columns and indexes belong to their separately approved milestones.

## 7. Disposable assessment tables — not product models

Use a separate owner-confirmed database/configuration/migration history. These five tables meet the diagram's requested categories as a proposal, not a completed demonstration. Lab users/sessions are synthetic teaching records, not real Better Auth accounts/sessions. Confirm this interpretation with the owner/assessor. No production financial, embedding or retrieval feature is authorized.

### LabUser

**Purpose/columns:** synthetic person; id TEXT PK; emailCanonical TEXT UNIQUE; createdAt time.

**Relationships/constraints:** one user → many LabSessions, LabPayments, LabPaymentAttempts and LabRetrievalChunks. Email is nonblank and synthetic; no password/customer information is needed.

**Indexes/write cost:** PK/email uniqueness add two index writes per creation; no extra profile indexes.

**Duplication/lifecycle:** separate identity deliberately avoids product links. Owner controls disposable cleanup after evidence preservation.

### LabSession

**Purpose/columns:** illustrative session lifecycle, not authentication; id TEXT PK; userId TEXT FK → LabUser; tokenDigest TEXT UNIQUE; createdAt time; expiresAt time; revokedAt time?.

**Constraints/indexes/write cost:** expiresAt > createdAt; index userId for session retrieval, expiresAt for cleanup, plus PK/token uniqueness. Creation/revocation/cleanup create writes.

**Duplication/lifecycle:** stored expiry supports the synthetic lifecycle; no product session is copied. An illustrative token grants no application access and must not be loaded into the real adapter.

### LabPayment

**Purpose/columns:** synthetic manually recorded receipt, not money movement; id TEXT PK; recordedByUserId TEXT FK → LabUser; operationKey TEXT UNIQUE; amount NUMERIC(18,2); currency CHAR(3); paidAt time; createdAt time.

**Constraints/relationships:** amount > 0; currency is three uppercase ASCII letters and selected explicitly for synthetic tests. One user → many receipts; one receipt → zero/many attempts. Unique operationKey prevents retries of one recording intent creating duplicate receipts. Precision/currency here are lab proposals, not final product limits.

**Indexes/write cost:** PK, unique operationKey and index(recordedByUserId, paidAt) support idempotency and actor/date review. All three add insert costs. Derive totals from recorded entries, never attempted ones.

**Duplication/lifecycle:** amount/currency repeat successful attempt intent as a receipt snapshot. Linking must check actor/operation/payload consistency. Preserve receipts during the exercise; a real correction ledger needs immutable reversing entries. This table does not process refunds or establish tax-record sufficiency.

### LabPaymentAttempt

**Purpose/columns:** each synthetic recording attempt, even without a receipt; id TEXT PK; userId TEXT FK → LabUser; operationKey TEXT; attemptNo INTEGER; paymentId TEXT? FK → LabPayment; requestedAmount NUMERIC(18,2)?; currency CHAR(3)?; outcome TEXT (started, failed, abandoned, recorded); failureCode TEXT?; startedAt time; finishedAt time?.

**Constraints/relationships:** UNIQUE(operationKey, attemptNo); attemptNo > 0; amount, if present, > 0; currency, if present, three uppercase ASCII letters. Recorded requires paymentId/finishedAt; failed/abandoned require finishedAt. Failed uses only allow-listed failure codes. Multiple retries may refer to the same deduplicated receipt; started/failed/abandoned attempts may have no receipt.

**Indexes/write cost:** index(paymentId), index(userId, startedAt), unique operation/attempt and PK support reconciliation/history. Starting/finalizing creates writes even when no receipt results. Attempt allocation/idempotency need concurrency-safe transactions.

**Duplication/lifecycle:** amount/currency intentionally retain each attempt's proposal rather than overwrite history. Abandonment requires an actual cancellation/timeout rule, not guessed browser departure. Persist the attempt before the fallible operation and finalize separately so a receipt rollback cannot erase the attempt. Successful linkage must check actor, operation and payload; the exact cross-row enforcement needs implementation review.

Attempts distinguish intent, failure, abandonment and recorded money. They help reconcile missing records/retries and investigate disputes or tax enquiries from preserved facts. They do not prove payment occurred, make an unverified receipt true or settle tax/legal retention duties. No gateway or client-to-tailor processing is introduced.

### LabRetrievalChunk

**Purpose/columns:** synthetic text-chunk relationship/storage exercise; id TEXT PK; ownerUserId TEXT FK → LabUser; sourceKey TEXT; ordinal INTEGER; content TEXT; contentDigest TEXT; createdAt time.

**Constraints/relationships:** UNIQUE(ownerUserId, sourceKey, ordinal); ordinal >= 0; nonblank source/content. One user → many chunks, ordered within a source. No vector extension, embedding, model call or product retrieval endpoint is proposed.

**Indexes/write cost:** owner/source/ordinal uniqueness supports ordered reads and duplicate-position prevention, in addition to PK. Chunking increases row count/content storage and index writes; no speculative full-text/vector index.

**Duplication/lifecycle:** content deliberately repeats source excerpts; contentDigest supports integrity comparison, not secrecy/search. Chunk size/overlap needs review only if required for the isolated exercise. No real customer/private records. Owner-reviewed cleanup follows genuine evidence preservation.

## 8. Owner's paper diagram blueprint

Draw separate product and disposable-lab panels; mark deferred parts. Add an existing Task Two box with no product/lab relationship. Write the actual columns/types/nullability, PK/UQ/FK and key indexes from the descriptions above on the paper drawing. Arrows below describe proposals, not deployed tables.

~~~text
PRODUCT PROPOSAL
User 1 ---- 0..1 CredentialAccount
User 1 ---- * Session
User 1 ---- * BusinessMember * ---- 1 Business
Business 1 ---- * Client
Client 1 ---- * ClientInvitation ---- 1 issuing BusinessMember
ClientInvitation 1 ---- 0..1 ClientAccountLink * ---- 1 User
Client 1 ---- * ClientAccountLink (historical; proposed one active)
User/ClientInvitation ---- * VerificationChallenge 1 ---- 0..1 EmailOutbox
RateLimitBucket (independent; includes unknown accounts)
User 1 ---- * TermsAcceptance * ---- 1 approved TermsVersion

DEFERRED PRODUCT: Business/Client -> Order -> ClothingItem -> agreement versions
                  business-owned PaymentRecord -> reversing PaymentCorrection

DISPOSABLE LAB (synthetic; no product FKs)
LabUser 1 ---- * LabSession
LabUser 1 ---- * LabPayment
LabUser 1 ---- * LabPaymentAttempt * ---- 0..1 LabPayment
LabUser 1 ---- * LabRetrievalChunk
LabPayment.operationKey UQ
LabPaymentAttempt(operationKey, attemptNo) UQ

EXISTING TASK TWO: AssessmentEnquiry only; preserve existing source/migration
~~~

1. Owner reviews open choices, draws the schema and captures a legible genuine JPG for Evidence 01 before Prisma implementation. Do not substitute a generated diagram or photograph of this text.
2. Owner verifies each actual target and captures initial state for Evidence 02 before migrations: schemas/tables, population as appropriate, migration history and identity, without credentials. Do not assume an empty database.
3. After separate approval, prepare/review implementation schemas and instructions. Owner executes migrations and captures actual output. Populated required-column failure, nullable/backfill/required correction and drift stay disposable. Never edit/remove an applied migration automatically or reproduce failures against product/Task Two data.

## 9. Slice 2 prerequisites and later gates

Slice 2 should begin with database-free security primitives/tests after separate approval: exact compatible dependencies, supported minimal Signup, Prisma 7 mapping, explicit Argon2id hooks and offline generation. Resolve canonicalization and password minimum/processing bounds; coordinate future frontend/backend changes. Owner review and genuine paper evidence precede model implementation.

Before database integration, confirm target/role/history separation, independent migration/shadow paths, transaction support, session lifetimes/revocation and client-link cardinality. Before exposing endpoints, approve thresholds/shared counters, counter-store and breach-service outage policies, challenge protection and trusted-proxy topology. Before email, confirm sender/provider/test recipients, protected durable worker operation, retries and local secret configuration. No secrets are requested in documentation.

The [operating record](../../task-03-client-validation/docs/legal-operating-decisions.md) and [Terms note](../../task-03-client-validation/docs/terms-note.md) retain approval history. Candidates are NOT APPROVED / NOT PUBLIC; actual versioned acceptance is unimplemented. Proposed tables confer no legal approval or authorization for real customer processing. Public onboarding stays disabled until launch readiness. The assessment/product separation and trimming divergence need explicit review.

Assumptions: none. Proposed contracts and review gates are not implemented architecture or verified database facts.
