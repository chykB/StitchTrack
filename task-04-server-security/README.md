# StitchTrack - Task Four: The Server Is the Source of Truth

## Current status and product boundary

Reviewed on feat/task-04-server-security at HEAD e09b419 plus the existing pending authentication/email/documentation work. The [PRD](../docs/PRD.md) is authoritative and read-only. The assessment PDF is unavailable; the owner's supplied 12 steps and exact 19 interview questions define this review.

**Evidence 01-23 is present. Written deliverables are indexed below. This is not a declaration that every functional assessment requirement or production launch gate is complete.** Owner-run PostgreSQL registration/verification and worker-mechanics checks passed their reported scopes. The latest OTP capture has owner-reported run_exit_status=0, capture_exit_status=0 and connection cleanup, plus screenshots 19-22. Its final all-four-stages banner was not found in filtered output and is not asserted.

Public Signup/Login/Reset remain UI-only; the opt-in /auth?verify view does not verify accounts. Development-only /api/auth/signup, /login and /reset are validation previews, not functional authentication. Internal Better Auth registration/OTP services use the separate eight-model product schema with Argon2id, exact passwords, synthetic test Terms, stable issuances and encrypted email jobs. They are not wired to public forms; functional public sign-in/recovery and sessions remain inactive.

The seven-table disposable financial/retrieval laboratory is separate from product development/test and Task Two. It does not introduce payment processing, retrieval or AI to StitchTrack. Clients pay tailors directly; the future product records unverified receipts. Client invitations and business-scoped access remain product work, not extra user roles.

## Twelve-step reconciliation

| Step | Verified scope | Remaining mandatory/scope issue |
| --- | --- | --- |
| 1. Schema | Paper photograph; seven-table lab specification with columns, cardinalities, indexes/write costs and duplication; payment-attempt/history rationale. | Lifecycle triggers/writers remain deliberately unimplemented; do not claim enforcement beyond migrated constraints. Lab/product separation must remain explicit. |
| 2. Initial inspection | Evidence 02 records the owner's genuine initial state. | None identified for the supplied capture requirement. |
| 3. Migrations | Genuine initial deploy, populated-table failure, three-step recovery/reconciliation and client runtime drift/correction are captured. | Do not rerun or edit applied migrations to polish evidence. |
| 4. Hashing | Two salted Argon2id hashes verify; actual local Argon2id/SHA timings and arithmetic are captured. SHA is comparison only. | Deployment concurrency calibration is product readiness, not a missing local timing capture. |
| 5. Normalization/trimming | Synthetic email and trimming comparisons captured; shared canonicalization and exact password preservation exist internally. | Actual functional Login/Reset integration remains absent. Assessment trimming versus product exact-password policy requires explicit resolution. |
| 6. Boundary validation | Shared Zod validates three preview operations and internal registration. Evidence 11 has real controlled HTTP timings. | No historical functional-auth before-validation baseline; fixture timings do not establish that comparison for working auth. |
| 7. Repeat attacks | Evidence 12 contrasts genuine Task Three fixture 200 with malformed-payload refusal 422 at the new preview boundary. | It is not the same registration endpoint before/after; full functional authentication enforcement/integration remains pending. |
| 8. Rate limiting | Three-path isolated limiter, triggered 429 and genuine changed-source-IP admission while original peer stays blocked. | Shared/account-aware product limits and trusted ingress remain absent; fixture scope needs assessor acceptance where functional-auth protection is required. |
| 9. Breached passwords | Evidence 15 shows real preview HTTP 422; prefix-range checker fails closed. Internal registration requires a checker prerequisite. | Wire the actual checker and operational failure controls into the future public caller; test stubs are not production screening. |
| 10. Verification/background email | Real service/PostgreSQL screenshots show persistence, expiry, attempts and replay. SMTP failure/success is separately captured. Evidence 18 contains measured controlled HTTP comparison. | No eligible end-to-end worker SMTP dispatch or PostgreSQL registration timing comparison. Keep controlled-transport scope explicit. |
| 11. Branded email | Actual received/rendered email, plain-text/HTML implementation and editorial notes; screenshot 23 is visibly redacted. | Real mail-client/accessibility/deployment checks are not inferred from one screenshot. |
| 12. Omitted controls | Four independent controls with rationale, risks and future triggers are documented. | Review operational triggers before deployment; missing essential launch controls are not optional omissions. |

## Evidence index

A checked item means the artifact is present and its stated capture scope is recorded, not that its whole assessment step or production behavior is certified. All evidence is owner supplied; no capture was rerun or overwritten during this documentation review.

| Present | No. | Artifact and limit |
| --- | --- | --- |
| [x] | 01 | [Paper schema drawing](evidence/01-schema-drawing.jpg), owner photograph. |
| [x] | 02 | [Initial database state](evidence/02-database-state-before.png). |
| [x] | 03 | [Initial migration command/output](evidence/03-initial-migration.txt), recorded deploy and capture statuses zero. |
| [x] | 04 | [Required-column failure](evidence/04-required-column-failure.txt), P3018/23502; deliberate migration exit 1 and capture 0. |
| [x] | 05 | [Nullable/backfill/required recovery](evidence/05-required-column-three-steps.txt); successful [reconciliation attempt](evidence/05-required-column-resolution-attempt-02.txt) preserves the earlier failed diagnostic. |
| [x] | 06 | [Runtime schema drift and restoration](evidence/06-drift-error.txt), P2022 then successful corrected read. |
| [x] | 07 | [Two different hashes](evidence/07-hash-twice-different.txt), both verify. |
| [x] | 08 | [Local hashing measurements/arithmetic](evidence/08-timing-argon-vs-sha.txt), not GPU/deployment throughput. |
| [x] | 09 | [Email normalization](evidence/09-email-case-normalised.png), isolated comparison. |
| [x] | 10 | [Password trimming experiment](evidence/10-password-trim-working.png), product passwords remain unchanged. |
| [x] | 11 | [HTTP validation timings](evidence/11-validation-timing.txt), controlled fixture. |
| [x] | 12 | [Direct-request comparison](evidence/12-direct-request-before-and-after.txt), synthetic 200 versus preview 422. |
| [x] | 13 | [Triggered rate limit](evidence/13-rate-limit-triggered.png), actual HTTP 429. |
| [x] | 14 | [Source-IP bypass](evidence/14-rate-limit-defeated.txt), actual socket peer changed; no authentication. |
| [x] | 15 | [Breached-password rejection](evidence/15-breach-check-rejection.png), actual HTTP 422 and owner exit 0. |
| [x] | 16 | [SMTP authentication failure](evidence/16-smtp-failure.txt), owner-transcribed EAUTH/sanitized result. |
| [x] | 17 | [SMTP acceptance](evidence/17-smtp-success.txt), owner transcription and separately reported inbox arrival; not worker dispatch. |
| [x] | 18 | [Synchronous/background timings](evidence/18-registration-timing-sync-vs-job.txt), five pairs, controlled delay/local-file commit, no SMTP/PostgreSQL registration. |
| [x] | 19 | [Persisted verification rows](evidence/19-verification-row.png), safe selected database columns, unverified and no session. |
| [x] | 20 | [Actual expiry rejection](evidence/20-verification-expired.png), invalid after stored wall-clock deadline, still unverified. |
| [x] | 21 | [Incorrect-code attempts](evidence/21-verification-wrong-code.png), committed counters 1/2/3 and cancellation; the frame crops lower tables. |
| [x] | 22 | [Consumed-code replay rejection](evidence/22-verification-code-reused.png), verified then invalid, consumed issuance and removed library row. |
| [x] | 23 | [Rendered branded email](evidence/23-rendered-email.png), visible sender/recipient/code redaction confirmed in current image; image unchanged here. |

The owner's zero OTP statuses/cleanup are supplied observations, not a newly created transcript or proof that the missing final banner appeared. Evidence 19-22 demonstrates the named internal service/database cases; no public UI or SMTP linkage is implied. Keep any existing full OTP log privately if available; do not recreate successful tests just to obtain a banner. Evidence 24 (seven-minute walkthrough) is optional bonus evidence.

## Required documentation

| Document | Scope |
| --- | --- |
| [schema.md](docs/schema.md) | Seven-table lab, full fields/relationships/indexes/duplication; [product proposal](docs/product-schema-proposal.md) is separate. |
| [migrations.md](docs/migrations.md) | Failure/recovery, forward-only history and drift; retained commands are historical. |
| [hashing.md](docs/hashing.md) | Argon2id profile, salts, genuine local timings/arithmetic and limits. |
| [validation-placement.md](docs/validation-placement.md) | Schema placement, parsing bounds, fixture timing scope and functional-integration gap. |
| [rate-limiting.md](docs/rate-limiting.md) | Thresholds, real source-IP bypass, shared-counter/proxy and user-cost discussion. |
| [breach-check.md](docs/breach-check.md) | Prefix protocol, strict responses, outage policy and actual preview rejection. |
| [verification-design.md](docs/verification-design.md) | OTP lifecycle, SMTP/outbox and owner-reported results/provenance. |
| [email-copy.md](docs/email-copy.md) | Brand/copy, accessible alternatives and real-customer editorial checks. |
| [not-implemented.md](docs/not-implemented.md) | Four genuine security deferrals, risks and triggers. |
| [defects.md](docs/defects.md) | Actual findings, corrections and unresolved product/assessment limits. |
| [interview-answers.md](docs/interview-answers.md) | Exact owner-supplied 19 questions in order, each answer at most 200 words. |

Reproducibility details: [OTP capture](docs/verification-evidence.md), [controlled email timing](docs/email-timing.md), [worker mechanics](../prisma/product/worker-postgres-verification.md). They do not authorize repeating database operations or sending mail.

## Automatic-fail review and remaining work

- Password storage uses Argon2id, not SHA/MD5. Evidence 07/08 records genuine local measurements and arithmetic; SHA-1 is only HIBP protocol and SHA-256 only permitted comparison/digests.
- Evidence 04 records a real populated-table migration failure. Evidence 14 records a successful genuine source-IP bypass. Neither should be replaced by predicted output or spoofed forwarding headers.
- At least four deferred controls are now documented. No missing item among the supplied automatic-fail conditions was identified in this review; this is not an assessor verdict or waiver of narrower fixture scopes.
- Resolve the explicit password-trimming conflict and assessor acceptance of the limited 09-14/18 demonstrations. Public frontend/backend sign-in/recovery/session integration, shared abuse controls and eligible end-to-end email delivery remain product work, not completed by artifact presence.
- Company registration and the [legal launch checklist](../task-03-client-validation/docs/terms-note.md#launch-approval-checklist) remain prerequisites for related public use. Policies are V1.0 candidates, owner/legal review pending, not public/effective. No approved TermsVersion record is inferred from synthetic fixtures.

## Verification and Git review

Documentation-only close-out checks passed: 19 exact questions once each in order, answers 128-144 words, 221 local Markdown links, 26 retained Bash blocks checked with bash -n, and git diff --check. No application/database/SMTP experiment was rerun. Existing pending application, dependency, configuration, legal and evidence changes are preserved for separate owner review. Documentation is ready for review; this does not authorize staging, committing or public deployment. Compare the complete pending diff before an owner-controlled commit, including privacy review of all captures. The current redaction check is visual, not a guarantee about embedded metadata.

Assumptions: none. All operational/database actions remain owner-controlled; no database, migration, worker, email or evidence-writing operation occurred in this review.
