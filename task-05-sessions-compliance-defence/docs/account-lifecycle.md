# Account-access locking foundation

Status: implemented with offline tests and **owner-executed PostgreSQL proof completed**
for run `a02fc98d-905c-4f0b-a0f6-b9b721869d1d`. Separate exact-run cleanup committed,
retaining all ten baseline users at that historical checkpoint. No public authentication, suspension,
deletion, reset or restoration endpoint is activated. [PRD](../../docs/PRD.md) is read-only;
this is access denial/session revocation, not a complete account-erasure workflow.

## Internal contract and transactions

[Account service](../../lib/product-auth/account-access.server.ts) requires a root product
Prisma client and an explicit server-owned `authorize(tx, request, state)` callback. No
default authorizer or request-supplied `authorized` flag exists. The callback must check
its authenticated actor/operator and target through transaction-local/local data only;
no external requests or arbitrary HTTP-provided function may run there. Administrative
permissions and valid self-deletion authentication are not implemented by this seam.

`lock({userId, kind: "disable" | "deletion-request"})` validates the complete input, checks
the actual isolated product database/role/schema and takes `User ... FOR UPDATE`. Only an
exact `true` authorization decision permits the update. It records the first database-time
`disabledAt` or `deletionRequestedAt`, retains existing timestamps, deletes **all** Session
rows for that user and verifies none remain, within one real transaction. It exposes no
unlock, restore, physical deletion or cross-business permission. Authorization/required
write failure rolls back the operation; native errors/keys/cookies are never logged.

[Login](../../lib/product-auth/session.server.ts) uses the same root-client transaction
helper and User-row lock before checking current status, hard verification gating and
Better Auth credential verification. Both flags must explicitly be NULL. Missing,
malformed or unreadable state fails closed. Status comes from direct scoped Prisma SQL,
not Better Auth's output shape. Unknown/locked/unverified identities receive generic
credential refusal with existing local Argon2id dummy work, and cannot reach session
creation. Accepted passwords retain exact characters; Login does not reapply Signup rules.

A fresh Better Auth instance binds the unchanged digest adapter to the callback's exact
`tx`. The adapter's pass-through `transaction()` is **not** BEGIN/COMMIT. A root-bound auth
instance must never be reused for login inside an unrelated outer transaction. Cookies
leave the service only after the real transaction returns successfully. Failed or
uncertain commit returns no cookies and never triggers automatic retry; an uncertain
commit may have left an unexposed digest-only row, so do not claim guaranteed rollback.

ReadCommitted plus the common User-row lock establishes ordering: login first commits a
session which the following lock revokes; locking first commits flags, then the waiting
login rejects. Lock order is User before Session/credential mutations. Argon2id stays
inside this minimal transaction; no SMTP/HIBP/external request occurs. Shared abuse budgets
must be consumed **outside** it before verification, so rollback cannot refund attempts.

Limits are explicit: Prisma acquisition maxWait **5 seconds**, transaction **10 seconds**,
PostgreSQL row-lock wait **3 seconds**, individual statements **5 seconds**. These are
initial infrastructure bounds requiring owner workload calibration. Timeout/connection
failure denies access and publishes no success. The supplied client remains caller-owned;
services construct or disconnect no connections.

## Lookup, logout and authorization boundaries

Fresh session lookup additionally reads active User flags/verification, existing session,
expiry and tailor credential membership. Locked identities are rejected even if a legacy
session row remains. Cookie cache and renewal stay disabled; seven-day fixed HTTP policy
and the historical 600-second test configuration are preserved. Individual logout retains
its existing server-revocation check and Better Auth cookie clearing. Authenticated manual
user-wide logout retains its prior semantics; it is not the reset/deletion transaction.

Authentication is separate from business authorization. The existing protected helper
calls fresh lookup and a business-permission callback; it is not a transaction-owning
business-action wrapper. A request authorized before a lock may already be in flight.
Every future session issuer, including passwordless client access, must join the same
User-lock/active-state protocol; generic Better Auth handlers remain unexposed. Strict
protected mutations must take the compatible User lock, recheck session and
business permission within their own transaction and hold it through the action. Already
emitted responses cannot be recalled. Future credential reset must take the same User lock,
change credentials and revoke sessions atomically; it must not clear either lock flag.

## Schema and owner-applied test permissions

The [schema](../../prisma/product/schema.prisma) adds only nullable precision-3 timestamps
`User.disabledAt` and `User.deletionRequestedAt`, no default/index/backfill. The
[third migration](../../prisma/product/migrations/20261030_user_access_locks/migration.sql)
SHA-256 is `89232633d4fde96695591017bb1fab6cb3c6ea425591da14a93f29dbecb78ddd`. The two predecessor migrations remain byte-identical.
The exact [file manifest](../../prisma/product/migration-files.ts) admits these three SQL
files only; unsafe commands/alternate targets remain blocked. The SQL requires the two
exact successful predecessors plus only its own clean in-flight Prisma tracking row.
No User/Session rows are deleted by the migration. At that foundation stage no client
regeneration was run. Parameterized SQL status reads/writes do not depend on
newly generated delegates, but runtime requires the owner-applied columns.

Existing User table SELECT covers the fields; existing test Session DELETE and User
updatedAt UPDATE are reused. The owner reports applying the separate **test-only** grants:

- [Suspension writer](../../prisma/product/setup/account-access-test-disable-permissions.sql): UPDATE(disabledAt).
- [Deletion-lock writer](../../prisma/product/setup/account-access-test-deletion-permissions.sql): UPDATE(deletionRequestedAt).

Each checks exact test database/migrator/runtime ownership, all three migration checksums
and existing least privileges. Neither grants table-wide User UPDATE, email/credential
changes, Session renewal, record deletion or history access. No development permission
path is added. Column grants alone do not implement administrative authorization or make
timestamps immutable: this service provides no clear operation, but a database writer
with UPDATE could clear its column. Production operator controls need owner review.

## Offline checks and completed PostgreSQL checkpoint

[Tests](../../tests/product-auth/account-access.test.mjs) use actual Better Auth/Argon2id
with distinct root/transaction proxies, snapshot rollback and a serialized transaction
double. They cover both login-versus-lock orderings with barriers, refusals, fresh lookup,
individual/all-session revocation, unrelated users, authorization, missing state, failure
injection, failed/uncertain commit and sanitized errors. This is **not PostgreSQL locking
or persistence evidence**. Prior owner session/rate-limit results remain valid only in
their recorded historical scope; do not rerun their setup/grants/cleanup as new proof.

The owner reports that the [PostgreSQL proof and separate cleanup](../../prisma/product/account-access-postgres-verification.md)
completed for the run above: preflight, login-first, lock-first and simultaneous races,
deletion revocation of two sessions, fresh lookup refusal, atomic failure rollback and
pre-commit disconnection all passed. Historical authentication records and unrelated
fixture data were preserved; all proof connections closed; `account_proof_exit=0`.
Separately authorized cleanup removed eight User, eight Account and three Session
fixtures, retained ten baseline users and committed with `account_cleanup_exit=0`.

These are owner-reported real transaction-bound Better Auth/Prisma results, not an agent
rerun or invented terminal evidence. The pre-commit disconnect prevented cookie release
and rolled back an uncommitted session; **lost acknowledgement after a possibly successful
COMMIT remains untested**. No new archive, temporary log, private manifest or screenshot
is supplied. Do not rerun completed migration, grant, proof or cleanup procedures.

## Later local browser milestone

The owner subsequently completed registration -> SMTP email delivery -> OTP verification
-> login -> authenticated session recognition against `stitchtrack_product_test`, using
normal Next.js loopback HTTP with explicit local opt-in. The gateway/certificate path is
historical, not the current routine architecture. Public authentication and lifecycle
endpoints remain inactive; the milestone is not a fresh browser demonstration of locking,
logout, password reset or deletion.

The original Prisma-based session snapshot failed. A later read-only PostgreSQL diagnostic
confirmed one session record, one distinct digest and valid digest format, as recorded in
[sessions](sessions.md#latest-owner-run-browser-and-read-only-diagnostic-checkpoint).
It is separate from the earlier concurrency/cleanup proof and does not establish a second
session, logout revocation or HTTPS browser cookie flags. No current total user count,
new cleanup, screenshot or additional lifecycle result is inferred.

## Decisions still required

- Administrative authority, writer identity/privileges and audit actor/reason/history.
- Valid deletion-request authentication/recent reauthentication and target ownership.
- Restoration, request cancellation and any retention-aware erasure/export schedule.
- Pending verification/resend/outbox behavior; existing flows cannot clear lock flags but
  pending email handling has not been redesigned here.
- Operational timeout/load calibration and strict protected-action composition.

These flags lock the whole identity across businesses, not one business membership.
No new V1 user type, administrative UI, approved legal policy or deletion promise is added.
