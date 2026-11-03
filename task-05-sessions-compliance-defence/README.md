# StitchTrack Task Five: Sessions, Deletion, and the Defence

Branch: `feat/auth-session-integration`.

This directory records implemented and owner-tested Task Five checkpoints, not full
assessment completion or launch readiness. The [PRD](../docs/PRD.md) remains authoritative
and read-only. PostgreSQL verification used **`stitchtrack_product_test` only**. Public
authentication and production deployment are not approved; legal-policy candidates remain
review pending, unpublished and ineffective.

## Completed checkpoints and evidence

Results below are owner-reported, owner-executed checkpoints. The linked evidence files
exist; this documentation update did not rerun operations, inspect/redact captures or
independently verify their contents. File presence is not a privacy-review approval.
These current statuses supersede the README's earlier prepared/pending statements.

| Checkpoint | Completed implementation and owner verification | Existing evidence |
| --- | --- | --- |
| Sessions, login and logout | Database-backed sessions with fresh identifiers, HMAC digest-only storage, fixed seven-day expiry/no renewal, generic credential errors and shared PostgreSQL rate limits. Session persistence/revocation, same-browser identity switching and logout/network-failure evidence are captured. | [01: session identifiers](evidence/01-two-session-ids.txt), [02: cookie flags](evidence/02-cookie-flags.png), [05: generic errors](evidence/05-generic-errors-both-cases.png), [06: two users](evidence/06-two-users-one-browser.txt), [07: row present](evidence/07-session-row-present.png), [08: row deleted](evidence/08-session-row-deleted.png), [09: network failure](evidence/09-logout-network-failure.txt), [10: logout fix](evidence/10-logout-edge-case-fixed.txt) |
| Verification gating | Hard gating remains the main product policy. Soft gating was implemented and demonstrated separately on `feat/task-05-soft-gating-assessment` at `4fd0860`; only its documentation/evidence were copied here, not its authentication changes. | [03: soft flow](evidence/03-soft-gating-flow.mp4), [04: hard flow](evidence/04-hard-gating-flow.mp4); [design and trade-offs](docs/gating.md) |
| Password reset | Implementation and fourth test-database migration completed. Existing OTP/outbox/Argon2id services replace the password and revoke all sessions atomically, without automatic login. Cross-session browser revocation completed. | [11: reset revocation](evidence/11-reset-kills-other-session.mp4), [supporting incognito refusal](evidence/11-reset-kills-other-session-incognito-revoked.png); [reset design](docs/password-reset.md) |
| Deletion request | Authenticated fresh-password confirmation locks the account and revokes all sessions transactionally. Real two-browser testing completed. This confirmation does not claim permanent erasure. | [12: account locked](evidence/12-deletion-request-locks-account.png); [account lifecycle](docs/account-lifecycle.md#stage-1-authenticated-deletion-request) |
| Controlled erasure | First real PostgreSQL job erased **9 synthetic records**; the second returned **noop with zero deletions**. Final verification and separate synthetic-fixture cleanup passed. These were owner-triggered runs, not an active scheduled service or production-wide erasure. | [13: first job](evidence/13-scheduled-job-run-one.txt), [14: repeat job](evidence/14-scheduled-job-run-two.txt); [retention matrix and boundaries](docs/retention-matrix.md) |
| State management | Transient Zustand email handoff/reset-step state is implemented and documented; browser demonstration exists. Passwords/OTPs are not persisted in that store. | [15: demonstration](evidence/15-state-management-working.mp4); [state-management rationale](docs/state-management.md) |
| Platform administration | Fifth test-database migration and restricted permissions applied. A temporary administrator used the normal login, Administration navigation, protected page and summary action in browser testing. Ordinary-user page and API requests both returned **403**. The role was subsequently revoked; the disabled endpoint returned **404**. Production administration remains default-off. | [16: ordinary-user refusal](evidence/16-admin-route-refused.png); [authorization and navigation](docs/administration.md) |

Relevant implementation commits: `00bdcec` (account deletion and controlled erasure) and
`a997f06` (protected platform administration). Administration is a server-controlled
platform capability, not a third V1 user type or permission to access tailoring-business
records. Authentication still requires separate business-scoped authorization.

## Current application and evidence boundaries

The owner completed registration -> SMTP email delivery -> OTP verification -> login ->
authenticated session recognition against the isolated test database. Routine local
operation uses the normal Next.js server on explicitly enabled loopback HTTP, existing
Node API routes, socket/raw-header checks, Origin/CSRF protection and PostgreSQL counters.
The earlier HTTPS companion/gateway is historical, not a startup prerequisite.

Cookies are signed, HttpOnly, SameSite=Lax, host-only and fixed for seven days; HTTPS
requires Secure. The historical curl HTTPS proof confirms that transport checkpoint,
not that all subsequent local browser evidence used HTTPS. Do not infer HTTPS browser
Secure-cookie proof from local HTTP captures. Production ingress/proxy trust and rate
policies still require approval. See [session security](docs/sessions.md),
[HTTP integration](docs/http-session-integration.md) and the
[registration/verification workflow](../prisma/product/registration-workflow.md).

The erasure direction is prompt removal of eligible data within a maximum of 30 days,
not a mandatory waiting period. The executable proof remains restricted to disposable
fixtures. Non-fixture TermsAcceptance retention, lawful exceptions, backups/restore,
least-privilege operational execution and scheduling/monitoring remain unresolved.
The public 30-day promise is inactive; no production scheduler or erasure guarantee is
claimed. Company/individual legal candidates are not approved policies.

## Historical verified foundation

These earlier proofs remain valid historical checkpoints; they do not need repeating.
Their detailed procedures/results are preserved at the linked locations. Historical
setup, grants and cleanup must not be blindly rerun after later migrations.

- **Sessions:** run `efa712f4-94f6-431a-958a-bc2decb8f893` passed committed digest-only
  persistence, distinct tokens/digests, independent lookup, expiry and revocation;
  integration exit **0**, both connections closed. Separate exact-fixture cleanup
  completed with **DO, COMMIT and exit 0**. The historical 600-second/expiry-probe
  settings do not replace the seven-day product policy. See the
  [session PostgreSQL record](../prisma/product/session-postgres-verification.md).
- **Shared limits:** run `491953db-dd72-419b-a0ef-103facd8f41d` admitted exactly three
  of 20 account attempts and three of 20 IP attempts, in **113 ms / 71 ms**. Canonical
  equivalence, policy refusal, Retry-After/refill, permissions/constraints and fail-closed
  storage passed; `proof_exit=0`, `capture_exit=0`, all connections/sockets closed.
  Separate exact-key cleanup committed **10** rows, `rate_cleanup_exit=0`; the owner
  removed the temporary proof log. See the [rate-limit checkpoint](../prisma/product/rate-limit-postgres-verification.md#owner-executed-checkpoint)
  and [shared limiter design](../prisma/product/auth-rate-limiting.md).
- **Account locking:** run `a02fc98d-905c-4f0b-a0f6-b9b721869d1d` passed both login/lock
  orderings, simultaneous locking, deletion revocation, fresh lookup, rollback and
  pre-commit disconnect; `account_proof_exit=0`, all connections closed. Cleanup removed
  eight User, eight Account and three Session fixtures, retained the ten historical users
  and committed with `account_cleanup_exit=0`. A lost acknowledgement after a possibly
  successful COMMIT remains untested. See the [account-access proof](../prisma/product/account-access-postgres-verification.md).
- **Curl HTTPS:** run `70bde756-4193-4dba-bc45-cb8ba55e34fd` passed certificate/IP checks,
  generic errors, Secure cookies, lookup/logout, 429s, forwarded-header rejection and
  fail-closed writes; `https_transport_exit=0`. Cleanup removed one User, one Account,
  zero remaining Sessions and five buckets, retained ten historical users and returned
  `https_cleanup_exit=0`. The owner removed the private manifest, receipt, certificate,
  key and two temporary directories. See the [HTTPS transport record](../prisma/product/https-transport-verification.md).

The original Prisma-based session snapshot failed. A subsequent read-only PostgreSQL
diagnostic confirmed **one session record, one distinct digest and valid digest format**.
That diagnostic was not itself a two-session or logout proof; the later evidence above
is a separate checkpoint. Historical [Task Four records](../task-04-server-security/README.md)
are preserved unchanged.

## Remaining submission deliverables

- `privacy.md` and `privacy-draft-with-broken-promise.md`: accurate Task Five privacy
  documents, including an unsupported promise explicitly removed. Unapproved Task Three
  legal candidates are not substitutes or publication approval.
- `docs/interview-with-owner.md`: real business-owner interview and findings that
  challenged a product assumption; do not invent an interview.
- `docs/handbook.md`: seven sections using actual implementation examples and mistakes.
- `docs/what-i-do-not-know.md`: at least eight documented knowledge gaps.
- `docs/interview-answers.md`: answers to the exact **22** official Task Five questions;
  their wording must be supplied/confirmed, not replaced with Task Four's 19 questions.
- `docs/defects.md`: current unresolved issues and limitations.
- Published technical article, its real public URL and **Evidence 17**.
- Final evidence/filename/privacy review and assessment defence. Existing screenshots,
  videos, supporting captures and import metadata have not been privacy-approved by
  this README update. Optional walkthrough recording remains optional.

Some linked documents retain earlier prepared/unexecuted status text. This README records
the newer owner-confirmed milestones; those passages need targeted reconciliation rather
than repeating completed tests or overwriting historical evidence. Operational erasure,
production administration, business authorization and public launch remain separate work.
