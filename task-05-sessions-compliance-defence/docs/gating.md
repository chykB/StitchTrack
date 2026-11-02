# Email-verification gating

**Product decision: HARD GATING.** The read-only PRD requires verified email ownership
before tailor sign-in or business access. This branch implements the assessment's
alternative, not a change to that decision. No legal candidate is approved or published.

## Hard and soft flows

| Boundary | Approved hard policy | Local assessment soft alternative |
| --- | --- | --- |
| New signup | Unverified User, Argon2id credential and encrypted verification mail; no session. | The same registration commits, then the existing login service issues a real digest-backed session for the newly created user. |
| Unverified identity | Login/authoritative lookup refused. | Authenticated identity is available with `emailVerified:false`; a clear warning and OTP form remain visible. |
| Email verification | Same six-digit, five-minute, three-attempt code and 60-second resend cooldown; fresh login required. | Same OTP service consumes the challenge without creating another session. Authoritative session refresh confirms verification and retains the same identity/absolute expiry. |
| Business authorization | Verification plus business-specific permission required. | Unverified users are refused before the business-permission callback; verified users still need that permission. |

The hard flow reduces unverified account use and makes proof of email ownership an early
boundary. It adds signup friction and depends on timely email delivery. Soft gating lets
a user establish a limited identity immediately and verify later; it can reduce abandonment
when mail is delayed. It also increases unverified sessions, abuse opportunities and the
risk that a later business route mistakes authentication for authorization. StitchTrack
therefore retains hard gating as its product policy.

Soft signup still has neutral 202 JSON for new/duplicate submissions, but cookie issuance
necessarily distinguishes new creation from a duplicate. It cannot claim identical account-
existence behavior to hard signup. A duplicate never changes a password, creates another
credential or receives a session just from submitting an email. Password reset remains
restricted to existing verified, enabled password accounts; passwordless clients and
administrative/deletion locks are unchanged.

## Implementation and isolation

[The guard](../../lib/product-auth/soft-gating-assessment.server.ts) requires all of:

- Actual and configured NODE_ENV=development, product-test mode and confirmation.
- Exact checked-out branch `feat/task-05-soft-gating-assessment`; missing Git metadata,
  detached HEAD or another branch refuses the alternative.
- `PRODUCT_SOFT_GATING_ASSESSMENT=true`, disabled by default.
- The existing frontend, signup/session, loopback HTTP, rate-policy and development-only
  consent-deferral opt-ins. Only the existing localhost/127.0.0.1:3000 origins qualify.

Production, product development and deployment bundles without Git metadata cannot enable
it. The shared services still default to hard gating even when the flag exists. No schema,
migration, grant, dependency, cookie policy or alternative authentication mechanism was
introduced. Do not merge this assessment exception into the product branch.

[Registration](../../lib/product-auth/registration.server.ts) still prohibits sessions
inside its identity/OTP transaction. Its assessment-only completion signal allows the
[development dispatcher](../../lib/product-auth/registration-development.server.ts) to
call the existing [session service](../../lib/product-auth/session.server.ts) after a new
registration commits. Session issuance uses the real User-row transaction, account-lock
checks, cryptographic tokens, digest adapter and signed cookies. Cookies leave the service
only after successful session commit. Signup's account/IP budgets protect this new-account
path; ordinary later logins retain their existing separate login budgets.

These are two transactions, not an atomic signup/session transaction. A failed/uncertain
session commit may leave the account and queued OTP committed, but no successful cookie
response is claimed. Do not automatically retry signup. Verification and later credential
login provide recovery; the alternative never logs in an existing duplicate implicitly.

The existing verification adapter still blocks all session creation. Only the assessment
configuration permits pre-existing sessions during verification. The frontend checks the
real session after signup and after OTP verification, with a manual refresh/retry option.
An acknowledgement or local `verified` phase alone cannot remove a cached unverified
warning. Reloading `/auth?signup` can resume verification from the current server-confirmed
unverified session email. No email query parameter, OTP/password persistence or new session
framework is used. The same logout uncertainty handling remains in place.

[`requireBusinessSession`](../../lib/product-auth/session-http.server.ts) rejects an
unverified session with 403 before invoking business authorization. There is no implemented
business dashboard/operation to demonstrate here; offline seam tests are not evidence of
completed business authorization. New business routes must use this server boundary and
check business membership. Soft authentication never supplies that membership.

## Owner browser evidence: 03-soft-gating-flow.mp4

Status: prepared and offline-tested; no browser recording or PostgreSQL result is claimed.
No migration or additional grant is required by this change. Existing product-test migrations,
Session INSERT/DELETE permissions, private keys, approved local rate policies and SMTP
configuration must already be available. Preserve historical accounts and evidence.

1. Review this branch/diff. Stop the owner's existing Next process if necessary, then use
   the existing ignored local configuration and normal Next server (no gateway/certificates):

   ```bash
   cd /home/bmalik/stitchtrack
   PRODUCT_SOFT_GATING_ASSESSMENT=true npm run dev
   ```

   All existing opt-ins listed above must be configured; do not regenerate private keys,
   broaden permissions, disable limits or change the database target to make it run.
2. Separately authorize the existing product-test [email worker](../../prisma/product/email-worker.md)
   before signup so the five-minute code does not expire while waiting. No new sender or
   transport is introduced. In its existing private local environment:

   ```bash
   cd /home/bmalik/stitchtrack
   PRODUCT_EMAIL_WORKER_ENABLED=true npm run dev:email
   ```

3. Use an isolated browser profile at `http://127.0.0.1:3000/auth?signup`. Use a fresh,
   owner-controlled receiving address and a synthetic display name. Do not reuse a historical
   account: duplicate signup intentionally will not issue a new session.
4. Submit signup. Capture the authenticated synthetic display name, explicit unverified
   warning and working OTP form before entering the code. The existing session endpoint
   must return 200 with `emailVerified:false`; inspect privately, without recording cookies.
   Business access is unavailable. This is real limited authentication, not an inbox-delivery
   claim or permission to access business records.
5. Pause recording while reading/entering the real code. Verify, then capture the authoritative
   refreshed verified status with the same synthetic identity and no unverified warning.
   Refresh/retry if storage/rate/network errors prevent confirmation; never substitute a
   successful screen. No new login or session renewal is needed after verification.
6. Log out and confirm the existing session endpoint refuses the revoked cookie. Stop the
   owner-run processes and remove the nonsecret opt-in from that shell after testing. Before
   changing branches, close the isolated profile/log out; hard lookup refuses any remaining
   unverified sessions. Do not delete accounts or historical records as part of this procedure.

Save a new recording as `task-05-sessions-compliance-defence/evidence/03-soft-gating-flow.mp4`
only if that path is absent. Never overwrite evidence. Pause/redact personal addresses,
passwords, OTP values, cookie/header values and private environment/terminal contents before
publication. Local HTTP cannot establish HTTPS Secure-cookie browser evidence; production
HTTPS behavior and the approved seven-day/no-renewal policy remain unchanged.

Offline tests exercise installed Better Auth with persistence/counter/socket doubles and
actual frontend controllers/markup. They do not establish PostgreSQL concurrency, SMTP
acceptance/inbox delivery or a mounted browser result for this alternative.

Assumptions: none. Product hard gating and legal approval remain unchanged.

## Assessment implementation reference

The alternative soft-gating implementation is preserved on branch
`feat/task-05-soft-gating-assessment` at commit `4fd0860`.

Only its documentation and Evidence 03 were copied into the product
branch. The soft-gating authentication changes were not merged.
StitchTrack retains hard email-verification gating as its product policy.
