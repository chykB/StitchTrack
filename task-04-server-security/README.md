# StitchTrack — Task Four: The Server Is the Source of Truth

## Purpose and progress

Task Four moves StitchTrack from the [Task Three UI](../task-03-client-validation/README.md) towards server validation, secure credentials, sessions and email verification. The [PRD](../docs/PRD.md) is authoritative and read-only. Baseline: commit 1aab84c on feat/task-03-auth-foundation. The owner's supplied requirements define the assessment; no assessment PDF was available.

**Slice 1 was documentation only.** The isolated seven-table lab was subsequently implemented and owner-migrated. Evidence 03/04/05 records initial deployment, the genuine required-column failure and three-step recovery (latest 528e166). Its model now includes required TEXT User.name. The owner completed reconciliation/status at 8464453 in the [second resolution attempt](evidence/05-required-column-resolution-attempt-02.txt). [Runtime drift Evidence 06](evidence/06-drift-error.txt) is completed and committed at ca554f1. [Step 5 normalization/trimming](docs/normalization-and-trimming.md) evidence is captured at 552b607, with the isolated-experiment/product-policy limitations retained. [Step 6 server validation](docs/validation-placement.md) has captured HTTP timing Evidence 11; Evidence 12 compares the synthetic Task Three fixture with the validation-only Signup boundary. Neither proves functional authentication. [Step 8 rate limiting](docs/rate-limiting.md) now has an isolated default-off socket adapter and owner source-IP capture procedure; Evidence 13/14 is captured at d0b9fd6. [Step 9 breach checking](docs/breach-check.md) adds an opt-in Signup range lookup with fail-closed handling; Evidence 15 remains pending. The [product schema](docs/product-schema-proposal.md) remains a proposal, separate from the lab. Paper/initial-state evidence and hashing Evidence 07/08 are captured; remaining experiments are pending.

Signup now requires Your name, Email and Password. Your name is the tailor's personal/display name (future User.name); Business.name is separate and collected during business setup, never initial Signup. Login remains Email/Password, and Reset remains Email only. Signup, Login, Reset and the opt-in local verification preview remain UI-only. Shared Zod validation and canonical email output are implemented. Standalone server-only Argon2id utilities and an owner-run benchmark are now available; see [hashing design and evidence commands](docs/hashing.md). The owner installed @node-rs/argon2 2.2.2; its pending package changes are preserved. Better Auth integration, real registration, sessions, SMTP and background delivery remain unimplemented, and the owner's genuine hashing evidence is linked in the checklist below. The root product schema still declares only Task Two's AssessmentEnquiry. Task Four has its own isolated schema/config/history; owner evidence establishes the reconciled lab state and completed runtime drift correction.

## Assessment versus product scope

The product requires email/password tailor accounts, mandatory email verification, invitation-based passwordless client access and business-scoped authorization. Clients pay tailors directly; StitchTrack records unverified receipts. No retrieval, vector-search or runtime AI feature is approved.

The [seven-table disposable assessment laboratory](docs/schema.md) (42 columns) is documented separately from the [thirteen-table product proposal](docs/product-schema-proposal.md) (98 columns). Synthetic financial attempts and retrieval chunks must not enter the product Prisma schema or become public features. Confirm this separation with the owner/assessor before implementation.

The assessment requires password-edge trimming; the product preserves accepted passwords exactly. The [isolated synthetic comparison](docs/normalization-and-trimming.md) demonstrates the difference without changing authentication. A literal requirement to trim actual authentication passwords remains an explicit assessment/product conflict requiring assessor resolution. Do not silently trim registration or Login passwords.

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

Evidence 01-14 are **captured** under task-04-server-security/evidence/; the remaining entries are pending; the successful reconciliation supplement is also captured. Numbers/formats are owner-supplied; descriptions below are not invented official full filenames. Record actual environment, revision and provenance; redact secrets without fabricating output.

| Status | No. | Required evidence and format |
| --- | --- | --- |
| [x] | 01 | [Owner's paper schema photograph](evidence/01-schema-drawing.jpg) - owner capture. |
| [x] | 02 | [Actual database state before migrations](evidence/02-database-state-before.png) - owner capture. |
| [x] | 03 | [Initial migration and full output](evidence/03-initial-migration.txt) - owner capture. |
| [x] | 04 | [Genuine required-column failure](evidence/04-required-column-failure.txt) - owner capture. |
| [x] | 05 | [Nullable/backfill/required recovery](evidence/05-required-column-three-steps.txt) - owner capture. |
| [x] | 06 | [Genuine Prisma runtime drift and correction](evidence/06-drift-error.txt) - owner capture at ca554f1, TXT. |
| [x] | 07 | [Two different Argon2id hashes, both verifying](evidence/07-hash-twice-different.txt) — genuine owner capture, TXT. |
| [x] | 08 | [Owner-machine Argon2id/SHA-256 timings and arithmetic](evidence/08-timing-argon-vs-sha.txt) — local sequential measurements, TXT. |
| [x] | 09 | [Isolated email normalization](evidence/09-email-normalization.png) - owner PNG; real registration processing remains unimplemented. |
| [x] | 10 | [Isolated password-trimming comparison](evidence/10-password-trimming-experiment.png) - owner PNG; product policy unchanged, assessment divergence unresolved. |
| [x] | 11 | [Measured HTTP validation timings](evidence/11-validation-timing.txt) - controlled synthetic comparison, not functional registration, TXT. |
| [x] | 12 | [Actual direct-request before/after](evidence/12-direct-request-before-and-after.txt) - synthetic fixture versus validation-only boundary, TXT. |
| [x] | 13 | [Actual triggered rate limit and HTTP 429](evidence/13-rate-limit-triggered.png) - owner PNG. |
| [x] | 14 | [Actual source-IP bypass](evidence/14-rate-limit-defeated.txt) - owner TXT; isolated assessment admission, not authentication. |
| [ ] | 15 | 15-breached-password-rejected.png - owner live Signup breach rejection; [procedure](docs/breach-check.md#owner-procedure-for-genuine-evidence-15). |
| [ ] | 16 | Actual SMTP failure — TXT. |
| [ ] | 17 | Actual SMTP success — TXT. |
| [ ] | 18 | Measured synchronous/background registration comparison — TXT. |
| [ ] | 19 | Genuine verification database row, secrets redacted — PNG. |
| [ ] | 20 | Expired code rejected — PNG. |
| [ ] | 21 | Incorrect code rejected — PNG. |
| [ ] | 22 | Consumed code reuse rejected — PNG. |
| [ ] | 23 | Actual rendered branded email — PNG. |

Evidence 24, the seven-minute walkthrough, is optional. Automatic-fail safeguards: never store passwords with SHA/MD5; capture real local hashing timings and arithmetic, a real migration failure and the IP-only limitation; document at least four genuinely deferred controls. SHA-256 belongs only in the synthetic timing comparison.

Slice 1 began with this README and docs/schema.md; the thirteen product specifications now live in docs/product-schema-proposal.md. Rate-limit design and capture instructions: [docs/rate-limiting.md](docs/rate-limiting.md). Breach-check design and capture instructions: [docs/breach-check.md](docs/breach-check.md). Pending documentation: docs/verification-design.md, docs/email-copy.md, docs/not-implemented.md, docs/defects.md and docs/interview-answers.md (19 answers, maximum 200 words each).

## Database ownership and release restrictions

The owner confirms real database identities, roles, privileges and migration history locally, and performs inspection, migrations, backfills, drift exercises and database-dependent verification. Agents never operate on the development database; test operations require task-specific authorization. Do not assume a database name, emptiness, running PostgreSQL service or safe shadow target.

Separate product development, product test and the disposable laboratory. Preserve [Task Two's schema](../prisma/schema.prisma), [migration](../prisma/migrations/20261023_task_two_enquiry/migration.sql) and [Prisma configuration](../prisma.config.ts). Future product/lab configurations require independent verified targets with no fallback. Client generation, typechecking and building must remain database-free.

Public onboarding remains disabled until launch readiness. Task Four now has local-only validation boundaries that return unavailable, with no functional authentication backend. The [operating decisions](../task-03-client-validation/docs/legal-operating-decisions.md) require a registered Nigerian company before public launch, not an assumption that incorporation has occurred. Policy candidates remain **NOT APPROVED / NOT PUBLIC**. Draft acknowledgement is not legal acceptance; platform Terms, garment approvals and privacy consent are distinct.

Real customer processing, SMTP sending and worker operation require separate readiness approval. Task Three's [accessibility shortfall](../task-03-client-validation/docs/accessibility-audit.md) remains disclosed; optional recordings are not mandatory and this task does not complete missing observations.

Next: review the Step 9 checker and opt-in owner procedure, then capture genuine Evidence 15. Evidence 13/14 remains preserved. Functional registration/login/reset remain unavailable; the historical real-auth timing baseline is absent. Evidence 11/12 retains its narrowed scope, and the password-trimming compliance gap remains open.

Assumptions: none. Proposed choices require review before implementation.
