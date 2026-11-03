# Administrator authorization and navigation

This Task Five slice adds a platform capability, not a third V1 user type or a
business membership. Ordinary accounts default to `User.isAdministrator=false`.
Only the owner-controlled test migrator may assign/revoke it; no signup field,
email allowlist, cookie claim, frontend state or public role-management endpoint exists.
The [PRD](../../docs/PRD.md) is unchanged. Administration grants no access to clients,
orders, agreements or other business records.

## Boundary

- [Service](../../lib/product-auth/admin.server.ts): reuse Better Auth session lookup,
  then a real lifecycle transaction and User row lock. Recheck the signed session,
  email verification, account locks and database flag before returning anything.
  Owner role revocation uses the same User lock. No role is cached in the cookie.
- [Page](../../pages/api/internal/tailor-session/admin-page.ts): `/admin` rewrites internally
  to a Node API handler that renders HTML after authorization. There is no Pages Router
  UI/getServerSideProps import of server-only authentication. Responses are `no-store`, with actual
  HTTP 401 for missing/expired/revoked/ineligible sessions and 403 for active ordinary
  users. There is no client-only authorization or redirect masquerading as a refusal.
  The internal API alias enforces the same authorization; it is not a bypass. The small
  fixed presentation script contains no server imports or secrets and is CSP-hash restricted.
- [Action](../../pages/api/internal/tailor-session/admin-summary.ts): exact POST
  `/api/internal/tailor-session/admin-summary`, empty JSON object, strict Origin/CSRF
  checks and the same authorization. Returns only active-session count, pending-deletion
  count and database measurement time. It does not change accounts or sessions.
- The [existing Node transport](../../lib/product-auth/registration-next.server.ts)
  validates original socket/raw headers for both routes, rejects forwarded metadata,
  and keeps the current loopback HTTP/HTTPS policies. Both operations consume the
  existing PostgreSQL session-lookup IP budget (60 capacity, one token/second under
  the approved run-scoped local policy). No new threshold or counter store is introduced.
- Missing configuration/storage/privilege protection returns a sanitized 503; a rate
  denial returns 429 with Retry-After. Disabled routes and all production requests
  return 404. Existing login, seven-day nonrenewing sessions, reset and deletion remain unchanged.

## Existing login and account navigation

Use the ordinary StitchTrack email/password login. After its authoritative session
lookup, the existing signed-in account controls show **Administration** linking to
`/admin` only when the server confirms an eligible administrator. Session lookup
reuses the same transaction-bound role, verification, lock and session checks as the
admin page. It exposes only an optional boolean navigation capability, never a role
claim or session secret. With administration disabled, that capability is omitted.

A session refresh rechecks the database flag; revocation removes the link. Pending,
failed, expired or unauthenticated presentation state hides it. A stale visible link
never authorizes anything: `/admin` and the summary API independently recheck every
request. HTTP 200 has no login link; 401 offers **Return to login**; 403 displays the
access-refused message without suggesting a different login. Existing 404/503 behavior
is preserved.

The owner reports live authorization passed: administrators can access the page and
ordinary users receive 403 for both the exact page URL and summary API. Navigation
changes in this slice still require owner browser verification; no new evidence or
database execution is claimed here.

## Historical owner-only setup sequence (do not blindly rerun)

No database operation or account assignment was performed by the agent.
Review the [fifth migration](../../prisma/product/migrations/20261102_user_administrator/migration.sql)
(SHA-256 `e6fd462d9de12bb85cb749b54f068819b6862213ab2348b7a25747de8c04e665`),
[permission proposal](../../prisma/product/setup/admin-test-permissions.sql) and
[assignment/revocation SQL](../../prisma/product/setup/admin-role-test.sql) before execution.
All accept only `stitchtrack_product_test`, its exact migrator/runtime roles and
`product` history. The first four exact migrations must already be complete; otherwise stop.
Do not rerun historical grants, proofs or cleanup against the new migration state.

The permission proposal replaces the runtime's broad User INSERT with the existing
column list, excluding the new flag; it grants no role UPDATE. Existing SELECT on User
and Session suffices for aggregates. The flag uses `dbgenerated("false")` so Prisma
omits this protected column on ordinary INSERT. An offline test exercises the actual
installed Prisma compiler with a network-disabled driver. Effective INSERT/UPDATE
privilege on the flag causes the admin service and assignment script to fail closed.
Inherited privileges must be reviewed, not bypassed.

Run stages separately, only after owner approval; stop on every nonzero/uncertain result.
Do not put URLs/passwords/keys in command text, evidence or Git.

1. In the existing WSL Node 24 environment, authorize only the new migration:

   ```bash
   cd /home/bmalik/stitchtrack
   set +x
   read -r -s -p 'Private product-test migrator URL: ' task05_migrator_url
   printf '\n'
   env -i PATH="$PATH" CHECKPOINT_DISABLE=1 NODE_ENV=test PRODUCT_DATABASE_MODE=test \
     PRODUCT_DATABASE_CONFIRMED=true PRODUCT_MIGRATION_CONFIRMED=true \
     PRODUCT_PASSWORD_RESET_MIGRATION_CONFIRMED=true PRODUCT_ADMIN_MIGRATION_CONFIRMED=true \
     PRODUCT_TEST_MIGRATION_DATABASE_URL="$task05_migrator_url" \
     ./node_modules/.bin/prisma migrate deploy --config prisma/product/prisma.config.ts
   task05_migration_exit=$?
   unset task05_migrator_url
   printf 'admin_migration_exit=%s\n' "$task05_migration_exit"
   ```

2. After reviewing successful migration/history, apply only the new privilege proposal
   using the existing migrator password prompt:

   ```bash
   env -i PATH="$PATH" PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
     /usr/lib/postgresql/16/bin/psql --no-psqlrc --password \
     --host=127.0.0.1 --port=5432 --dbname=stitchtrack_product_test \
     --username=stitchtrack_product_test_migrator \
     --file=prisma/product/setup/admin-test-permissions.sql
   printf 'admin_permissions_exit=%s\n' "$?"
   ```

3. Select and explicitly approve one existing active, verified password-based test
   account. Privately supply its exact User ID; never choose by email matching in code:

   ```bash
   set +x
   read -r -s -p 'Owner-approved product-test administrator User ID: ' task05_admin_id
   printf '\n'
   env -i PATH="$PATH" PGSSLMODE=disable PGCONNECT_TIMEOUT=5 PGPASSFILE=/dev/null \
     /usr/lib/postgresql/16/bin/psql --no-psqlrc --password \
     --host=127.0.0.1 --port=5432 --dbname=stitchtrack_product_test \
     --username=stitchtrack_product_test_migrator \
     --set=admin_assignment_confirmed=true --set=admin_user_id="$task05_admin_id" \
     --set=admin_action=grant --file=prisma/product/setup/admin-role-test.sql
   printf 'admin_assignment_exit=%s\n' "$?"
   unset task05_admin_id
   ```

   The script locks only that User, requires the existing credential and verified/unlocked
   state, changes only its flag, and prints no identity/hash. Revoke with the same separately
   approved command and exact ID, replacing `admin_action=grant` with `admin_action=revoke`.
   Revocation also works for a disabled/deletion-locked admin. It grants no runtime privileges.

4. The isolated client was generated offline for this proposal. After any checkout/schema
   change, regenerate it with the existing product `generate --config prisma/product/prisma.config.ts`
   command before runtime. With the existing reviewed local session configuration, restart
   the normal Next server with `ENABLE_PRODUCT_ADMIN_HTTP=true npm run dev`. The flag is
   false in `.env.example`, requires the existing session opt-in, and cannot enable production.
   Do not create new credentials, start a gateway or change session keys for this test.

## Evidence 16: exact URL and direct API refusal

Use two existing eligible test accounts in separate browser profiles: the explicitly
assigned administrator and an ordinary verified tailor. No assessment account is created
by these instructions. Each login creates its normal independently revocable session.

1. Log in through the existing normal form as admin. In the signed-in account controls,
   select **Administration** to open `http://127.0.0.1:3000/admin`. Expect HTTP 200
   without a Return to login link. Select
   **Update security summary**; expect an actual POST 200 with numeric aggregates.
2. Log in as ordinary tailor; confirm no Administration link appears. Copy that exact URL into the address bar. Expect the server's
   **HTTP 403** and "Access refused. Administrator permission is required." No summary
   or action button should be delivered. Capture the address, denial and Network status as
   `../evidence/16-admin-route-refused.png`, only if that file does not already exist.
3. As that same ordinary user, directly invoke the action from the same-origin console:

   ```javascript
   const result = await fetch('/api/internal/tailor-session/admin-summary', {
     method: 'POST', credentials: 'same-origin',
     headers: {'content-type': 'application/json'}, body: '{}'
   });
   console.log(result.status, await result.json());
   ```

   Expect 403 and `{error:"forbidden"}`. With no authenticated session, both routes must
   return 401. Do not capture Cookie/Set-Cookie headers, storage panes, personal emails,
   credentials or session material. A default-off 404 is not non-admin refusal evidence.
4. After review, disable the flag/restart and separately revoke the exact test role if
   it is no longer needed. No blanket cleanup or historical-record deletion is required.

## Remaining limits

Offline tests demonstrate control flow, not actual PostgreSQL grants, browser routing
or evidence capture. The new account-navigation workflow still needs owner browser verification. The
following historical setup commands are references, not instructions to repeat completed
migrations, grants or assignments. Existing private fingerprint receipts
captured before this schema change can fail closed after it; preserve them and investigate,
never rewrite snapshots to force cleanup.

This is local/test-only platform administration. Production ingress, production rate
policy, administrator provisioning/recovery and durable administrator audit policy require
separate review. It does not implement business roles, staff permissions or account suspension
UI, and does not change approved legal-policy candidates or public registration status.
