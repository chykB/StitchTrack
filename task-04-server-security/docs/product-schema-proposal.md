# StitchTrack product schema proposal

## 1. Status and boundaries

**Proposed database design, not implemented models or permission to migrate.** This document preserves thirteen product table specifications separately from the [seven-table disposable assessment lab](schema.md). It is not a full schema for the finished product. The authoritative [PRD](../../docs/PRD.md) remains read-only; [repository rules](../../AGENTS.md) and the [engineering rules](../../.agent/rules/02-engineering.md) apply.

Approved product decisions include required tailor name/email/password, separate business-name setup, mandatory six-digit email verification before sign-in, passwordless invitation-authorized clients, business isolation, exact accepted password preservation, direct payments outside StitchTrack and immutable garment-agreement history. Name UI, shared Zod schemas/email canonicalization and Argon2id primitives exist; these database tables and real authentication do not.

The detailed mapping, supporting constraints and indexes below are **proposals requiring review**. P01-P03 and P09-P13 support controlled authentication/security/Terms integration; P04-P05 establish later business ownership; P06-P08 describe the deferred client relationship flow. A table specification does not authorize that workflow. One active identity per Client, business-owner cardinality, membership reinstatement, challenge mapping and outbox transactions remain unapproved implementation choices.

Use separate product development, product test and disposable lab targets with no fallback or cross-domain FKs. Only the owner executes migrations or operates on development data; agent test-database work needs specific authorization. Preserve Task Two's independent AssessmentEnquiry, migration and configuration; [database separation and existing-source references](schema.md#1-scope-and-database-boundaries) are maintained with the lab reference. Live database state is not inferred from source.

## 2. Specification conventions

- Every column states its PostgreSQL type and NULL/NOT NULL status. Opaque identifiers use TEXT; event instants use TIMESTAMPTZ(3). Server-controlled times require a writer; updatedAt is not assumed to be automatic in PostgreSQL.
- PK and UQ denote primary/unique keys; IX denotes a secondary index. All listed indexes are B-tree. Each table lists every proposed index separately, including PK/UNIQUE-created and partial indexes. No unlisted secondary indexes are implied.
- Insert/delete maintains applicable index entries; key/predicate changes also maintain them. Other updates still cost row/WAL work; actual index writes depend on PostgreSQL update behaviour. Costs here are qualitative, not benchmark results.
- Supporting UNIQUE tuples containing an already unique id deliberately provide exact composite FK targets. Partial uniqueness is not used as an FK target. Existing leading-key indexes cover the stated reverse-FK queries without duplicate indexes.
- FKs enforce matching keys, not current authorization, expiry or cross-table lifecycle. Those rules need reviewed transactions and, where specified, deferred constraint triggers rather than ordinary CHECKs.
- Referenced-row deletion defaults to RESTRICT; no destructive cascades are proposed. Disposal/retention require separate owner review; no retention period is inferred.
- Repeated FK identifiers represent normalized relationships. Each table additionally discloses snapshots, derived facts and deliberate non-key duplication, or states that none is intended.

Reconcile opaque TEXT IDs, nullable global User.name, credentials, session representation and plugin fields with the selected Better Auth/Prisma adapter before implementation. All relationship cardinalities and PK/UQ targets appear once in section 4; RateLimitBucket has no incoming or outgoing FK because requests may concern unknown accounts. No product/lab FK crosses domains.

## 3. Thirteen proposed tables

### P01. User

Proposed global identity; needed for authentication, not implemented as a database model.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| name | TEXT | NULL allowed | Personal/display name; required and nonblank at tailor registration. Client-name mapping is deferred. |
| emailCanonical | TEXT | NOT NULL | Unique canonical identity email. |
| emailVerified | BOOLEAN | NOT NULL | Default false; global email-ownership state. |
| disabledAt | TIMESTAMPTZ(3) | NULL allowed | NULL while enabled; set when access is disabled. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(emailCanonical).

**Constraints:** Canonicalization follows the approved trim-and-lowercase policy, without provider-specific rewriting. Require a nonblank name for tailor enrollment even though the global column remains nullable for the separately reviewed client flow. No third user type or access right follows from identity existence.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(emailCanonical) | One identity per canonical email and authentication lookup. | Insert/email changes check uniqueness and update a second B-tree; name changes require no name index. |

**Intentional duplication:** Email is intentionally repeated in invitation/challenge destination snapshots, not used there as a live ownership FK. User.name, Business.name and business-owned Client.fullName describe different scoped facts; they need not match.

**Security and lifecycle:** Business membership and client links authorize access separately. Correcting email requires a fresh verified process; it must not reassign client links by matching. Closure/deletion/retention remain reviewed operations.

### P02. CredentialAccount

Proposed tailor password representation; logical Better Auth account mapping, not a new authentication engine.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| userId | TEXT | NOT NULL | FK to User.id; unique in this V1 proposal. |
| providerId | TEXT | NOT NULL | Checked literal credential; no additional providers proposed. |
| accountId | TEXT | NOT NULL | Stable adapter account identifier, not mutable email. |
| passwordHash | TEXT | NOT NULL | Encoded Argon2id PHC string only. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(userId); UQ(providerId, accountId).

**Constraints:** Only controlled tailor enrollment/replacement creates this row; clients do not register passwords. Verify the actual library mapping before generating models.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(userId) | At most one credential per global identity; FK/user credential lookup. | Adds uniqueness/index work on credential creation or owner-key change. |
| UQ(providerId, accountId) | Stable provider-account lookup expected by the adapter. | Adds another B-tree entry/uniqueness check; retain only if required by the verified adapter mapping. |

**Intentional duplication:** accountId may repeat userId intentionally for the adapter provider-account contract. Salt and work parameters repeat the declared hashing policy inside the self-describing PHC string so verification can identify the stored profile.

**Security and lifecycle:** Only password hashes are persisted. Keep exact accepted password characters; generic OTP paths must not replace credentials. Review session revocation and existing-hash profile upgrades before integration.

### P03. Session

Proposed authentication continuity; not implemented and not authorization to a business by itself.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| userId | TEXT | NOT NULL | FK to User.id. |
| token | TEXT | NOT NULL | Unique confidential library-managed session token/approved representation. |
| expiresAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | NULL until explicitly revoked. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(token).

**Constraints:** expiresAt > createdAt. No real tailor session before required email verification. Verify library token-protection and revocation mapping; do not invent an incompatible wrapper.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(token) | Session lookup and token collision prevention. | Insert/token rotation maintains a unique B-tree; tokens must not be logged. |
| IX(userId) | Find/revoke a user's sessions; supports reverse FK checks. | Adds an entry on creation and maintenance on deletion/owner change. |
| IX(expiresAt) | Find expired sessions for reviewed cleanup. | Creates insert/delete work and index updates whenever expiry is renewed. |

**Intentional duplication:** Cookie and server expiry intentionally express the same lifetime in two places; the server is authoritative. Do not duplicate business membership as permanent session authority.

**Security and lifecycle:** Protected operations recheck active membership/client links. Client seven-day sessions are a PRD proposed default; tailor lifetimes, cookies, invalidation and retention remain review items. Name/email verification alone grants no business access.

### P04. Business

Proposed ownership boundary before business features; no business setup implementation in this slice.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| name | TEXT | NOT NULL | Nonblank tailoring-business name collected during separate business setup. |
| disabledAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id).

**Constraints:** Business.name is not required at Signup and need not equal User.name. Parent of BusinessMember and Client through the FKs below; later business-owned records remain deferred. The structural parent-side minimum is zero, but creating an operational business and its first authorized membership must be one controlled transaction; an ownerless row grants no access.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |

**Intentional duplication:** No duplicated owner column: BusinessMember supplies the owner relationship. Business.name and User.name are different facts, not synchronized copies.

**Security and lifecycle:** Disabling access must preserve legitimate agreement/customer history under reviewed privacy rules; do not cascade-delete records as an access-control shortcut.

### P05. BusinessMember

Proposed join between global identity and authorized tailoring business; no advanced staff-role design.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| businessId | TEXT | NOT NULL | FK to Business.id. |
| userId | TEXT | NOT NULL | FK to User.id. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(businessId, userId).

**Constraints:** An active membership plus enabled business/user and verified tailor identity is required. The unique pair permits one historical membership row per pair; reinstatement/audit policy must be reviewed before that workflow.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(businessId, userId) | Prevent duplicate membership pairs; scoped lookup and referenced key for invitation issuers. | Insert/reassignment checks uniqueness; this index also covers businessId FK lookups. |
| IX(userId) | Find an identity's authorized businesses and support User reverse FK checks. | Adds insert/delete/key-change work; avoids scanning every membership. |

**Intentional duplication:** businessId/userId are relationship keys, not duplicated profile data. No separately stored business-owner copy.

**Security and lifecycle:** Retain rows referenced by issued invitations rather than deleting actor evidence. Active issuer authorization is a server check beyond the FK; no grants from caller-submitted business IDs.

### P06. Client

Proposed business-owned customer record; deferred client workflow.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| businessId | TEXT | NOT NULL | FK to Business.id. |
| fullName | TEXT | NOT NULL | Business-recorded nonblank customer name. |
| phone | TEXT | NOT NULL | Business-recorded nonblank contact, represented as text. |
| emailCanonical | TEXT | NULL allowed | Optional customer email; not globally unique. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(businessId, id).

**Constraints:** Name/phone are nonblank; optional email follows the PRD. A contact match does not create portal access. Parent of invitations and historical client links through explicit scoped FKs.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(businessId, id) | Referenced composite key for scoped invitations/links and business customer lookup. | Repeats id in an additional B-tree deliberately for composite FK enforcement; adds insert/key-change costs. |

**Intentional duplication:** Separate businesses may intentionally record the same person's details independently. They are business-scoped facts, not a shared identity profile; none is an additional tailor-signup field.

**Security and lifecycle:** No-email customers cannot use the portal or approve digitally until access is securely established. Correct email through a new verification/invitation process, not automatic link reassignment.

### P07. ClientInvitation

Proposed authorization for one customer-business relationship; not email ownership proof alone.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| businessId | TEXT | NOT NULL | Part of scoped customer/issuer FKs. |
| clientId | TEXT | NOT NULL | Part of FK to Client(businessId,id). |
| issuedByUserId | TEXT | NOT NULL | Part of FK to BusinessMember(businessId,userId). |
| emailCanonical | TEXT | NOT NULL | Immutable intended destination snapshot. |
| tokenDigest | TEXT | NOT NULL | Unique protected invitation-token verifier. |
| expiresAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| consumedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(tokenDigest); UQ(id, businessId, clientId).

**Constraints:** expiresAt > createdAt. Single-use consumption and revocation are transactionally enforced; current issuer membership must be active when issuing. Proposed 72-hour expiry still requires confirmation. There is no standalone Business/User FK here: those relationships are enforced through Client and BusinessMember.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(tokenDigest) | Resolve a token without ambiguity or storing its plaintext. | Adds insert/uniqueness work; token verifiers never appear in ordinary logs. |
| UQ(id, businessId, clientId) | Unconditional referenced key for a link's matching invitation/customer scope. | Logically redundant with id uniqueness, but explicitly needed for the proposed composite FK; costs another B-tree entry. |
| IX(businessId, clientId) | Scoped invitation history and customer-FK reverse checks. | Adds insert/key-change/delete work; no redundant separate businessId index. |
| IX(businessId, issuedByUserId) | Issuer FK reverse checks and membership-issued invitation review. | Additional insert/delete/key-change work for the second composite FK. |
| IX(expiresAt) | Find expired invitations for reviewed lifecycle work. | Adds expiry-index maintenance; changing consumed/revoked times alone does not change this key. |

**Intentional duplication:** businessId repeats Client ownership to enforce matching scope. Destination email is a historical snapshot, intentionally not an FK to mutable User.emailCanonical.

**Security and lifecycle:** Use a delivery channel confirmed with the actual client. New destination/scope requires a new invitation; never edit consumed evidence. A matching email/phone cannot authorize a link.

### P08. ClientAccountLink

Proposed verified association between a global identity and one business-owned customer; deferred workflow.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| businessId | TEXT | NOT NULL | Scoped client/invitation FK component. |
| clientId | TEXT | NOT NULL | Scoped client/invitation FK component. |
| userId | TEXT | NOT NULL | FK to User.id; part of a referenced link identity key. |
| invitationId | TEXT | NOT NULL | Unique invitation; part of matching scoped invitation FK. |
| verifiedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(invitationId); UQ(id, userId).

**Constraints:** Composite invitation FK prevents attaching a link to a different invitation customer/business. Consume invitation, verify challenge and create the link atomically. Proposed one-active-link cardinality remains an owner-review gate; User can have active links to many different business customer records.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(invitationId) | An invitation cannot authorize two links, including after revocation. | Adds insertion uniqueness checks; covers invitationId-led reverse FK lookups. |
| UQ(id, userId) | Referenced key for returning-client challenges tied to this exact authorized identity. | Adds a logically redundant id-containing B-tree for composite FK integrity. |
| IX(userId, businessId) | Find a client's authorized businesses and support the User FK. | Insert/delete/key-change work; no extra userId-only index. |
| IX(businessId, clientId) | Find all historical customer links and cover the Client FK. | Maintains a full-history index; an active-only index cannot cover revoked rows. |
| Partial UQ(clientId) WHERE revokedAt IS NULL | Proposed maximum of one active identity per customer record. | Checks active inserts; revoke/restore transitions remove/add index entries. Not a referenced FK key. |

**Intentional duplication:** businessId deliberately repeats customer ownership for scope constraints. verifiedAt records relationship authorization separately from global emailVerified; neither is inferred from the other.

**Security and lifecycle:** Revocation does not erase User or other business links. Preserve history; no auto-restoration by email matching. Incoming returning-client challenges reference the exact (id,userId) pair.

### P09. VerificationChallenge

Proposed email verification/recovery lifecycle; includes first-invitation and returning-client context.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| userId | TEXT | NULL allowed | FK to User.id; required for tailor/reset and linked-client challenges. |
| invitationId | TEXT | NULL allowed | FK to ClientInvitation.id for initial invitation authorization. |
| clientAccountLinkId | TEXT | NULL allowed | Composite FK with userId to ClientAccountLink(id,userId) for later visits. |
| emailCanonical | TEXT | NOT NULL | Immutable destination snapshot. |
| purpose | TEXT | NOT NULL | Checked tailor_email, client_signin or password_reset. |
| scopeKey | TEXT | NOT NULL | Server-derived opaque deterministic key for destination/purpose/authorized context. |
| codeVerifier | TEXT | NOT NULL | Protected six-digit code verifier, not plaintext code. |
| attemptCount | INTEGER | NOT NULL | Default 0; CHECK between 0 and 3. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| expiresAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| consumedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| revokedAt | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |

**Candidate keys:** PK(id).

**Constraints:** Tailor/reset: userId required, both client context IDs NULL. client_signin: exactly one of invitationId/clientAccountLinkId is set; when link is set, userId is required and the composite FK enforces identity match. MATCH SIMPLE on that composite FK is intentional for non-client rows; row checks prevent a partial linked-client pair. Expiry equals createdAt + five minutes; at most three invalid attempts and 60-second resend cooldown. Active status/expiry/purpose/recipient matching is checked transactionally, not by cross-table CHECKs.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| Partial UQ(scopeKey) WHERE consumedAt IS NULL AND revokedAt IS NULL | At most one current challenge per purpose/authorized context, without invalidating unrelated business invitations. | Adds insertion uniqueness work and removes entries on consumption/revocation; expired predecessors must be revoked before replacement. |
| IX(userId) | User challenge invalidation and User FK reverse checks. | Additional insert/delete/key-change work, including historical rows. |
| IX(invitationId) | Invalidate/review challenges for a particular invitation and cover its FK. | Additional insert/delete/key-change work; optional NULL entries may be indexed. |
| IX(clientAccountLinkId, userId) | Exact returning-link lookup/invalidation and composite FK reverse checks. | Adds a B-tree; no duplicate linkId-only index. |
| IX(expiresAt) | Find expired challenges for reviewed cleanup. | Insert/delete/expiry-key maintenance; no clock-dependent partial-index predicate. |

**Intentional duplication:** Destination and context are issue-time snapshots; scopeKey intentionally duplicates a derived context tuple for unambiguous active uniqueness. attemptCount aggregates failed verification events. The outbox separately retains only a protected recoverable code payload for sending.

**Security and lifecycle:** Six ASCII digits remain strings including zeros. Prefer a keyed verifier supported by the selected plugin. Scope separation does not reset account/IP rate counters. Returning clients need an active verified link; generic OTP must not sign in an unverified tailor, create unauthorized accounts or replace credentials. Library mapping and safe retention remain review gates.

### P10. RateLimitBucket

Proposed shared abuse counter, including requests for unknown accounts.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| keyDigest | TEXT | NOT NULL | Primary key: keyed digest incorporating identity/IP, scope, policy version and window. |
| scope | TEXT | NOT NULL | Checked endpoint/purpose scope. |
| policyVersion | TEXT | NOT NULL | Counter-policy version. |
| windowStart | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| count | INTEGER | NOT NULL | Nonnegative consumed count. |
| expiresAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(keyDigest).

**Constraints:** count >= 0; expiresAt > windowStart. No User FK because account names can be unknown. Algorithm/thresholds/windows are not approved by documenting this fixed-window representation.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(keyDigest) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| IX(expiresAt) | Remove expired buckets under reviewed cleanup. | Adds creation/deletion/expiry-key work; count updates do not change this key but still write the row. |

**Intentional duplication:** Digest intentionally encodes scope/policy/window also stored explicitly for interpretation; count duplicates an aggregate of events, not request bodies.

**Security and lifecycle:** Atomic shared consume, trusted proxy/IP extraction and outage policy require review. Never store passwords/codes in keys or logs. This table is not a new global user role or permanent lockout system.

### P11. EmailOutbox

Proposed durable authentication-email handoff; no worker or SMTP operation is implemented.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| challengeId | TEXT | NOT NULL | Unique FK to VerificationChallenge.id. |
| templateVersion | TEXT | NOT NULL | Versioned template artifact reference, not an FK to an undeclared table. |
| payloadCiphertext | BYTEA | NULL allowed | Authenticated encrypted recipient/code payload while required. |
| payloadKeyId | TEXT | NULL allowed | External encryption-key reference; no key material in the database. |
| status | TEXT | NOT NULL | Checked pending, leased, sent, failed or cancelled. |
| attemptCount | INTEGER | NOT NULL | Default 0; nonnegative send-attempt aggregate. |
| availableAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| leaseUntil | TIMESTAMPTZ(3) | NULL allowed | Server-controlled timestamp. |
| sentAt | TIMESTAMPTZ(3) | NULL allowed | SMTP-accepted completion time, not proof of inbox delivery. |
| lastErrorCode | TEXT | NULL allowed | Allow-listed error category only. |
| createdAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| updatedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(challengeId).

**Constraints:** Pending/leased rows require both encrypted payload and external key reference; clear recoverable values together when no longer needed. Lease timestamp required for leased state; sentAt required only for sent state. Nonnegative attemptCount. Prove transactional account/challenge/enqueue support in the selected adapter/hooks.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(challengeId) | Prevent duplicate logical enqueue and support the challenge FK. | Adds a uniqueness/index write on enqueue; no redundant challengeId-only index. |
| IX(status, availableAt) | Find due jobs for atomic claiming. | Enqueue, reschedule and status transitions maintain the index; contention must be measured. |
| Partial IX(leaseUntil) WHERE status = 'leased' | Find expired leases for crash recovery. | Entry on lease, removal on terminal/requeue transition, and updates on lease renewal. |

**Intentional duplication:** Recipient/code/template data is deliberately repeated in the encrypted send payload because the challenge verifier is not recoverable. attemptCount is an aggregate; lastErrorCode is only the latest category, not a full event log.

**Security and lifecycle:** No raw SMTP exceptions/credentials/codes in logs. Recheck challenge expiry/revocation before sending. Retries after uncertainty can duplicate email; do not promise exactly-once delivery. Detailed attempts/retention/provider/worker decisions remain deferred; no PaymentAttempt relationship.

### P12. TermsVersion

Proposed immutable approved Platform Terms record, not approval/publication of current candidates.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| version | TEXT | NOT NULL | Unique approved version label. |
| contentDigest | TEXT | NOT NULL | Integrity digest of the exact approved artifact. |
| immutableDocumentRef | TEXT | NOT NULL | Immutable artifact reference, not an FK to an undeclared table. |
| approvedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| effectiveAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |

**Candidate keys:** PK(id); UQ(version).

**Constraints:** Only actually approved text may enter this operational table. Proposed timestamp columns assign no dates now. A repeated text digest under a newly approved version is not prohibited.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(version) | Unambiguous required-version lookup. | Extra insertion/uniqueness work on low-frequency publication; accepted versions are not edited. |

**Intentional duplication:** Digest deliberately represents content already held in the immutable artifact, allowing integrity verification. No duplicate policy text is stored in acceptance rows.

**Security and lifecycle:** Parent of TermsAcceptance; preserve accepted artifacts under reviewed retention. Privacy notice receipt, purpose-specific consent and garment agreements remain separate.

### P13. TermsAcceptance

Proposed user/version event for separately approved registration/material updates.

| Column | PostgreSQL type | Nullability | Key / meaning |
| --- | --- | --- | --- |
| id | TEXT | NOT NULL | Opaque primary key; adapter-compatible generator remains subject to review. |
| userId | TEXT | NOT NULL | FK to User.id. |
| termsVersionId | TEXT | NOT NULL | FK to TermsVersion.id. |
| acceptedAt | TIMESTAMPTZ(3) | NOT NULL | Server-controlled timestamp. |
| context | TEXT | NOT NULL | Checked tailor_registration or material_update; server supplied. |

**Candidate keys:** PK(id); UQ(userId, termsVersionId).

**Constraints:** Future boundary verifies affirmative acceptance of the currently required approved version and records actor/version/time with account creation transactionally. Reject stale-version replay; do not trust a client timestamp.

| Index (B-tree unless stated) | Why it exists | Write-performance cost |
| --- | --- | --- |
| PK(id) | Unique row identity and referenced-key lookup. | One index entry per inserted/deleted row; key changes require uniqueness checks and index maintenance. |
| UQ(userId, termsVersionId) | Prevent duplicate user/version events and support user acceptance lookup/FK. | Adds registration/event uniqueness work; no redundant userId index. |
| IX(termsVersionId) | Review all acceptances of a version and cover its reverse FK. | Adds an index entry per acceptance and maintenance on reviewed deletion. |

**Intentional duplication:** Durable acceptance intentionally records the user/version association and event context; it does not copy policy text. It is not the transient draft-review checkbox.

**Security and lifecycle:** No retrospective conversion of draft acknowledgements. No inferred Privacy consent, client garment approval, extra fingerprint collection or legal approval. Client platform-use and retention decisions remain review items.

## 4. Complete relationship matrix

All referenced tuples are unconditional PK/UNIQUE keys listed in the table specifications. Parent-side minimum is zero: a parent can exist before any child. Each matrix row is one FK definition; no additional relationships are implied.

| Child FK columns | Referenced parent PK/UQ columns | Relationship and cardinality |
| --- | --- | --- |
| Product.CredentialAccount(userId) | PK Product.User(id) | One-to-one with optional child: User 1 : 0..1 CredentialAccount; each credential has exactly one User. |
| Product.Session(userId) | PK Product.User(id) | One-to-many: User 1 : 0..* Session; each Session belongs to exactly one User. |
| Product.BusinessMember(businessId) | PK Product.Business(id) | One-to-many: Business 1 : 0..* BusinessMember; each membership has exactly one Business. |
| Product.BusinessMember(userId) | PK Product.User(id) | One-to-many: User 1 : 0..* BusinessMember; each membership has exactly one User. Together these implement User many-to-many Business. |
| Product.Client(businessId) | PK Product.Business(id) | One-to-many: Business 1 : 0..* Client; each Client belongs to exactly one Business. |
| Product.ClientInvitation(businessId, clientId) | UQ Product.Client(businessId, id) | One-to-many: Client 1 : 0..* ClientInvitation; every invitation identifies exactly one scoped Client. |
| Product.ClientInvitation(businessId, issuedByUserId) | UQ Product.BusinessMember(businessId, userId) | One-to-many: BusinessMember 1 : 0..* issued ClientInvitation; each invitation has exactly one issuing membership in the same Business. |
| Product.ClientAccountLink(businessId, clientId) | UQ Product.Client(businessId, id) | One-to-many historical relationship: Client 1 : 0..* ClientAccountLink; each link belongs to exactly one scoped Client. |
| Product.ClientAccountLink(userId) | PK Product.User(id) | One-to-many: User 1 : 0..* ClientAccountLink; each link authorizes exactly one User. Historical User-to-Client association is many-to-many through links. |
| Product.ClientAccountLink(invitationId, businessId, clientId) | UQ Product.ClientInvitation(id, businessId, clientId) | One-to-one with optional child: ClientInvitation 1 : 0..1 ClientAccountLink; each link consumes exactly one matching invitation. |
| Product.VerificationChallenge(userId) | PK Product.User(id) | Optional-parent one-to-many: User 1 : 0..* VerificationChallenge; a challenge has 0..1 User, with purpose-dependent requiredness. |
| Product.VerificationChallenge(invitationId) | PK Product.ClientInvitation(id) | Optional-parent one-to-many: ClientInvitation 1 : 0..* VerificationChallenge; a challenge has 0..1 invitation. |
| Product.VerificationChallenge(clientAccountLinkId, userId) | UQ Product.ClientAccountLink(id, userId) | Optional-parent one-to-many: ClientAccountLink 1 : 0..* returning-client VerificationChallenge; a challenge has 0..1 matching link. |
| Product.EmailOutbox(challengeId) | PK Product.VerificationChallenge(id) | One-to-one with optional child: VerificationChallenge 1 : 0..1 EmailOutbox; each job has exactly one challenge under proposed rotate-on-resend behaviour. |
| Product.TermsAcceptance(userId) | PK Product.User(id) | One-to-many: User 1 : 0..* TermsAcceptance; each event has exactly one User. |
| Product.TermsAcceptance(termsVersionId) | PK Product.TermsVersion(id) | One-to-many: TermsVersion 1 : 0..* TermsAcceptance; each event refers to exactly one approved version. Together this is User many-to-many TermsVersion. |

Many-to-many associations are User/Business through BusinessMember, historical User/Client through ClientAccountLink, and User/TermsVersion through TermsAcceptance. The proposed active-link maximum does not change the historical cardinality. Invitation issuers resolve to User through the same-business membership pair. RateLimitBucket is independent; no extra owner/profile FKs are implied.

## 5. Authentication and product constraints

1. Use Better Auth with Prisma/PostgreSQL, explicit Argon2id hash/verify callbacks and Zod boundaries before business logic/persistence. Verify exact versions, Node 24/native support, plugin schema, transactions and field mapping before integration. No dependency is installed or pinned by this document. See [Prisma integration](https://better-auth.com/docs/adapters/prisma) and [password configuration](https://better-auth.com/docs/authentication/email-password).
2. The owner has approved tailor Signup with Your name, Email and Password; Login remains Email/Password. User.name is a personal/display name and Business.name is collected later in business setup. This is a product decision, not a fabricated field for library defaults. Verify the supported name mapping, including the distinct client flow; do not invent a business name or require it at Signup. Verify session protection/revocation and all generic/server-to-server endpoint paths; wrappers must not bypass validation/limits.
3. Valid name/email/password plus acceptance of approved Terms create an unverified tailor. No sign-in/business access until verification; no cross-business access merely because email is verified. Clients remain invitation-authorized/passwordless. Disable unauthorized OTP signup/credential replacement; existing identity does not automatically establish a business link.
4. Canonicalize email consistently across registration, Login, Reset, invitation and verification. The approved shared schemas now remove surrounding whitespace and lowercase the complete email in parsed output, while preserving raw UI text. Do not strip plus tags or provider-specific dots. Reconcile that same policy with Better Auth, uniqueness and SMTP/Unicode/IDN support before real integration; no canonical account storage is implemented yet.
5. Preserve password case, Unicode and meaningful whitespace exactly: no silent trimming, normalization or truncation in hashing/Login/reset. Preserve rejection of blank/whitespace-only new passwords and disallowed controls. **Proposed production minimum: 15 Unicode code points**, subject to PRD review and coordinated frontend/backend/recovery changes. Today's UI remains 12. Review safe request-byte/hash-processing bounds without silent truncation; do not apply new enrollment length rules retroactively to Login. [NIST](https://pages.nist.gov/800-63-4/sp800-63b.html) motivates review, not a claim of compliance.
6. Secure randomness must cover all six-digit strings including leading zeros. Use the reviewed [Better Auth Email OTP integration](https://better-auth.com/docs/plugins/email-otp), enforce five minutes/three invalid attempts/60-second cooldown and account/IP limits, and bind purpose/identity. No second ad-hoc verifier.
7. Preserve the existing strict /auth, ?login, ?signup, ?reset and ?verify contract until separately approved integration. Current verification is a local-only, UI-only preview; removing its guard must not prematurely enable unfinished public verification.
8. Keep public onboarding disabled until launch readiness. Secure sessions, approved Terms/version recording, shared limits, breach-screening failure policy and authorized SMTP/worker configuration are gates. Synthetic pre-approval testing needs an explicit test-only arrangement, not a legal-acceptance claim.

**PRD compatibility of the name decision:** section 2 specifies tailor email/password authentication without prohibiting a personal/display name; section 6 distinguishes User from Business. The owner-approved required Your name field supplements that model without changing the two user types, client passwordless access or mandatory six-digit verification before sign-in. The PRD is unchanged. Earlier Task Three two-field inventories remain historical records, not the current Signup specification.

The current UI checks name blankness only (including Unicode whitespace), retaining spelling/spacing without a name whitelist, forced first/last split or arbitrary length requirement. Errors appear on blur or submission and clear when corrected, using the existing associated text/caution feedback. Values remain in transient UI memory. No authentication or pre-verification session is created.

**Conflicts requiring explicit treatment:** assessment password-edge trimming conflicts with exact preservation. Demonstrate only on synthetic data and disclose the divergence. Adding payment processing or retrieval to the product merely for the rubric would conflict with PRD sections 3/4; use the separate lab. The proposed 15-code-point minimum is not an existing PRD requirement or permission to change today's 12-character UI. No other direct PRD conflict is identified. Unresolved mappings, bounds, cardinalities and session policies are review decisions, not PRD amendments.

## 6. Deferred garment and manual-payment boundaries

Business → Client → Order → ClothingItem remains the future ownership chain. Future composite constraints and server checks must reject cross-business references. Measurement/image references and submitted agreement versions preserve the exact evidence presented to the client. Only the securely linked client approves/rejects; controlled changes add versions instead of overwriting approved history.

Future product PaymentRecord/PaymentCorrection models require exact decimals, approved-price totals, actor/reason evidence, idempotency and reversing corrections. Clients pay tailors directly; records remain unverified by StitchTrack. No platform charge, automatic refund or tax-compliance claim is introduced. These future entities are boundary references, not table definitions counted as complete in this document; their columns/indexes require their own milestone approval.

## 7. Review gates and drawing reference

This proposal specifies **13 tables, 98 columns, 44 indexes and 16 FK definitions**. Columns, nullability, keys, individual index rationale/costs, intentional duplication and lifecycle are preserved; section 4 is the relationship inventory.

Review before implementation:

- Better Auth/Prisma field and transaction/plugin compatibility, nullable global name versus required tailor enrollment, session token/revocation handling and safe request/encoding bounds.
- One-active-identity-per-Client proposal, business-owner cardinality and membership reinstatement/history. The M:N structure does not approve advanced staff or multi-owner product workflows.
- Challenge context-key derivation and returning-client mapping, shared account/IP limits and atomic transitions, preserving five minutes/three attempts/60-second cooldown. No generic OTP account creation or credential replacement.
- SMTP/provider/worker configuration, rate-store and breach-service outage handling and reviewed category-specific retention. No secret or database identity is prescribed.
- [Legal-operating decisions](../../task-03-client-validation/docs/legal-operating-decisions.md) and the [Terms note](../../task-03-client-validation/docs/terms-note.md): candidates remain NOT APPROVED / NOT PUBLIC. Versioned acceptance and real customer processing remain gated.

For an optional separate product panel on the owner's paper design, copy these thirteen table boxes and all section 4 arrows, including nullable challenge references and supporting composite keys. Keep it separate from the required lab panel; do not connect similarly named User/Session tables. Mark RateLimitBucket as independent and garment/payment models as deferred references rather than fully specified tables. The [lab blueprint](schema.md#6-handwritten-drawing-blueprint) covers the assessment drawing. No generated diagram replaces the owner's photograph.
