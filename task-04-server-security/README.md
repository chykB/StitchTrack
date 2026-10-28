# StitchTrack — Task Four: The Server Is the Source of Truth

## Purpose and progress

Task Four moves StitchTrack from the [Task Three UI](../task-03-client-validation/README.md) towards server validation, secure credentials, sessions and email verification. The [PRD](../docs/PRD.md) is authoritative and read-only. Baseline: commit 1aab84c on feat/task-03-auth-foundation. The owner's supplied requirements define the assessment; no assessment PDF was available.

**Slice 1 was documentation only.** The [assessment lab schema](docs/schema.md) and [product schema proposal](docs/product-schema-proposal.md) remain proposals, not Prisma implementation or a deployed database. A subsequent owner-approved database-free alignment adds Your name to Signup. The owner has captured hashing Evidence 07 and 08; other Task Four evidence remains pending.

Signup now requires Your name, Email and Password. Your name is the tailor's personal/display name (future User.name); Business.name is separate and collected during business setup, never initial Signup. Login remains Email/Password, and Reset remains Email only. Signup, Login, Reset and the opt-in local verification preview remain UI-only. Shared Zod validation and canonical email output are implemented. Standalone server-only Argon2id utilities and an owner-run benchmark are now available; see [hashing design and evidence commands](docs/hashing.md). The owner installed @node-rs/argon2 2.2.2; its pending package changes are preserved. Better Auth integration, real registration, sessions, SMTP and background delivery remain unimplemented, and the owner's genuine hashing evidence is linked in the checklist below. Source declares only Task Two's AssessmentEnquiry; actual database contents and migration history remain unverified for Task Four.

## Assessment versus product scope

The product requires email/password tailor accounts, mandatory email verification, invitation-based passwordless client access and business-scoped authorization. Clients pay tailors directly; StitchTrack records unverified receipts. No retrieval, vector-search or runtime AI feature is approved.

The [seven-table disposable assessment laboratory](docs/schema.md) (42 columns) is documented separately from the [thirteen-table product proposal](docs/product-schema-proposal.md) (98 columns). Synthetic financial attempts and retrieval chunks must not enter the product Prisma schema or become public features. Confirm this separation with the owner/assessor before implementation.

The assessment requires password-edge trimming; the product preserves accepted passwords exactly. Propose an isolated synthetic comparison and disclose the divergence. Do not silently trim real registration or Login passwords.

## Implementation sequence

1. **Design:** owner reviews the architecture, resolves open choices and draws/photographs the paper schema before any model implementation.
2. **Database-free primitives:** approve exact dependencies and compatibility; prepare Argon2id callbacks, Zod schemas, email canonicalization, processing bounds and focused tests. Capture actual local hashing measurements only when authorized.
3. **Controlled database work:** owner verifies targets/initial state and executes reviewed migrations. Failure and drift exercises use disposable targets, including any shadow database.
4. **Authentication boundary:** integrate approved account creation, Terms-version recording, sessions and verification gating; repeat the preserved Task Three attacks against the separately identified new endpoint.
5. **Abuse controls:** shared atomic rate counters, account/IP rules, trusted-proxy handling and breached-password screening. Demonstrate the IP-only limitation in a controlled environment.
6. **Verification/email:** durable background delivery with Nodemailer/SMTP, protected challenges, expiry/attempt/resend/reuse checks and branded email.
7. **Review:** finish genuine evidence, defects, at least four justified deferred controls and 19 interview answers. Obtain the exact question wording before drafting.

Each slice needs separate approval. Current documentation does not authorize package installation, schema changes, database operations, sending email or running workers.

## Genuine evidence checklist

Evidence 07 and 08 are **captured** under task-04-server-security/evidence/; the remaining entries are pending. Numbers/formats are owner-supplied; descriptions below are not invented official full filenames. Record actual environment, revision and provenance; redact secrets without fabricating output.

| Status | No. | Required evidence and format |
| --- | --- | --- |
| [ ] | 01 | Owner's paper schema photograph — JPG. |
| [ ] | 02 | Actual database state before migrations — PNG. |
| [ ] | 03 | Initial migration and full sanitized output — TXT. |
| [ ] | 04 | Required-column failure on populated disposable data — TXT. |
| [ ] | 05 | Nullable → backfill → required correction — TXT. |
| [ ] | 06 | Actual disposable-database drift error — TXT. |
| [x] | 07 | [Two different Argon2id hashes, both verifying](evidence/07-hash-twice-different.txt) — genuine owner capture, TXT. |
| [x] | 08 | [Owner-machine Argon2id/SHA-256 timings and arithmetic](evidence/08-timing-argon-vs-sha.txt) — local sequential measurements, TXT. |
| [ ] | 09 | Consistent email normalization — PNG. |
| [ ] | 10 | Isolated password-trimming comparison and explicit product divergence — PNG. |
| [ ] | 11 | Measured request timings with/without validation in a safe comparison — TXT. |
| [ ] | 12 | Actual direct-request before/after responses, identifying both endpoints — TXT. |
| [ ] | 13 | Triggered rate limit and HTTP status — PNG. |
| [ ] | 14 | Controlled client-IP change bypassing an IP-only limit — PNG. |
| [ ] | 15 | Known-compromised synthetic password rejected — PNG. |
| [ ] | 16 | Actual SMTP failure — TXT. |
| [ ] | 17 | Actual SMTP success — TXT. |
| [ ] | 18 | Measured synchronous/background registration comparison — TXT. |
| [ ] | 19 | Genuine verification database row, secrets redacted — PNG. |
| [ ] | 20 | Expired code rejected — PNG. |
| [ ] | 21 | Incorrect code rejected — PNG. |
| [ ] | 22 | Consumed code reuse rejected — PNG. |
| [ ] | 23 | Actual rendered branded email — PNG. |

Evidence 24, the seven-minute walkthrough, is optional. Automatic-fail safeguards: never store passwords with SHA/MD5; capture real local hashing timings and arithmetic, a real migration failure and the IP-only limitation; document at least four genuinely deferred controls. SHA-256 belongs only in the synthetic timing comparison.

Slice 1 began with this README and docs/schema.md; the thirteen product specifications now live in docs/product-schema-proposal.md. Pending documentation: docs/migrations.md, docs/validation-placement.md, docs/rate-limiting.md, docs/breach-check.md, docs/verification-design.md, docs/email-copy.md, docs/not-implemented.md, docs/defects.md and docs/interview-answers.md (19 answers, maximum 200 words each).

## Database ownership and release restrictions

The owner confirms real database identities, roles, privileges and migration history locally, and performs inspection, migrations, backfills, drift exercises and database-dependent verification. Agents never operate on the development database; test operations require task-specific authorization. Do not assume a database name, emptiness, running PostgreSQL service or safe shadow target.

Separate product development, product test and the disposable laboratory. Preserve [Task Two's schema](../prisma/schema.prisma), [migration](../prisma/migrations/20261023_task_two_enquiry/migration.sql) and [Prisma configuration](../prisma.config.ts). Future product/lab configurations require independent verified targets with no fallback. Client generation, typechecking and building must remain database-free.

Public onboarding remains disabled until launch readiness; no Task Four backend currently exists to enable. The [operating decisions](../task-03-client-validation/docs/legal-operating-decisions.md) require a registered Nigerian company before public launch, not an assumption that incorporation has occurred. Policy candidates remain **NOT APPROVED / NOT PUBLIC**. Draft acknowledgement is not legal acceptance; platform Terms, garment approvals and privacy consent are distinct.

Real customer processing, SMTP sending and worker operation require separate readiness approval. Task Three's [accessibility shortfall](../task-03-client-validation/docs/accessibility-audit.md) remains disclosed; optional recordings are not mandatory and this task does not complete missing observations.

Next: review the schema, owner paper evidence and Slice 2 gates before implementation.

Assumptions: none. Proposed choices require review before implementation.
