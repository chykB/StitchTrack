# Task Five: sessions

## Scope and implementation

The internal [session service](../../lib/product-auth/session.server.ts) reuses Better Auth 1.7.7, Prisma/PostgreSQL and the registration Argon2id implementation. Login canonicalizes ASCII email and preserves passwords exactly. Unknown accounts, incorrect credentials and unverified accounts share a generic rejection. A verified identity does not authorize access to a tailoring business.

Better Auth generates a fresh cryptographically random opaque bearer token for every successful login. The browser retains that token in the library's signed cookie. The [public adapter wrapper](../../lib/product-auth/session-adapter.server.ts) stores only a deterministic, domain-separated HMAC-SHA-256 digest in `product.Session.token`, using an independent 32-byte server key. Token predicates are digested once; token-directed results restore only the caller's original bearer for library cookie/expiry semantics. Digests cannot be used as bearer tokens. No plaintext fallback or existing-row conversion is enabled.

This implements the owner's interpretation of "The session cookie hashed": digest-only persistence of the browser bearer. Signing, hashing and encryption are distinct. The cookie's HMAC signature prevents tampering but does not conceal its bearer; the database HMAC is a nonreversible lookup/revocation value. The session cookie is not encrypted. OTP-verifier and outbox-encryption keys are not reused.

## Historical owner-executed PostgreSQL results

Provenance: owner-reported successful execution of the [committed-session harness](../../tests/product-auth/session.integration.mjs), using only `stitchtrack_product_test`, schema `product`, runtime `stitchtrack_product_test_app`. Run ID: `efa712f4-94f6-431a-958a-bc2decb8f893`. Integration exit status: **0**. Both database connections closed successfully. This update did not rerun or independently observe the database test.

| Check | Owner-confirmed result |
| --- | --- |
| Invalid credentials and unverified account | Login refused. |
| Two successful logins | Distinct random session tokens and distinct stored digests. |
| Persistence | Sessions committed to PostgreSQL with digest-only token storage. |
| Independent connection | Original cookie-based lookup succeeded through a separate database connection. |
| Individual logout | Its session was revoked while the other session remained usable. |
| Expiry | Expired session access was rejected and the expiry path passed. |
| User-wide revocation | Remaining sessions were revoked. |
| Connection lifecycle | Both connections closed successfully. |

The harness creates explicitly synthetic session-test identities; its verified fixture is not evidence of an actual email verification journey, approved Terms acceptance or account onboarding. No SMTP, public route or browser flow is exercised. Test lifetimes of 600 seconds and a one-second expiry probe are test settings, not an approved tailor policy.

The owner then executed the separately reviewed [cleanup SQL](../../prisma/product/setup/session-test-cleanup.sql) for this run. PostgreSQL reported the exact synthetic fixtures removed; **DO and COMMIT completed, cleanup exit status 0**. The run's fixtures are no longer pending cleanup. UUID-derived identities, exact name/email/credential checks and absence of Terms/issuance relationships restrict deletion to that synthetic run; historical fixtures and assessment evidence are preserved.

These are result summaries, not verbatim terminal transcripts. No raw tokens, digests, passwords, keys, cookies, screenshots or unreported execution dates are added. The [product runbook](../../prisma/product/session-postgres-verification.md) retains the procedure and earlier guard-failure history; completed commands must not be repeated to recreate evidence.

## Session fixation, hijacking and damage limitation

Session fixation means making a victim use an identifier chosen or known before login. The installed Better Auth createSession path generates a new 32-character alphanumeric bearer with crypto.getRandomValues for each login; it does not reuse an incoming cookie token. Invalid or fabricated cookies cannot select a new session identifier. This prevents reuse of a fixed pre-login identifier, but does not protect a stolen valid cookie.

A stolen complete cookie is replayable until the server session expires or is revoked. Digest-only database storage avoids retaining usable bearer material at rest, but does not stop cookie theft, malicious requests from an authenticated browser or compromise of the server and its keys. HMAC signing protects integrity, not confidentiality. TLS, safe rendering, CSRF/origin checks and abuse controls remain necessary.

The current internal configuration uses HttpOnly, SameSite=Lax, a host-only cookie and Path=/. HttpOnly limits JavaScript cookie access but cannot stop all actions through XSS. Lax reduces some cross-site request risks while allowing ordinary inbound navigation; it is not complete CSRF protection. The loopback HTTP configuration does not set Secure. The service now accepts an explicit local HTTPS origin and sets Secure through Better Auth; offline assertions cover the attributes. The owner previously verified Secure cookie transport with curl over real HTTPS. That is distinct from a browser Secure-cookie capture. Routine Next.js development now permits explicit loopback HTTP; production cannot enable this exception, and deployment-specific HTTPS/proxy trust remains fail-closed.

Lookup bypasses cookie caching and checks current PostgreSQL session state, expiry and verified credential identity. Individual logout deletes by token digest and clears the cookie. Because installed Better Auth signOut can swallow database deletion errors, the service checks that the original cookie no longer resolves before reporting success. User-wide logout deletes by authenticated userId and verifies the result. The existing frontend marks a failed logout as unknown, retains only the last-known presentation identity, and says logout could not be confirmed. It does not claim revocation or discard the cookie in JavaScript. Fresh server lookup resolves uncertainty; a confirmed logout clears presentation identity. Both a request failing before dispatch and a response lost after committed revocation have offline coverage. A real browser network-failure capture remains pending. An absent-session response confirms no current access, not that a failed request itself performed revocation.

The owner now approves a fixed seven-day (604,800-second) tailor lifetime, no automatic renewal, no separate inactivity timeout and no remember-me feature. The guarded HTTP composition enforces that policy; the historical PostgreSQL proof's 600-second and one-second settings are unchanged. Sensitive-action reauthentication remains a later decision. This tailor policy is explicitly approved, independent of the PRD's proposed client duration. The library's 400-day serialization ceiling is a validation limit, not a recommended lifetime. Loss/rotation of the single storage key invalidates old lookups; reviewed multi-key rotation is not implemented.

The adapter transaction callback remains a pass-through, not a database transaction. The [account-access foundation](account-lifecycle.md) makes login and locking own real, transaction-bound User-row operations. Its separately completed owner PostgreSQL proof covers both lock/login orderings, simultaneous access, rollback and pre-commit connection loss. Cookies are released only after successful commit; lost COMMIT acknowledgement remains a separate untested outcome. Ordinary logout is unchanged and is not an atomic barrier against concurrent new login. Password reset must later update credentials and revoke sessions with reviewed real transaction/concurrency handling; account deletion must lock access immediately and revoke sessions without discarding protected business history.

## Current HTTP and protected-session boundary

The three [Next.js Node API handlers](../../pages/api/internal/tailor-session/login.ts)
reuse [the socket/raw-header adapter](../../lib/product-auth/registration-next.server.ts):

| Operation | URL | Result |
| --- | --- | --- |
| Login | POST `/api/internal/tailor-session/login` | Validated canonical email and exact password; generic 401 for wrong/unknown/unverified/locked identities; fresh session and signed cookie after commit. |
| Lookup | GET `/api/internal/tailor-session/session` | Fresh database-backed identity/expiry, or 401. Missing, altered, expired, revoked, disabled and deletion-locked sessions cannot authorize. No renewal. |
| Logout | POST `/api/internal/tailor-session/logout` | Current-session deletion and expired cookie after confirmed revocation. Failure/uncertainty returns no success or cookie-clearing response. |

These routes remain default-off, production-refused and explicitly local-development-only.
The reviewed normal Next.js loopback HTTP mode uses actual socket metadata, exact Host,
Origin/CSRF checks and PostgreSQL account/IP budgets. Arbitrary forwarded headers are
rejected. Neither the legacy gateway nor a synthetic browser fixture is required for
routine development. See the [current setup](../../prisma/product/registration-workflow.md#owner-run-next-only-local-browser-test).
All product Prisma pools are now pinned to UTC; restart Next.js after that correction.
The owner reports a successful real registration -> SMTP email delivery -> OTP verification
-> login -> authenticated session-recognition browser journey against `stitchtrack_product_test`.
No new date, transcript, logout result or screenshot is inferred from that report.

The session endpoint is the existing protected identity boundary. The server's
`requireBusinessSession` helper distinguishes unauthenticated 401 from an authenticated
identity lacking separately checked business permission (403). No implemented business
route, administrative role or dashboard is claimed. Frontend state is never authorization.

## Evidence status and owner procedure

Already established: the internal PostgreSQL checkpoint above, the separate account-lock
proof, and the [curl HTTPS checkpoint](../../prisma/product/https-transport-verification.md).
The latest owner-reported browser journey establishes login/session recognition, but no
Task Five evidence files or screenshots are currently present in this directory. Existing
offline tests also cover altered/expired cookies, scoped logout, network uncertainty and
same-cookie-jar identity switching. They do not replace browser/database evidence.

### Latest owner-run browser and read-only diagnostic checkpoint

The owner completed the real Next.js local HTTP registration/email/OTP/login/session
journey stated above. The original Prisma-based session snapshot below **failed**; its
cause and exact failing assertion have not been established here. It is not a successful
snapshot or evidence of absent sessions. The subsequent, separate **read-only PostgreSQL
diagnostic confirmed one session record, one distinct digest and valid digest format**.

That result establishes the reported single-session persistence/format observation. It does
not by itself prove a two-login comparison, cookie flags, seven-day duration, no renewal,
logout revocation, network-failure handling or password reset. Those implementations and
historical internal tests remain distinct from browser captures still to be performed.
No raw diagnostic transcript, session secret, digest value or new screenshot is added.

### Historical Prisma snapshot command (failed owner attempt)

Use only the existing approved product-test runtime configuration and two owner-authorized
verified accounts, A and B. Do not create fixtures, resend OTPs, modify expiry, change locks
or delete historical records for this phase. If B is unavailable, mark the two-user browser
capture pending. Retain existing private keys; never regenerate them for this procedure.

The following command is preserved exactly as the attempted Prisma snapshot. **It failed;
do not rerun it or treat it as the next browser-test prerequisite without a separately
reviewed correction.** Its intended output used noncredential Session-row fingerprints,
counts and timestamps without revealing the private User ID, email, name, bearer, stored
digest or keys. The successful PostgreSQL diagnostic was a different operation; this block
must not be presented as its command or output. No failure cause is invented here.

```bash
cd /home/bmalik/stitchtrack
set +x
read -r -s -p 'Private product-test User ID for account A: ' task05_user_id
printf '\n'
TASK05_SESSION_USER_ID="$task05_user_id" NODE_ENV=development \
PRODUCT_DATABASE_MODE=test PRODUCT_DATABASE_CONFIRMED=true \
node --env-file=.env.local --env-file-if-exists=.env.development.local \
  --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'TASK05_SESSION_SNAPSHOT'
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from './prisma/product/generated/client.ts';
import {productDatabaseConfig,PRODUCT_PRISMA_CONNECTION_OPTIONS} from './prisma/product/targets.ts';
let client;
try {
  assert.ok(process.env.TASK05_SESSION_USER_ID);
  if (['NODE_DEBUG','DEBUG','RUST_LOG','PRISMA_LOG_LEVEL','PGOPTIONS','PGSERVICE','PGSERVICEFILE'].some(k=>process.env[k])) throw new Error();
  const target=productDatabaseConfig(); assert.equal(target.mode,'test');
  client=new PrismaClient({adapter:new PrismaPg({connectionString:target.url,
    options:PRODUCT_PRISMA_CONNECTION_OPTIONS,max:1,connectionTimeoutMillis:5000,statement_timeout:5000},
    {schema:'product',onConnectionError:()=>{},onPoolError:()=>{}}),log:[]});
  const snapshot=await client.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [identity]=await tx.$queryRaw`SELECT current_database() AS database,current_user AS role,
      to_regnamespace('product')::text AS namespace,current_setting('TimeZone') AS timezone,
      current_setting('transaction_read_only') AS read_only`;
    assert.deepEqual(identity,{database:target.database,role:target.user,namespace:'product',timezone:'UTC',read_only:'on'});
    const user=await tx.user.findUnique({where:{id:process.env.TASK05_SESSION_USER_ID},
      select:{id:true,emailVerified:true,disabledAt:true,deletionRequestedAt:true}});
    assert.ok(user?.emailVerified && !user.disabledAt && !user.deletionRequestedAt);
    const [counts]=await tx.$queryRaw`SELECT count(*)::int AS rows,
      count(DISTINCT "token")::int AS distinct_digests
      FROM product."Session" WHERE "userId"=${user.id}`;
    const rows=await tx.$queryRaw`SELECT "id","createdAt","expiresAt",
      "token" ~ '^hmac-sha256:v1:[0-9a-f]{64}$' AS digest_only
      FROM product."Session" WHERE "userId"=${user.id} ORDER BY "createdAt","id"`;
    assert.equal(counts.rows,rows.length); assert.equal(counts.distinct_digests,rows.length);
    assert.ok(rows.every(row=>row.digest_only));
    return {readOnly:true,sessionCount:counts.rows,distinctStoredDigests:counts.distinct_digests,
      sessions:rows.map(row=>({label:createHash('sha256').update('task05/session-row/v1\0'+row.id).digest('hex').slice(0,16),
        createdAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),
        lifetimeSeconds:(row.expiresAt-row.createdAt)/1000,digestOnly:row.digest_only}))};
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:10000});
  console.log(JSON.stringify(snapshot,null,2));
} catch {console.error('FAIL: guarded read-only session snapshot; no private diagnostic printed.');process.exitCode=1;}
finally {if(client)try{await client.$disconnect();}catch{console.error('FAIL: snapshot connection cleanup.');process.exitCode=1;}}
TASK05_SESSION_SNAPSHOT
task05_snapshot_status=$?
unset task05_user_id
printf 'session_snapshot_exit=%s\n' "$task05_snapshot_status"
```

A failed snapshot is not evidence of successful persistence/revocation. Preserve its fixed
failure status and investigate privately. It never modifies sessions, including expired
ones. The snapshot uses repeatable-read consistency and the UTC startup option; it does
not perform a Prisma Date-only round-trip check.

### Remaining capture plan (owner review/execution still required)

Before continuing the comparisons below, review a working, guarded read-only PostgreSQL
capture procedure that can distinguish baseline and new sessions without revealing secrets.
The completed one-session diagnostic is not a baseline/row-label transcript, and the failed
Prisma block above is not a working capture prerequisite. Do not improvise queries or
repeat failed commands to manufacture evidence.

1. Use the existing opt-in local app (`npm run dev`) and retained ignored configuration.
   Registration/email/OTP/login/session recognition is already owner-confirmed; do not
   repeat it just to restate the milestone. Keep one hostname consistently. No gateway,
   new certificate or worker is needed to test already verified accounts. Use the separately
   reviewed read-only capture procedure for a baseline; preserve pre-existing row labels.
2. Use two fresh, independent browser profiles so existing browser cookies are preserved.
   In browser profile 1, log in as A. Capture the sanitized success/identity state and take
   a snapshot. In a separate browser profile, log in as A again and snapshot again. The two
   new labels and stored digests must be distinct, with each new lifetime approximately
   604800 seconds (separate library clock calls can differ by milliseconds).
   Do not display actual identifiers/cookie values. Baseline sessions must remain unchanged.
   Respect any 429 Retry-After; do not reset or bypass counters to complete the capture.
3. In browser cookie storage, capture only cookie **attributes**: HttpOnly, SameSite=Lax,
   host-only (no Domain override), Path=/ and seven-day Max-Age/expiry. Hide/redact Value,
   private account details, request bodies and Cookie/Set-Cookie values before saving.
   HTTP development correctly omits Secure; it cannot prove HTTPS Secure-cookie behavior.
   The existing real HTTPS curl result remains separate. A genuine browser Secure-cookie
   capture needs a separately approved HTTPS environment; do not enable production or
   recreate TLS infrastructure merely to claim this evidence complete.
4. While profile 1 is authenticated, block **only** the logout URL using the browser's
   request-blocking tool, then click Log out. Capture the blocked request status/path and
   the accessible message: logout could not be confirmed, and the identity is only
   previously known. Do not expose headers or payloads. Snapshot again: the row must remain
   because this blocked request never reached the server. This is an actual browser
   network-failure demonstration, not the untested historical broken-UI version.
5. Remove the block, choose Check session and confirm A is still authenticated. Log out
   normally. Capture success and cookie removal/expiry with values hidden; snapshot again:
   profile 1's new row is gone, profile 2 and baseline rows remain. A fresh session lookup
   for profile 1 must return 401. If logout or capture fails, preserve the partial result;
   never claim success or manually delete sessions to make it pass. A response lost after
   server revocation is a different uncertain outcome, covered offline, not demonstrated
   by blocking a request before dispatch.
6. In that **same profile 1**, log in as B, perform Check session/reload and confirm B,
   not A, is shown. Redact personal details and label the captures A/B. Use the normal
   authenticated lookup, not browser-supplied user IDs. Log B out. Authentication alone
   must not show or grant any business's records. Profile 2 should still resolve to A;
   log it out normally and take the final A snapshot. These actions revoke only the
   browser sessions created by this test; do not run historical fixture cleanup.

Do not export a HAR, copy cookie-bearing curl commands, save credentials in the console,
or add raw database/DevTools dumps to evidence. Keep only sanitized observations, status
codes, row labels/counts and actual screenshots. Never invent the failed/logout-success
screens, and never overwrite historical evidence. Official Task Five evidence filenames
and number-to-check mapping have not been supplied here; confirm them before naming the
submission artifacts. No evidence file is generated by this documentation.

## Historical offline verification for the Phase 1 review

152 focused offline tests passed across the session service/adapter, HTTP/Node transport,
account locks, frontend client/controller and accessible form markup. TypeScript, relevant
JavaScript syntax, the documented Bash/Node snippet syntax, local Markdown paths and Git
whitespace checks passed. No database, browser, listener, SMTP or evidence capture ran.
Existing response-loss and same-cookie-jar tests already cover the requested regressions;
no duplicate tests or application changes were added.

## Remaining work outside Phase 1

Password reset with all-device revocation, complete deletion/anonymization/retention/purge,
role-protected business/administrative routes, and the alternative soft-gating demonstration
remain separate phases. The selected product policy remains hard verification gating.
The account-lock foundation is implemented and owner PostgreSQL-verified; it is not a
complete deletion workflow. The [Task Five status table](../README.md#remaining-submission-deliverables)
tracks missing documents, the exact 22-question defence and uncaptured evidence.

Assumptions: none. Owner-reported results are distinguished from unrun captures; this
the original Phase 1 review found no additional session/logout code gap. This status
update is documentation-only and did not rerun tests or owner operations.
