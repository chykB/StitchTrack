# StitchTrack Task Five: Sessions, Deletion, and the Defence

Branch: `feat/auth-session-integration`.

This directory records the supplied Task Five requirements as StitchTrack's existing product authentication is integrated. The [PRD](../docs/PRD.md) remains authoritative and read-only. Public authentication is disabled; legal-policy candidates remain unapproved, unpublished and ineffective.

## Historical verified foundation

The owner successfully executed the real product-test PostgreSQL session harness for run `efa712f4-94f6-431a-958a-bc2decb8f893`, with integration exit status **0** and both connections closed. The separately reviewed synthetic cleanup completed with **DO, COMMIT and exit status 0**; PostgreSQL reported the exact synthetic fixtures removed.

The [session record](docs/sessions.md) documents verified refusals, distinct tokens/digests, committed digest-only persistence, independent-connection lookup, individual logout, expiry and user-wide revocation. These are owner-reported internal service/PostgreSQL results, not browser evidence or an agent rerun. No token values, screenshots or terminal transcripts are invented here.

The owner also completed the real PostgreSQL rate-limit proof for run
`491953db-dd72-419b-a0ef-103facd8f41d`: each 20-attempt account/IP race admitted exactly
three requests, in **113 ms / 71 ms** respectively. Canonical equivalence, policy refusal,
Retry-After, real refill, expected permission/constraint errors and fail-closed storage
passed; all connections/sockets closed. **proof_exit=0, capture_exit=0**. Separate exact-key
cleanup committed **10** rows, **rate_cleanup_exit=0**, and closed its connection. The owner
removed the temporary proof log. These are owner-reported results, not a new transcript,
screenshot, agent database test or completed browser workflow. See the
[rate-limit checkpoint](../prisma/product/rate-limit-postgres-verification.md#owner-executed-checkpoint).

| Area | Established | Remaining |
| --- | --- | --- |
| Sessions | Better Auth random bearer tokens, keyed digest-only storage and real PostgreSQL lifecycle proof. | Seven-day/no-renewal tailor policy is now approved; genuine browser cookie/identifier evidence remains pending. |
| Verification gating | Hard gating is implemented internally, consistent with the PRD. | Task Five's alternative soft-gating experiment needs a separately authorized safe branch/exception; no change to product policy is implied. |
| Login | Canonical email, Argon2id, generic refusals, fresh sessions and PostgreSQL counters tested; historical curl HTTPS proof passed; owner completed the current Next.js registration/email/OTP/login/session browser journey. | Captured Task Five browser evidence and production ingress/rate policies remain pending. |
| Protected routes/logout | Individual/user-wide server revocation and account-lock PostgreSQL races owner-verified; curl lookup/logout/revocation passed; fresh lookup rejects locked identities. | Protected business routes, two-account browser identity and logout network-failure evidence. |
| Reset and deletion | Existing sessions can be revoked by user; real reset implementation is offline-tested and prepared. | Apply/review reset prerequisites and run its PostgreSQL/browser proof; full deletion remains separate. |
| Administrative authorization | Authentication remains separate from business permissions. | Resolve the assessment's administrative-role requirement within approved product scope; business-scoped authorization remains mandatory. |

## References and evidence boundary

- [Sessions: implementation, owner results, hijacking and remaining requirements](docs/sessions.md).
- [Local HTTP/HTTPS implementation and remaining browser integration](docs/http-session-integration.md).
- [Completed curl HTTPS proof and cleanup](../prisma/product/https-transport-verification.md).
- [Product PostgreSQL runbook and completed cleanup record](../prisma/product/session-postgres-verification.md).
- [Shared limiter design and remaining activation dependencies](../prisma/product/auth-rate-limiting.md).
- [Registration and verification workflow](../prisma/product/registration-workflow.md).
- [Earlier Task Four records](../task-04-server-security/README.md), preserved unchanged.

No standalone Task Five screenshot or raw execution-log artifact is supplied by this documentation update. Existing source and the owner's reported outcomes support the checkpoint; they do not substitute for required browser captures. Official evidence filenames beyond the supplied requirements have not been invented. This is not a declaration of Task Five completion or launch readiness.

## Account-access foundation: owner-verified PostgreSQL checkpoint

The [lifecycle record](docs/account-lifecycle.md) documents nullable disabledAt and
deletionRequestedAt fields. The owner reports the third product-test migration and
both one-column test grants applied, with 10 existing User records. The internal service requires an explicit transaction-local
authorizer and sets the lock/revokes sessions atomically. Login now uses a real User-lock
transaction with Better Auth bound to its exact Prisma tx; fresh lookup rejects locked
accounts and cookies are returned only after commit. The adapter callback itself still
provides no transaction. Individual logout, fixed seven-day policy and prior evidence
are preserved. No administrative/deletion endpoint or complete erasure workflow exists.

The owner completed the [real PostgreSQL proof and separate cleanup](../prisma/product/account-access-postgres-verification.md)
for run `a02fc98d-905c-4f0b-a0f6-b9b721869d1d`. Preflight, both login/lock orderings,
simultaneous locking, deletion revocation of two sessions, fresh lookup, transaction
rollback and pre-commit disconnection passed; all proof connections closed;
`account_proof_exit=0`. Ten historical users, historical authentication records and
unrelated fixture data were preserved. Separate cleanup removed eight User, eight
Account and three Session fixtures, retained ten baseline users, committed and returned
`account_cleanup_exit=0`.

These are owner-reported internal service/PostgreSQL results, not browser evidence or
an agent rerun. The pre-commit failure returned no cookie and rolled back the session;
a lost acknowledgement after a possibly successful COMMIT remains untested. Do not
rerun completed migrations, grants, proof or cleanup. Administrative authority, deletion
reauthentication, restoration, audit and pending OTP/email handling remain unresolved.
Production HTTP activation and business authorization remain separate dependencies;
explicit local Next.js browser authentication has since been owner-tested. No private
proof file or historical evidence is changed.


## Completed curl HTTPS transport checkpoint

Owner-reported run `70bde756-4193-4dba-bc45-cb8ba55e34fd` passed certificate/IP validation,
generic credential errors, Secure signed-cookie issuance, lookup/logout/revocation,
PostgreSQL account/IP 429 responses, forwarded-header rejection and fail-closed write
failure handling. Historical users and authentication/rate records were unchanged;
listener and database connections closed; `https_transport_exit=0`.
Separate cleanup removed one User, one Account, zero remaining Sessions and five buckets,
retained ten original users and returned `https_cleanup_exit=0`. The private manifest,
receipt, certificate, key and their two temporary directories were also removed by the owner.

This historical curl checkpoint does not itself establish browser/frontend integration
or launch approval. The later Next.js local HTTP browser milestone below now establishes
registration through session recognition. Browser cookie captures, two-session/user
comparisons and logout/network-failure evidence remain pending. No screenshot, log or new
measurement is supplied here. Public authentication remains disabled; reverse-proxy trust
and production rate values remain unapproved.


## Current Phase 1: Next.js session/logout integration

The current development path uses the normal Next.js server at the explicitly configured
loopback HTTP origin, with existing Node API routes, socket/raw-header checks, PostgreSQL
limits and account-lock services. No separate gateway or certificate is required. HTTP
cookies are signed, HttpOnly, SameSite=Lax, host-only and seven-day fixed; HTTPS cookies
also require Secure. Production activation remains refused. Earlier gateway preparations
are historical references, not current startup prerequisites.

The owner now reports a successful real registration -> SMTP email delivery -> OTP
verification -> login -> authenticated session-recognition browser journey against
`stitchtrack_product_test`. That report does not
establish logout, two-user switching, cookie screenshots or the other Task Five captures.
No new transcript or evidence has been invented. Existing tests already cover same-jar
A-to-B switching, failed logout before dispatch, lost responses after revocation, expired
sessions and secure-cookie serialization. Offline tests are not browser evidence.

The [Phase 1 session record and owner capture procedure](docs/sessions.md#evidence-status-and-owner-procedure)
distinguishes those results from remaining captures. The original Prisma session snapshot
failed; a separate read-only PostgreSQL diagnostic confirmed **one session record, one
distinct digest and valid digest format**. This is not a two-session comparison or logout
proof. The failed snapshot block is retained as historical; review a working read-only
capture procedure before further session comparisons. The earlier Phase 1 source review
found no additional session/logout correction necessary. Do not repeat completed PostgreSQL
proofs, migrations, fixture setup or cleanup.

## Remaining submission deliverables

At the earlier documentation checkpoint only this README and the session/lifecycle/HTTP/
frontend notes existed, without captured Task Five artifacts. The reset/state-management
notes below are now prepared; existing owner evidence is preserved, not audited by this slice. The table records gaps; it does not initiate unrelated implementation phases.

| Deliverable | Current gap |
| --- | --- |
| `docs/sessions.md` | Implementation/reported results and owner procedure prepared; fresh browser captures still pending, including HTTPS Secure-cookie evidence. |
| `docs/gating.md` | Missing; hard policy implemented, safe alternative-branch soft-gating experiment/evidence not supplied. |
| `privacy.md`, `privacy-draft-with-broken-promise.md` | Missing Task Five deliverables; Task Three candidates remain unapproved/unpublished, not substitutes. |
| `docs/retention-matrix.md` | Missing; approved periods, backups and deletion/retention conflict decisions remain unresolved. |
| `docs/state-management.md` | Prepared using real transient Zustand email handoff; browser demonstration remains pending. |
| `docs/interview-with-owner.md` | Missing genuine owner interview and challenged assumption. |
| `docs/handbook.md` | Missing seven-section handbook using actual code and mistakes. |
| `docs/what-i-do-not-know.md` | Missing at least eight documented knowledge gaps. |
| `docs/defects.md` | Missing Task Five defect record; do not invent failures. |
| `docs/interview-answers.md` | Missing; exact official **22** Task Five questions must be supplied before drafting answers. Task Four's 19 questions are different. |
| Required evidence `01` through `17` | None present here. Confirm official filenames/mapping; remaining flows include gating, generic errors, logout, reset, deletion/jobs, state management, protected roles and published article. |
| Published article; optional walkthrough | No Task Five article URL/evidence or recording supplied. |

Reset still needs its unapplied database prerequisites and owner proof; full deletion/purge,
retention, roles and protected business functionality remain application dependencies. Account-locking and revocation foundations are already verified;
reuse them rather than rebuilding them. The assessment's administrative-role requirement
and soft-gating demonstration need explicit scope reconciliation with the PRD's two V1
user types and mandatory tailor verification. Public launch/legal approval is not claimed.

## Password-reset implementation prepared (not database-verified)

The [reset flow](docs/password-reset.md) now connects the existing Reset page to the
transaction-bound Better Auth service, shared PostgreSQL limiter, encrypted outbox and
worker. [Zustand state](docs/state-management.md) carries the editable email from a failed
Login through code/password steps without URL or persistent browser storage. No automatic
session follows reset. This supersedes earlier descriptions of reset/state-management
implementation as missing; public activation remains disabled.

The fourth test-only migration and narrow Account credential UPDATE grant are **unapplied**;
the prepared PostgreSQL proof, cleanup and two-browser reset evidence remain unexecuted.
Existing owner evidence files are preserved and were not reviewed or changed by this slice.
Do not mark Task Five complete from offline tests or the earlier login/session milestone.
