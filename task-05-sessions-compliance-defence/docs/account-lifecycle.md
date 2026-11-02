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
permissions are not implemented by this seam. The authenticated Stage 1 request below
now supplies a transaction-local self-deletion authorizer; the seam itself has no default authority.

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
At that historical checkpoint the exact [file manifest](../../prisma/product/migration-files.ts)
admitted those three SQL files; the current manifest also includes the reviewed reset migration.
For the original locking sequence, unsafe commands/alternate targets remain blocked. The SQL requires the two
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
- Restoration/cancellation authority and stronger future reauthentication methods beyond the implemented fresh password confirmation.
- Restoration, request cancellation and any retention-aware erasure/export schedule.
- Pending verification/resend/outbox behavior; existing flows cannot clear lock flags but
  pending email handling has not been redesigned here.
- Operational timeout/load calibration and strict protected-action composition.

These flags lock the whole identity across businesses, not one business membership.
No new V1 user type, administrative UI, approved legal policy or deletion promise is added.

## Stage 1 authenticated deletion request

Implemented on `feat/auth-session-integration`, default-off and restricted to the existing
local-development/product-test HTTP boundary. No permanent purge, anonymization, grace
period, restoration endpoint or retention promise is included. The historical PostgreSQL
locking proof above is not fresh browser evidence for this new request boundary.

The authenticated login screen now offers **Delete my account**, then a warning and fresh
current-password confirmation. There is no dashboard yet. The browser submits only
`{password}` to `POST /api/internal/tailor-session/delete-account`; extra keys, including
userId and authorization flags, are rejected. Password characters are preserved exactly;
confirmation uses existing Argon2id verification, not new-password strength validation.

[The request service](../../lib/product-auth/account-deletion.server.ts) derives the actor
from the real signed-cookie/digest-backed session. It calls the unchanged account-access
lock service. Inside that service's actual User-row transaction its authorizer:

1. Refuses disabled, deletion-locked, absent or unverified accounts.
2. Rechecks that the current cookie still resolves to this locked User through the same
   transaction-bound Better Auth/digest adapter, without cache or renewal.
3. Requires an existing matching credential Account with a non-null password and verifies
   the submitted current password against its current hash under the User lock.

Only then does the existing service set deletionRequestedAt and delete every Session in
one commit. No User/Account/business/history row is deleted. Login-first sessions are
revoked; lock-first login fails. Password reset shares this same User lock and cannot
reactivate a locked account. A stale pre-lock authentication read is insufficient.

After commit the existing Better Auth logout method clears the current signed cookie.
A cookie-clear or lost-COMMIT-acknowledgement failure returns a generic 503/uncertain UI;
it may already have locked the account, so never claim automatic rollback or retry it.
Other browsers' cookies may remain physically present but no longer resolve server-side.
Subsequent requests with revoked cookies return generic 401 (or an earlier rate-limit
refusal); overlapping requests cannot update the original timestamp or restore access.

[The HTTP boundary](../../lib/product-auth/account-deletion-http.server.ts) reuses the
Node socket/rawHeaders transport, bounded parser, exact Host/Origin/CSRF checks and
forwarded-header refusal. IP tokens are spent before parsing/session lookup; account
tokens use the authenticated server email, never a browser identity. Confirmation shares
**the existing login account/IP buckets**, including successful attempts, so it does not
create another password-guessing budget. Store failures fail closed; partial consumption
is not refunded. No new numerical rate policy or key is introduced.

Client state is cleared only after a strict successful response; errors never imply
permanent erasure. The password is cleared after an attempted confirmation, cancellation
or identity/session-state change. All existing fixed seven-day/no-renewal and cookie
policies remain unchanged. Public/production activation remains refused.

### Permissions and owner prerequisites

No new migration or grant is required. This reuses the owner-reported product-test
UPDATE(deletionRequestedAt), UPDATE(updatedAt), Session DELETE and existing User/Account/
Session SELECT permissions. The runtime must remain the non-owning restricted
`stitchtrack_product_test_app`; no development grant is implied. Existing historical
three-migration permission scripts must **not** be blindly rerun after later migrations.
If any required privilege is absent, stop and obtain a separately reviewed current-state
proposal rather than broadening access or weakening a guard.

Optional owner-only read-only ACL preflight; this has not been run by the agent:

```bash
cd /home/bmalik/stitchtrack
set +x
/usr/bin/env -i PATH=/usr/bin:/bin PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
  /usr/lib/postgresql/16/bin/psql --no-psqlrc --password --host=127.0.0.1 --port=5432 \
  --dbname=stitchtrack_product_test --username=stitchtrack_product_test_app --set=ON_ERROR_STOP=on <<'TASK05_DELETE_ACL'
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $guard$
BEGIN
 IF current_database()<>'stitchtrack_product_test' OR current_user<>'stitchtrack_product_test_app' OR session_user<>current_user
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls))
  OR NOT has_column_privilege(current_user,'product."User"','deletionRequestedAt','UPDATE')
  OR NOT has_column_privilege(current_user,'product."User"','updatedAt','UPDATE')
  OR NOT has_table_privilege(current_user,'product."Session"','DELETE')
  OR NOT has_table_privilege(current_user,'product."User"','SELECT')
  OR NOT has_table_privilege(current_user,'product."Account"','SELECT')
  OR NOT has_table_privilege(current_user,'product."Session"','SELECT')
  OR has_table_privilege(current_user,'product."User"','UPDATE,DELETE,TRUNCATE')
  OR has_schema_privilege(current_user,'product','CREATE')
 THEN RAISE EXCEPTION 'STOP: exact restricted product-test target and existing privileges required'; END IF;
END;
$guard$;
SELECT 'PASS: required existing deletion privileges; read-only preflight' AS status;
ROLLBACK;
TASK05_DELETE_ACL
```

### Browser evidence: 12-deletion-request-locks-account.png

The owner reports a successful real two-browser Stage 1 deletion test, and Evidence 12
is present. The retained instructions below describe that checkpoint; no raw output, date
or additional database proof is invented. This flow locks
the entire identity across businesses and has no restoration path. The owner must use
only a **new dedicated, disposable verified product-test account**, created through the
existing application if needed. Never use a historical fixture or a real operating account.
Do not run a destructive test harness, change records manually or assume cleanup is authorized.

1. Review this change and existing private local configuration. Stop the current Next
   process if necessary, then restart the normal loopback application with the new
   nonsecret flag; all existing session/security/rate-policy opt-ins remain required:

   ```bash
   cd /home/bmalik/stitchtrack
   ENABLE_PRODUCT_ACCOUNT_DELETION_HTTP=true npm run dev
   ```

2. Use `http://127.0.0.1:3000/auth?login` in two independent browser profiles, both logged
   into that dedicated account. Confirm both profiles recognize its session. Existing
   seven-day sessions are used; no fixture script or alternate authentication is needed.
3. In profile A select **Delete my account**. Read the warning, enter the current password
   privately and choose **Request account deletion**. A wrong-password trial is optional;
   it must refuse without locking. Two logins plus confirmation spend the shared three-token
   local account budget; wait for Retry-After before additional attempts. Never reset counters.
4. After a real 200 response, A must show the account-lock/all-session-revocation confirmation
   without claiming erasure. Focus/refresh profile B: authoritative session lookup must
   return 401 and authenticated presentation must disappear. After rate refill, another
   password login must fail generically. An already in-flight response cannot be recalled.
5. Capture the confirmation and the second profile's refused session side by side as
   `task-05-sessions-compliance-defence/evidence/12-deletion-request-locks-account.png`
   only if absent. Redact email addresses and personal identifiers; never capture password,
   cookie/header/token values, request payloads or private environment output. Do not
   overwrite existing evidence or fabricate a second-browser refusal from a local-only clear.

If any response is uncertain, preserve the outcome and use read-only investigation;
unauthenticated status alone cannot prove whether deletion, logout or expiry caused it.
Do not automatically resubmit, unlock, purge or delete the test account. Leave it locked
until any later cleanup or retention action is separately reviewed and authorized.

Offline tests cover authorization, fresh/exact password confirmation, transaction-bound
session recheck, rollback/uncertain outcomes, two-session revocation, unrelated users,
serialized concurrency doubles, strict HTTP/CSRF/rate boundaries and frontend states.
These are not fresh PostgreSQL concurrency or browser evidence. Administrative authority,
audit history, account restoration, retention/purge and all future notification behavior
still need their own approved work; this Stage 1 flow makes no promise about them.

Current verification: **464 offline tests passed**, including 18 new deletion service,
HTTP/Node transport and frontend tests. TypeScript, the three new JavaScript syntax
checks, 29 local documentation links, two Bash blocks and `git diff --check` passed.
No database connection, migration/grant, SMTP operation or browser deletion was executed
by the agent. Evidence 12 remains for fresh owner capture.

## Stage 2 controlled erasure preparation

See the [nine-model retention matrix and owner erasure procedure](retention-matrix.md).
The owner-approved direction is prompt erasure of eligible data within 30 days from the
original request, subject to specific documented lawful exceptions. The current user-facing
Stage 1 wording is unchanged: the proposed 30-day promise is **not active**.

A default-off, exact-fixture-only test-migrator process is prepared with dry-run, worker/User
locking, bounded transactional deletes, deadline/backlog metrics and idempotent repeat runs.
It cannot purge User B, the primary account or existing non-fixture users. Shared Terms and
active rate counters are retained; unsupported relationships/real acceptance retention block
rather than inventing legal holds. No grant/migration is added or executed. Production
cleanup authority, real-acceptance retention, backups/restore and daily monitoring remain
unresolved. No scheduler or Stage 2 PostgreSQL/evidence result has been claimed.
